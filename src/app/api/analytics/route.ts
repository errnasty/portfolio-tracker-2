import { NextRequest, NextResponse } from 'next/server'

const YF_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com',
  'Origin': 'https://finance.yahoo.com',
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url: string, timeoutMs = 9000): Promise<any> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: YF_HEADERS, signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(t)
  }
}

export interface TickerAnalytics {
  ticker: string
  quoteType: string // EQUITY | ETF | MUTUALFUND | INDEX | UNKNOWN
  longName?: string
  // For equities
  country?: string
  sector?: string
  industry?: string
  // For ETFs / funds
  category?: string
  fundFamily?: string
  sectorWeightings?: Record<string, number> // sector -> weight (0..1)
  topHoldings?: { symbol: string; name: string; weight: number }[]
}

// ── Strategy 1: search API — gives quoteType, exchange, longname reliably ──
async function trySearch(ticker: string): Promise<Partial<TickerAnalytics> | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=5&newsCount=0`
    const data = await fetchJson(url)
    const match = (data?.quotes ?? []).find(
      (q: any) => q.symbol?.toUpperCase() === ticker.toUpperCase(),
    )
    if (!match) return null
    const quoteType: string = match.quoteType ?? 'UNKNOWN'
    const result: Partial<TickerAnalytics> = {
      quoteType,
      longName: match.longname ?? match.shortname,
      industry: match.industry,
      sector: match.sector,
    }
    return result
  } catch {
    return null
  }
}

// ── Strategy 2: quoteSummary — gives sector weightings + country (best-effort) ──
async function tryQuoteSummary(ticker: string): Promise<Partial<TickerAnalytics> | null> {
  const modules = ['summaryProfile', 'topHoldings', 'fundProfile', 'quoteType', 'price'].join(',')
  for (const domain of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const url = `https://${domain}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`
      const data = await fetchJson(url)
      const result = data?.quoteSummary?.result?.[0]
      if (!result) continue

      const summaryProfile = result.summaryProfile ?? {}
      const fundProfile = result.fundProfile ?? {}
      const topHoldingsMod = result.topHoldings ?? {}
      const price = result.price ?? {}
      const quoteType: string =
        result.quoteType?.quoteType ?? price.quoteType ?? 'EQUITY'

      const sectorWeightings: Record<string, number> = {}
      const sw: any[] = topHoldingsMod.sectorWeightings ?? []
      for (const item of sw) {
        if (item && typeof item === 'object') {
          for (const k of Object.keys(item)) {
            const v = item[k]?.raw
            if (typeof v === 'number') sectorWeightings[k] = v
          }
        }
      }

      const topHoldings = (topHoldingsMod.holdings ?? [])
        .map((h: any) => ({
          symbol: h.symbol ?? '',
          name: h.holdingName ?? h.symbol ?? '',
          weight: h.holdingPercent?.raw ?? 0,
        }))
        .filter((h: any) => h.weight > 0)

      return {
        quoteType,
        longName: price.longName ?? price.shortName,
        country: summaryProfile.country,
        sector: summaryProfile.sector,
        industry: summaryProfile.industry,
        category: fundProfile.categoryName ?? topHoldingsMod.categoryName,
        fundFamily: fundProfile.family,
        sectorWeightings: Object.keys(sectorWeightings).length > 0 ? sectorWeightings : undefined,
        topHoldings: topHoldings.length > 0 ? topHoldings : undefined,
      }
    } catch {
      // try next domain or skip
    }
  }
  return null
}

async function fetchAnalytics(ticker: string): Promise<TickerAnalytics> {
  // Search first — it's the most reliable source for quoteType
  const search = await trySearch(ticker)
  // quoteSummary as enhancement — may fail (often does without crumb)
  const summary = await tryQuoteSummary(ticker).catch(() => null)

  const merged: TickerAnalytics = {
    ticker,
    quoteType:
      summary?.quoteType ??
      search?.quoteType ??
      'UNKNOWN',
    longName: summary?.longName ?? search?.longName,
    country: summary?.country,
    sector: summary?.sector ?? search?.sector,
    industry: summary?.industry ?? search?.industry,
    category: summary?.category,
    fundFamily: summary?.fundFamily,
    sectorWeightings: summary?.sectorWeightings,
    topHoldings: summary?.topHoldings,
  }
  return merged
}

export async function POST(req: NextRequest) {
  try {
    const { tickers } = (await req.json()) as { tickers: string[] }
    if (!tickers || tickers.length === 0) return NextResponse.json({ analytics: {} })

    const analytics: Record<string, TickerAnalytics> = {}

    const BATCH = 3
    for (let i = 0; i < tickers.length; i += BATCH) {
      const batch = tickers.slice(i, i + BATCH)
      await Promise.allSettled(
        batch.map(async (ticker) => {
          try {
            analytics[ticker] = await fetchAnalytics(ticker)
          } catch (err) {
            console.error(`[analytics] ${ticker} failed:`, String(err))
            analytics[ticker] = { ticker, quoteType: 'UNKNOWN' }
          }
        }),
      )
      if (i + BATCH < tickers.length) await sleep(400)
    }

    return NextResponse.json({ analytics })
  } catch (err) {
    console.error('[analytics] route error:', err)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}

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

export interface TickerAnalytics {
  ticker: string
  quoteType: string // EQUITY | ETF | MUTUALFUND | INDEX
  longName?: string
  // For equities
  country?: string
  sector?: string
  industry?: string
  // For ETFs / funds
  category?: string
  fundFamily?: string
  sectorWeightings?: Record<string, number> // sector -> weight (0..1)
  // Top holdings (for ETFs)
  topHoldings?: { symbol: string; name: string; weight: number }[]
}

async function fetchAnalytics(ticker: string): Promise<TickerAnalytics | null> {
  const modules = ['summaryProfile', 'topHoldings', 'fundProfile', 'quoteType', 'price'].join(',')
  for (const domain of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const url = `https://${domain}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 9000)
      try {
        const res = await fetch(url, { headers: YF_HEADERS, signal: controller.signal })
        if (res.status === 429) {
          await sleep(400)
          continue
        }
        if (!res.ok) continue
        const data = await res.json()
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
          ticker,
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
      } finally {
        clearTimeout(t)
      }
    } catch {
      // try next domain
    }
  }
  return null
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
            const data = await fetchAnalytics(ticker)
            if (data) analytics[ticker] = data
            else analytics[ticker] = { ticker, quoteType: 'UNKNOWN' }
          } catch (err) {
            console.error(`[analytics] ${ticker} failed:`, String(err))
            analytics[ticker] = { ticker, quoteType: 'UNKNOWN' }
          }
        }),
      )
      if (i + BATCH < tickers.length) await sleep(500)
    }

    return NextResponse.json({ analytics })
  } catch (err) {
    console.error('[analytics] route error:', err)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}

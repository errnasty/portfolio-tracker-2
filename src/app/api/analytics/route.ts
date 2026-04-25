import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getYahooAuth, invalidateYahooAuth, YAHOO_HEADERS } from '@/lib/yahoo-auth'

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
  sectorWeightings?: Record<string, number> // raw from Yahoo, sums to ~1
  topHoldings?: { symbol: string; name: string; weight: number }[]
  // Derived: country composition for ETFs (from top-holdings + scaled to 100%)
  // For equities, just { [country]: 1 }
  countries?: Record<string, number>
  // Coverage % for ETFs — what fraction of the fund had country data
  countryCoverage?: number
}

// ── Caching ───────────────────────────────────────────────────────────────
// Two layers:
//  1. In-memory per serverless instance (fast, dies on cold start)
//  2. Supabase etf_composition_cache (survives cold starts)
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days — ETF holdings move slowly
const memoryCache = new Map<string, { data: TickerAnalytics; expiresAt: number }>()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const sb =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      })
    : null

async function getCached(ticker: string): Promise<TickerAnalytics | null> {
  const now = Date.now()
  const mem = memoryCache.get(ticker)
  if (mem && mem.expiresAt > now) return mem.data

  if (sb) {
    try {
      const { data } = await sb
        .from('etf_composition_cache')
        .select('data, fetched_at')
        .eq('ticker', ticker)
        .single()
      if (data) {
        const fetchedAt = new Date(data.fetched_at).getTime()
        if (now - fetchedAt < TTL_MS) {
          const td = data.data as TickerAnalytics
          memoryCache.set(ticker, { data: td, expiresAt: fetchedAt + TTL_MS })
          return td
        }
      }
    } catch {
      // ignore cache errors
    }
  }
  return null
}

async function setCached(ticker: string, data: TickerAnalytics) {
  memoryCache.set(ticker, { data, expiresAt: Date.now() + TTL_MS })
  if (sb) {
    try {
      await sb
        .from('etf_composition_cache')
        .upsert({ ticker, data, fetched_at: new Date().toISOString() }, { onConflict: 'ticker' })
    } catch {
      // ignore — memory cache still helps within instance
    }
  }
}

// ── Yahoo fetchers ────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function quoteSummary(ticker: string, modules: string): Promise<any | null> {
  const auth = await getYahooAuth()
  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : ''
  const headers: Record<string, string> = { ...YAHOO_HEADERS, Accept: 'application/json' }
  if (auth?.cookie) headers.Cookie = auth.cookie

  for (const domain of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const url = `https://${domain}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}${crumbParam}`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 9000)
      try {
        const res = await fetch(url, { headers, signal: controller.signal })
        if (res.status === 401 || res.status === 403) {
          invalidateYahooAuth()
          continue
        }
        if (!res.ok) continue
        const data = await res.json()
        const result = data?.quoteSummary?.result?.[0]
        if (result) return result
      } finally {
        clearTimeout(t)
      }
    } catch {
      // try next domain
    }
  }
  return null
}

async function searchOne(ticker: string): Promise<any | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=5&newsCount=0`
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 7000)
    try {
      const res = await fetch(url, {
        headers: { ...YAHOO_HEADERS, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!res.ok) return null
      const data = await res.json()
      return (data?.quotes ?? []).find(
        (q: any) => q.symbol?.toUpperCase() === ticker.toUpperCase(),
      ) ?? null
    } finally {
      clearTimeout(t)
    }
  } catch {
    return null
  }
}

// ── Country lookup for individual stocks (used when deriving ETF country mix) ──
const stockCountryMemo = new Map<string, string | null>()

async function getStockCountry(symbol: string): Promise<string | null> {
  if (!symbol) return null
  const key = symbol.toUpperCase()
  if (stockCountryMemo.has(key)) return stockCountryMemo.get(key) ?? null

  const result = await quoteSummary(symbol, 'summaryProfile')
  const country = result?.summaryProfile?.country ?? null
  stockCountryMemo.set(key, country)
  return country
}

// Derive country breakdown for an ETF from its top-N holdings.
// We sum each holding's weight against its country, then scale up to 100%
// (assumes the long tail of the fund follows the same geographic mix as the
// top holdings — broadly true for diversified ETFs, less so for concentrated).
async function deriveCountriesFromHoldings(
  topHoldings: { symbol: string; weight: number }[],
): Promise<{ countries: Record<string, number>; coverage: number } | null> {
  if (topHoldings.length === 0) return null
  const known: Record<string, number> = {}
  let known_total = 0
  let total = 0
  for (const h of topHoldings) {
    total += h.weight
    const c = await getStockCountry(h.symbol)
    if (c) {
      known[c] = (known[c] ?? 0) + h.weight
      known_total += h.weight
    }
  }
  if (known_total === 0) return null
  // Scale to 1.0
  const scale = 1 / known_total
  const countries: Record<string, number> = {}
  for (const [c, w] of Object.entries(known)) countries[c] = w * scale
  return { countries, coverage: total > 0 ? known_total / total : 0 }
}

// ── Region inference fallback (for ETFs with no top-holdings data) ────────
const SUFFIX_REGION: Record<string, string> = {
  SI: 'Singapore', HK: 'Hong Kong', T: 'Japan', TO: 'Canada', V: 'Canada',
  L: 'United Kingdom', AS: 'Netherlands', PA: 'France', DE: 'Germany',
  F: 'Germany', MI: 'Italy', MC: 'Spain', SW: 'Switzerland', ST: 'Sweden',
  HE: 'Finland', CO: 'Denmark', OL: 'Norway', AX: 'Australia', NZ: 'New Zealand',
  KS: 'South Korea', KQ: 'South Korea', TW: 'Taiwan', BO: 'India', NS: 'India',
  SS: 'China', SZ: 'China',
}

function regionFromCategory(category?: string): string | undefined {
  if (!category) return undefined
  const c = category.toLowerCase()
  if (c.includes('global') || c.includes('world')) return 'Global'
  if (c.includes('emerging')) return 'Emerging Markets'
  if (c.includes('europe')) return 'Europe'
  if (c.includes('china')) return 'China'
  if (c.includes('japan')) return 'Japan'
  if (c.includes('india')) return 'India'
  if (c.includes('asia')) return 'Asia'
  if (c.includes('singapore')) return 'Singapore'
  if (c.includes('uk') || c.includes('united kingdom')) return 'United Kingdom'
  if (c.includes('us ') || c.includes('u.s.') || c.startsWith('us') || c.includes('america') || c.includes('s&p') || c.includes('nasdaq'))
    return 'United States'
  return undefined
}

function regionFromSuffix(ticker: string): string {
  const idx = ticker.lastIndexOf('.')
  if (idx === -1) return 'United States'
  const suffix = ticker.slice(idx + 1).toUpperCase()
  return SUFFIX_REGION[suffix] ?? 'Unknown'
}

// ── Main fetch + assemble ─────────────────────────────────────────────────
async function fetchAnalytics(ticker: string): Promise<TickerAnalytics> {
  const cached = await getCached(ticker)
  if (cached) return cached

  // Fire search + quoteSummary in parallel — search gives us a quoteType
  // even when quoteSummary fails.
  const [searchResult, summary] = await Promise.all([
    searchOne(ticker),
    quoteSummary(ticker, 'summaryProfile,topHoldings,fundProfile,quoteType,price'),
  ])

  const profile = summary?.summaryProfile ?? {}
  const fund = summary?.fundProfile ?? {}
  const top = summary?.topHoldings ?? {}
  const price = summary?.price ?? {}
  const quoteType: string =
    summary?.quoteType?.quoteType ??
    price.quoteType ??
    searchResult?.quoteType ??
    'UNKNOWN'

  // sectorWeightings: array of single-key objects, each with { raw, fmt }
  const sectorWeightings: Record<string, number> = {}
  for (const item of (top.sectorWeightings ?? [])) {
    if (item && typeof item === 'object') {
      for (const k of Object.keys(item)) {
        const v = item[k]?.raw
        if (typeof v === 'number') sectorWeightings[k] = v
      }
    }
  }

  const topHoldings = (top.holdings ?? [])
    .map((h: any) => ({
      symbol: h.symbol ?? '',
      name: h.holdingName ?? h.symbol ?? '',
      weight: h.holdingPercent?.raw ?? 0,
    }))
    .filter((h: any) => h.weight > 0)

  // Country composition
  let countries: Record<string, number> | undefined
  let countryCoverage: number | undefined

  if (quoteType === 'EQUITY' && profile.country) {
    countries = { [profile.country]: 1 }
    countryCoverage = 1
  } else if (
    (quoteType === 'ETF' || quoteType === 'MUTUALFUND') &&
    topHoldings.length > 0
  ) {
    const derived = await deriveCountriesFromHoldings(
      topHoldings.filter((h: any) => h.symbol).slice(0, 10),
    )
    if (derived) {
      countries = derived.countries
      countryCoverage = derived.coverage
    }
  }

  // Final fallbacks if still unknown
  if (!countries) {
    const fallback =
      regionFromCategory(fund.categoryName ?? top.categoryName) ??
      regionFromSuffix(ticker)
    countries = { [fallback]: 1 }
  }

  const data: TickerAnalytics = {
    ticker,
    quoteType,
    longName:
      price.longName ??
      price.shortName ??
      searchResult?.longname ??
      searchResult?.shortname,
    country: profile.country,
    sector: profile.sector ?? searchResult?.sector,
    industry: profile.industry ?? searchResult?.industry,
    category: fund.categoryName ?? top.categoryName,
    fundFamily: fund.family,
    sectorWeightings: Object.keys(sectorWeightings).length > 0 ? sectorWeightings : undefined,
    topHoldings: topHoldings.length > 0 ? topHoldings : undefined,
    countries,
    countryCoverage,
  }

  await setCached(ticker, data)
  return data
}

export async function POST(req: NextRequest) {
  try {
    const { tickers } = (await req.json()) as { tickers: string[] }
    if (!tickers || tickers.length === 0) return NextResponse.json({ analytics: {} })

    const analytics: Record<string, TickerAnalytics> = {}

    // Process serially in small batches. ETF composition needs ~10 sub-fetches
    // for country lookup, so we don't want to spike Yahoo's rate limit.
    const BATCH = 2
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
      if (i + BATCH < tickers.length) await sleep(300)
    }

    return NextResponse.json({ analytics })
  } catch (err) {
    console.error('[analytics] route error:', err)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}

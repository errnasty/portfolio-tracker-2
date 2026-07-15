import type { FundQuote } from '@/types'

// Live precious-metal spot prices, converted to a price-per-unit-weight so
// they slot into the same "custom holding" pricing model as everything else
// — shares on the holding then means "how many of this unit you hold" (e.g.
// 100 for 100 grams). Spot metals are always quoted in USD per troy ounce;
// FundProviderMeta.nativeCurrency='USD' on each metal provider tells
// PortfolioContext to price these holdings in USD regardless of what
// currency the user actually paid in (their cost basis currency is
// independent and converts to base separately, same as e.g. a USD stock
// bought with SGD cash).

export type Metal = 'gold' | 'silver' | 'platinum' | 'palladium'

// [primary ticker, fallback ticker] — the primary is the COMEX futures
// contract (most reliably available on Yahoo without special auth); the
// fallback is the FX-style spot cross.
const METAL_TICKERS: Record<Metal, [string, string]> = {
  gold: ['GC=F', 'XAUUSD=X'],
  silver: ['SI=F', 'XAGUSD=X'],
  platinum: ['PL=F', 'XPTUSD=X'],
  palladium: ['PA=F', 'XPDUSD=X'],
}

const OZ_TROY_IN_GRAMS = 31.1034768

// Grams per unit. 'tael' is the Hong Kong / Singapore gold-market tael (the
// denomination local bullion dealers like UOB use) — double-check against
// your dealer's certificate if they use a different convention. The same
// weight units apply to every metal (silver, platinum, and palladium are
// all conventionally quoted per troy ounce too).
const UNIT_GRAMS: Record<string, number> = {
  gram: 1,
  oz_troy: OZ_TROY_IN_GRAMS,
  tael: 37.4290,
  kg: 1000,
}

export function isKnownWeightUnit(unit: string): boolean {
  return unit in UNIT_GRAMS
}

// Pure conversion — kept separate from the network fetch so it's directly
// unit-testable.
export function pricePerUnit(spotUsdPerOz: number, unit: string): number {
  const grams = UNIT_GRAMS[unit]
  if (!grams) throw new Error(`unknown weight unit "${unit}"`)
  return spotUsdPerOz * (grams / OZ_TROY_IN_GRAMS)
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://finance.yahoo.com',
}

async function fetchChartPrice(ticker: string): Promise<number | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal })
    if (!res.ok) return null
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    const price: number = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? 0
    return price > 0 ? price : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchSpotUsdPerOz(metal: Metal): Promise<number> {
  const [primary, fallback] = METAL_TICKERS[metal]
  for (const ticker of [primary, fallback]) {
    const price = await fetchChartPrice(ticker)
    if (price !== null) return price
  }
  throw new Error(`${metal}: could not fetch a spot price from Yahoo (${primary}, ${fallback})`)
}

// Builds a FundProvider.fetchQuote for the given metal — ref is the weight
// unit ('gram' | 'oz_troy' | 'tael' | 'kg').
export function makeMetalFetcher(metal: Metal) {
  return async function fetchQuote(ref: string): Promise<FundQuote> {
    if (!isKnownWeightUnit(ref)) throw new Error(`${metal}: unknown weight unit "${ref}"`)
    const spotUsdPerOz = await fetchSpotUsdPerOz(metal)
    return {
      price: pricePerUnit(spotUsdPerOz, ref),
      asOf: new Date().toISOString().slice(0, 10),
      name: null,
    }
  }
}

export const fetchGoldQuote = makeMetalFetcher('gold')
export const fetchSilverQuote = makeMetalFetcher('silver')
export const fetchPlatinumQuote = makeMetalFetcher('platinum')
export const fetchPalladiumQuote = makeMetalFetcher('palladium')

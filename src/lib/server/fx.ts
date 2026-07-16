// Shared FX rate fetcher — used by /api/fx (client-facing) and the daily
// cron (server-side fx_cache warm-up). Frankfurter.app: free, no API key,
// ECB reference rates.

export interface FxResult {
  base: string
  rates: Record<string, number>
}

// Approximate static rates pinned to USD — used only if Frankfurter is down.
const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1, SGD: 1.34, EUR: 0.92, GBP: 0.79, JPY: 155, AUD: 1.52, CNY: 7.2,
  HKD: 7.8, MYR: 4.7, IDR: 16200, THB: 36, PHP: 58, INR: 84, KRW: 1380,
  NZD: 1.66, CAD: 1.37, CHF: 0.9,
}

function buildFallback(base: string, symbols: string[]): FxResult {
  // rate(base→X) = rate(USD→X) / rate(USD→base)
  const baseRateUsd = FALLBACK_USD_RATES[base] ?? 1
  const rates: Record<string, number> = { [base]: 1 }
  for (const s of symbols) {
    if (s === base) continue
    const r = FALLBACK_USD_RATES[s]
    if (r) rates[s] = r / baseRateUsd
  }
  return { base, rates }
}

// Frankfurter rejects requests where `to` contains `from`, so the base is
// stripped from symbols before calling out, then re-added with rate 1.
export async function fetchFxRates(base: string, symbols: string[]): Promise<FxResult> {
  const upperBase = base.toUpperCase()
  const requested = symbols.map((s) => s.toUpperCase())
  const toSymbols = requested.filter((s) => s !== upperBase)

  if (toSymbols.length === 0) {
    return { base: upperBase, rates: { [upperBase]: 1 } }
  }

  try {
    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(upperBase)}&to=${encodeURIComponent(toSymbols.join(','))}`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`FX API error ${res.status}`)
    const data = await res.json()

    if (!data?.rates || data.base?.toUpperCase() !== upperBase) {
      throw new Error('FX API returned unexpected base')
    }

    const rates: Record<string, number> = { [upperBase]: 1 }
    for (const k of Object.keys(data.rates)) rates[k.toUpperCase()] = data.rates[k]
    return { base: upperBase, rates }
  } catch (err) {
    console.error('[fx] falling back:', String(err))
    return buildFallback(upperBase, requested)
  }
}

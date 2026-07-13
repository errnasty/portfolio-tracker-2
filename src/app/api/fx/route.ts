import { NextRequest, NextResponse } from 'next/server'

// Frankfurter.app: free, no API key, ECB data (supports USD, SGD, EUR + many more)
// Note: Frankfurter rejects requests where `to` contains `from`, so we must
// strip the base currency from the symbols list before calling out, then
// re-add it with rate 1 in the response.

// Approximate static rates pinned to USD — used only if Frankfurter is down.
const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1,
  SGD: 1.34,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 155,
  AUD: 1.52,
  CNY: 7.2,
  HKD: 7.8,
  MYR: 4.7,
  IDR: 16200,
  THB: 36,
  PHP: 58,
  INR: 84,
  KRW: 1380,
  NZD: 1.66,
  CAD: 1.37,
  CHF: 0.9,
}

function buildFallback(base: string, symbols: string[]) {
  // Convert USD-anchored fallback rates into the requested base.
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const base = (searchParams.get('base') ?? 'USD').toUpperCase()
  const symbolsParam = (searchParams.get('symbols') ?? 'SGD,EUR,USD').toUpperCase()
  const requested = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean)

  // Frankfurter rejects 'to' including 'from' — strip the base out
  const toSymbols = requested.filter((s) => s !== base)

  // If after stripping there's nothing to fetch, the only requested symbol
  // was the base itself.
  if (toSymbols.length === 0) {
    return NextResponse.json({ base, rates: { [base]: 1 } })
  }

  try {
    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(toSymbols.join(','))}`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`FX API error ${res.status}`)
    const data = await res.json()

    // Sanity check: Frankfurter echoes back the base. If it doesn't match
    // (e.g. unsupported currency), fall back to hardcoded conversion.
    if (!data?.rates || data.base?.toUpperCase() !== base) {
      throw new Error('FX API returned unexpected base')
    }

    const rates: Record<string, number> = { [base]: 1 }
    for (const k of Object.keys(data.rates)) {
      rates[k.toUpperCase()] = data.rates[k]
    }
    return NextResponse.json({ base, rates })
  } catch (err) {
    console.error('[fx] falling back:', String(err))
    return NextResponse.json(buildFallback(base, requested))
  }
}

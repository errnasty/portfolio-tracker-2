import type { FundQuote } from '@/types'

// Fetches a fund's latest NAV from Yahoo Finance. Singapore unit trusts
// (LionGlobal, etc.) are listed on Yahoo under Morningstar codes like
// "0P00006G00.SI" — the same reliable chart endpoint the rest of the app
// uses for stocks/ETFs. This replaced an HTML scrape of fund houses' own
// sites, which are JavaScript apps whose NAV never appears in the raw HTML.
//
// `ref` is the Yahoo ticker (e.g. "0P00006G00.SI"). Returns the price plus a
// currency hint so the caller can record the fund in its true currency.

export interface FundQuoteWithCurrency extends FundQuote {
  currency?: string | null
}

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://finance.yahoo.com',
}

export async function fetchYahooFundQuote(ref: string): Promise<FundQuoteWithCurrency> {
  const ticker = ref.trim().toUpperCase()
  if (!ticker) throw new Error('fund: no Yahoo ticker provided')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    let lastErr = ''
    for (const domain of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
      try {
        const url = `https://${domain}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`
        const res = await fetch(url, { headers: YF_HEADERS, signal: controller.signal })
        if (!res.ok) { lastErr = `HTTP ${res.status}`; continue }
        const data = await res.json()
        const meta = data?.chart?.result?.[0]?.meta
        const price: number = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? meta?.previousClose ?? 0
        if (!(price > 0)) { lastErr = 'no price in response'; continue }
        const asOf = meta?.regularMarketTime
          ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10)
        return {
          price,
          asOf,
          name: (meta?.longName ?? meta?.shortName ?? null) as string | null,
          currency: (meta?.currency ?? null) as string | null,
        }
      } catch (e) {
        lastErr = String((e as Error).message ?? e)
      }
    }
    throw new Error(`fund: could not fetch "${ticker}" from Yahoo (${lastErr}). Check the ticker on finance.yahoo.com.`)
  } finally {
    clearTimeout(timeout)
  }
}

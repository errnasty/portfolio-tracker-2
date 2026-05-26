import { NextRequest, NextResponse } from 'next/server'
import { getYahooAuth, invalidateYahooAuth, YAHOO_HEADERS } from '@/lib/yahoo-auth'
import { computeMetricsFromPrices } from '@/lib/valuation-signals'

export interface ValuationMetrics {
  ticker: string
  price: number
  trailingPE?: number
  forwardPE?: number
  priceToBook?: number
  priceToSales?: number
  dividendYield?: number
  rsi14?: number
  sma50?: number
  sma200?: number
  high52w?: number
  low52w?: number
  drawdownFromHigh?: number
  yearChange?: number
}

async function fetchQuoteSummary(ticker: string): Promise<any | null> {
  const auth = await getYahooAuth()
  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : ''
  const headers: Record<string, string> = { ...YAHOO_HEADERS, Accept: 'application/json' }
  if (auth?.cookie) headers.Cookie = auth.cookie

  for (const domain of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const url = `https://${domain}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail,defaultKeyStatistics,price${crumbParam}`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      try {
        const res = await fetch(url, { headers, signal: controller.signal })
        if (res.status === 401 || res.status === 403) { invalidateYahooAuth(); continue }
        if (!res.ok) continue
        const data = await res.json()
        const result = data?.quoteSummary?.result?.[0]
        if (result) return result
      } finally {
        clearTimeout(t)
      }
    } catch {
      // try next
    }
  }
  return null
}

async function fetch1yChart(ticker: string): Promise<{ closes: number[] }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 9000)
    try {
      const res = await fetch(url, { headers: { ...YAHOO_HEADERS, Accept: 'application/json' }, signal: controller.signal })
      if (!res.ok) return { closes: [] }
      const data = await res.json()
      const result = data?.chart?.result?.[0]
      const adjclose: (number | null)[] = result?.indicators?.adjclose?.[0]?.adjclose ?? []
      const close: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? []
      const merged: number[] = adjclose
        .map((v, i) => v ?? close[i])
        .filter((v): v is number => typeof v === 'number' && v > 0)
      return { closes: merged }
    } finally {
      clearTimeout(t)
    }
  } catch {
    return { closes: [] }
  }
}

async function fetchOne(ticker: string): Promise<ValuationMetrics> {
  const [summary, chart] = await Promise.all([
    fetchQuoteSummary(ticker),
    fetch1yChart(ticker),
  ])

  const detail = summary?.summaryDetail ?? {}
  const stats = summary?.defaultKeyStatistics ?? {}
  const price = summary?.price ?? {}

  const out: ValuationMetrics = {
    ticker,
    price: price?.regularMarketPrice?.raw ?? chart.closes[chart.closes.length - 1] ?? 0,
    trailingPE: detail?.trailingPE?.raw ?? stats?.trailingPE?.raw,
    forwardPE: detail?.forwardPE?.raw ?? stats?.forwardPE?.raw,
    priceToBook: stats?.priceToBook?.raw,
    priceToSales: detail?.priceToSalesTrailing12Months?.raw,
    dividendYield: detail?.dividendYield?.raw ?? detail?.trailingAnnualDividendYield?.raw,
  }

  // Price-derived metrics
  if (chart.closes.length > 0) {
    const m = computeMetricsFromPrices(chart.closes)
    out.rsi14 = m.rsi14
    out.sma50 = m.sma50
    out.sma200 = m.sma200
    out.high52w = m.high52w
    out.low52w = m.low52w
    out.drawdownFromHigh = m.drawdownFromHigh
    out.yearChange = m.yearChange
  }

  return out
}

export async function POST(req: NextRequest) {
  try {
    const { tickers } = (await req.json()) as { tickers: string[] }
    if (!tickers || tickers.length === 0) return NextResponse.json({ metrics: {} })

    const metrics: Record<string, ValuationMetrics> = {}
    const BATCH = 3
    for (let i = 0; i < tickers.length; i += BATCH) {
      const batch = tickers.slice(i, i + BATCH)
      await Promise.allSettled(batch.map(async (ticker) => {
        try {
          metrics[ticker] = await fetchOne(ticker)
        } catch (err) {
          console.error(`[valuation] ${ticker} failed:`, String(err))
          metrics[ticker] = { ticker, price: 0 }
        }
      }))
    }
    return NextResponse.json({ metrics })
  } catch (err) {
    console.error('[valuation] route error:', err)
    return NextResponse.json({ error: 'Failed to fetch valuation metrics' }, { status: 500 })
  }
}

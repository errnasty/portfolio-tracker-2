import { NextRequest, NextResponse } from 'next/server'

// Direct Yahoo Finance v8 chart API — more reliable than the yahoo-finance2
// library in serverless environments (no cookie crumb needed, works on Vercel)
async function fetchYahooQuote(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Referer': 'https://finance.yahoo.com',
      },
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta

    if (!meta || !meta.regularMarketPrice) throw new Error('No price data')

    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice
    const price = meta.regularMarketPrice as number
    const change = price - prevClose
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0

    return {
      price,
      currency: (meta.currency as string) ?? 'USD',
      change,
      changePercent,
      longName: (meta.longName ?? meta.shortName ?? ticker) as string,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tickers } = await req.json() as { tickers: string[] }
    if (!tickers || tickers.length === 0) {
      return NextResponse.json({ quotes: {} })
    }

    const results: Record<string, {
      ticker: string; price: number; currency: string
      change: number; changePercent: number; longName?: string
    }> = {}

    await Promise.allSettled(
      tickers.map(async (ticker) => {
        try {
          const quote = await fetchYahooQuote(ticker)
          results[ticker] = { ticker, ...quote }
        } catch (err) {
          console.error(`Price fetch failed for ${ticker}:`, err)
          results[ticker] = { ticker, price: 0, currency: 'USD', change: 0, changePercent: 0 }
        }
      }),
    )

    return NextResponse.json({ quotes: results })
  } catch (err) {
    console.error('Prices route error:', err)
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 })
  }
}

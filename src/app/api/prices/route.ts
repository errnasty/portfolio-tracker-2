import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from 'yahoo-finance2'

export async function POST(req: NextRequest) {
  try {
    const { tickers } = await req.json() as { tickers: string[] }
    if (!tickers || tickers.length === 0) {
      return NextResponse.json({ quotes: {} })
    }

    const results: Record<string, {
      ticker: string; price: number; currency: string;
      change: number; changePercent: number; longName?: string
    }> = {}

    await Promise.allSettled(
      tickers.map(async (ticker) => {
        try {
          const quote = await yahooFinance.quote(ticker, {}, { validateResult: false }) as any
          results[ticker] = {
            ticker,
            price: quote.regularMarketPrice ?? 0,
            currency: quote.currency ?? 'USD',
            change: quote.regularMarketChange ?? 0,
            changePercent: quote.regularMarketChangePercent ?? 0,
            longName: quote.longName ?? quote.shortName ?? ticker,
          }
        } catch {
          results[ticker] = { ticker, price: 0, currency: 'USD', change: 0, changePercent: 0 }
        }
      }),
    )

    return NextResponse.json({ quotes: results })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { subMonths, subYears, startOfYear, format } from 'date-fns'

function getPeriodStart(period: string): Date {
  const now = new Date()
  switch (period) {
    case '1m':  return subMonths(now, 1)
    case '3m':  return subMonths(now, 3)
    case '6m':  return subMonths(now, 6)
    case 'ytd': return startOfYear(now)
    case '1y':  return subYears(now, 1)
    case '3y':  return subYears(now, 3)
    case '5y':  return subYears(now, 5)
    default:    return subYears(now, 1)
  }
}

async function fetchYahooHistory(
  ticker: string,
  period1: Date,
  period2: Date,
): Promise<{ date: string; close: number }[]> {
  const p1 = Math.floor(period1.getTime() / 1000)
  const p2 = Math.floor(period2.getTime() / 1000)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${p1}&period2=${p2}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com',
      },
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const result = data?.chart?.result?.[0]

    if (!result) throw new Error('No chart data')

    const timestamps: number[] = result.timestamp ?? []
    const adjclose: (number | null)[] = result.indicators?.adjclose?.[0]?.adjclose ?? []
    const close: (number | null)[] = result.indicators?.quote?.[0]?.close ?? []

    return timestamps
      .map((ts, i) => {
        const price = adjclose[i] ?? close[i]
        if (!price) return null
        return { date: format(new Date(ts * 1000), 'yyyy-MM-dd'), close: price }
      })
      .filter((d): d is { date: string; close: number } => d !== null)
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tickersParam = searchParams.get('tickers') ?? ''
    const period = searchParams.get('period') ?? '1y'
    const tickers = tickersParam.split(',').filter(Boolean)

    if (tickers.length === 0) return NextResponse.json({ history: {} })

    const period1 = getPeriodStart(period)
    const period2 = new Date()
    const history: Record<string, { date: string; close: number }[]> = {}

    await Promise.allSettled(
      tickers.map(async (ticker) => {
        try {
          history[ticker] = await fetchYahooHistory(ticker, period1, period2)
        } catch (err) {
          console.error(`History fetch failed for ${ticker}:`, err)
          history[ticker] = []
        }
      }),
    )

    return NextResponse.json({ history })
  } catch (err) {
    console.error('Historical route error:', err)
    return NextResponse.json({ error: 'Failed to fetch historical data' }, { status: 500 })
  }
}

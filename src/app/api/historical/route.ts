import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from 'yahoo-finance2'
import { subMonths, subYears, startOfYear, format } from 'date-fns'

function getPeriodStart(period: string): Date {
  const now = new Date()
  switch (period) {
    case '1m': return subMonths(now, 1)
    case '3m': return subMonths(now, 3)
    case '6m': return subMonths(now, 6)
    case 'ytd': return startOfYear(now)
    case '1y': return subYears(now, 1)
    case '3y': return subYears(now, 3)
    case '5y': return subYears(now, 5)
    default: return subYears(now, 1)
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
          const data = await yahooFinance.historical(ticker, {
            period1,
            period2,
            interval: '1d',
          }, { validateResult: false })

          history[ticker] = (data as any[])
            .filter((d: any) => d.adjclose != null || d.close != null)
            .map((d: any) => ({
              date: format(new Date(d.date), 'yyyy-MM-dd'),
              close: d.adjclose ?? d.close,
            }))
        } catch {
          history[ticker] = []
        }
      }),
    )

    return NextResponse.json({ history })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch historical data' }, { status: 500 })
  }
}

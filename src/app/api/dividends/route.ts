import { NextRequest, NextResponse } from 'next/server'

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://finance.yahoo.com',
}

export interface DividendEvent {
  date: string  // YYYY-MM-DD
  amount: number
}

export interface DividendData {
  ticker: string
  currency: string
  events: DividendEvent[]
  ttmPerShare: number   // trailing-12-month dividend per share
}

async function fetchDividends(ticker: string): Promise<DividendData> {
  // 5y of dividend events
  const period2 = Math.floor(Date.now() / 1000)
  const period1 = period2 - 5 * 365 * 24 * 60 * 60
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&period1=${period1}&period2=${period2}&events=div`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch(url, { headers: YF_HEADERS, signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    const currency = result?.meta?.currency ?? 'USD'
    const dividends = result?.events?.dividends ?? {}

    const events: DividendEvent[] = Object.values(dividends)
      .map((e: any) => {
        const date = new Date(e.date * 1000)
        return {
          date: date.toISOString().slice(0, 10),
          amount: e.amount ?? 0,
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))

    // TTM: sum of the past 12 months of dividend payments per share
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 1)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const ttm = events
      .filter((e) => e.date >= cutoffStr)
      .reduce((s, e) => s + e.amount, 0)

    return { ticker, currency, events, ttmPerShare: ttm }
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tickers } = (await req.json()) as { tickers: string[] }
    if (!tickers || tickers.length === 0) return NextResponse.json({ dividends: {} })

    const results: Record<string, DividendData> = {}
    const BATCH = 4
    for (let i = 0; i < tickers.length; i += BATCH) {
      const batch = tickers.slice(i, i + BATCH)
      await Promise.allSettled(
        batch.map(async (ticker) => {
          try {
            results[ticker] = await fetchDividends(ticker)
          } catch (err) {
            console.error(`[dividends] ${ticker} failed:`, String(err))
            results[ticker] = { ticker, currency: 'USD', events: [], ttmPerShare: 0 }
          }
        }),
      )
    }
    return NextResponse.json({ dividends: results })
  } catch (err) {
    console.error('[dividends] route error:', err)
    return NextResponse.json({ error: 'Failed to fetch dividends' }, { status: 500 })
  }
}

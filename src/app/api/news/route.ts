import { NextRequest, NextResponse } from 'next/server'
import { getYahooAuth, invalidateYahooAuth, YAHOO_HEADERS } from '@/lib/yahoo-auth'

export interface EarningsEvent {
  date: string  // YYYY-MM-DD
  type: 'earnings' | 'ex_dividend'
  estimate?: number
  actual?: number
}

export interface NewsItem {
  title: string
  publisher: string
  link: string
  publishedAt: string  // ISO
}

export interface TickerNews {
  ticker: string
  earnings: EarningsEvent[]
  news: NewsItem[]
}

async function fetchEarnings(ticker: string): Promise<EarningsEvent[]> {
  const auth = await getYahooAuth()
  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : ''
  const headers: Record<string, string> = { ...YAHOO_HEADERS, Accept: 'application/json' }
  if (auth?.cookie) headers.Cookie = auth.cookie

  for (const domain of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const url = `https://${domain}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=calendarEvents,earnings${crumbParam}`
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      try {
        const res = await fetch(url, { headers, signal: controller.signal })
        if (res.status === 401 || res.status === 403) { invalidateYahooAuth(); continue }
        if (!res.ok) continue
        const data = await res.json()
        const result = data?.quoteSummary?.result?.[0]
        if (!result) continue

        const out: EarningsEvent[] = []

        // Upcoming earnings
        const cal = result.calendarEvents?.earnings
        if (cal?.earningsDate?.length > 0) {
          const ed = cal.earningsDate[0]
          if (ed?.fmt) out.push({ date: ed.fmt, type: 'earnings', estimate: cal.earningsAverage?.raw })
        }
        if (cal?.exDividendDate?.fmt) out.push({ date: cal.exDividendDate.fmt, type: 'ex_dividend' })

        // Past earnings (last 4 quarters)
        const hist = result.earnings?.earningsChart?.quarterly ?? []
        for (const q of hist.slice(-2)) {
          if (q.date) {
            out.push({
              date: q.date,
              type: 'earnings',
              estimate: q.estimate?.raw,
              actual: q.actual?.raw,
            })
          }
        }
        return out
      } finally {
        clearTimeout(t)
      }
    } catch {
      // try next domain
    }
  }
  return []
}

async function fetchNews(ticker: string): Promise<NewsItem[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=6&quotesCount=0`
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(url, {
        headers: { ...YAHOO_HEADERS, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!res.ok) return []
      const data = await res.json()
      const news = (data?.news ?? []) as any[]
      return news.slice(0, 6).map((n: any) => ({
        title: n.title ?? '',
        publisher: n.publisher ?? '',
        link: n.link ?? '',
        publishedAt: n.providerPublishTime
          ? new Date(n.providerPublishTime * 1000).toISOString()
          : '',
      })).filter((n) => n.title && n.link)
    } finally {
      clearTimeout(t)
    }
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tickers } = (await req.json()) as { tickers: string[] }
    if (!tickers || tickers.length === 0) return NextResponse.json({ data: {} })

    const data: Record<string, TickerNews> = {}
    const BATCH = 3
    for (let i = 0; i < tickers.length; i += BATCH) {
      const batch = tickers.slice(i, i + BATCH)
      await Promise.allSettled(batch.map(async (ticker) => {
        const [earnings, news] = await Promise.all([fetchEarnings(ticker), fetchNews(ticker)])
        data[ticker] = { ticker, earnings, news }
      }))
    }
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[news] route error:', err)
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 })
  }
}

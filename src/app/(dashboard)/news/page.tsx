'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, ExternalLink, TrendingUp, Coins } from 'lucide-react'
import type { TickerNews } from '@/app/api/news/route'

export default function NewsPage() {
  const { enriched, loading: portfolioLoading } = usePortfolio()
  const [data, setData] = useState<Record<string, TickerNews>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (enriched.length === 0) return
    setLoading(true)
    fetch('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: enriched.map((h) => h.ticker) }),
    })
      .then((r) => r.json())
      .then((d) => setData(d.data ?? {}))
      .catch((e) => console.error('News fetch failed:', e))
      .finally(() => setLoading(false))
  }, [enriched.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Earnings calendar — flatten upcoming events across tickers, sort by date
  const earningsCalendar = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const events: { ticker: string; name?: string | null; date: string; type: string; estimate?: number; actual?: number }[] = []
    for (const h of enriched) {
      const d = data[h.ticker]
      if (!d) continue
      for (const e of d.earnings) {
        if (e.date >= today) {
          events.push({ ticker: h.ticker, name: h.name, date: e.date, type: e.type, estimate: e.estimate, actual: e.actual })
        }
      }
    }
    return events.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 20)
  }, [enriched, data])

  // Combined news feed — sorted by published date
  const allNews = useMemo(() => {
    const items: { ticker: string; item: TickerNews['news'][number] }[] = []
    for (const h of enriched) {
      const d = data[h.ticker]
      if (!d) continue
      for (const n of d.news) items.push({ ticker: h.ticker, item: n })
    }
    return items
      .sort((a, b) => b.item.publishedAt.localeCompare(a.item.publishedAt))
      .slice(0, 30)
  }, [enriched, data])

  const initialLoading = portfolioLoading || (loading && Object.keys(data).length === 0)

  if (!portfolioLoading && enriched.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold">News &amp; Earnings</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Add holdings to see news and earnings.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">News &amp; Earnings</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Upcoming earnings, ex-dividend dates, and headlines for your holdings
        </p>
      </div>

      {/* Earnings calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Upcoming events
          </CardTitle>
          <CardDescription>Earnings releases and ex-dividend dates across your portfolio</CardDescription>
        </CardHeader>
        <CardContent>
          {initialLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : earningsCalendar.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events found.</p>
          ) : (
            <div className="space-y-1.5">
              {earningsCalendar.map((e, i) => {
                const daysOut = Math.round((new Date(e.date).getTime() - Date.now()) / 86400000)
                const Icon = e.type === 'earnings' ? TrendingUp : Coins
                return (
                  <div key={i} className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-sm">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{e.ticker}</span>
                      {e.name && <span className="text-xs text-muted-foreground ml-2 truncate">{e.name}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">{e.type.replace('_', ' ')}</span>
                    <span className="text-xs tabular-nums whitespace-nowrap">
                      {e.date}
                      <span className="text-muted-foreground ml-2">({daysOut === 0 ? 'today' : `${daysOut}d`})</span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* News feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Headlines</CardTitle>
          <CardDescription>Recent news mentioning your holdings (Yahoo Finance)</CardDescription>
        </CardHeader>
        <CardContent>
          {initialLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : allNews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent news available.</p>
          ) : (
            <div className="divide-y divide-border">
              {allNews.map((n, i) => {
                const when = n.item.publishedAt
                  ? new Date(n.item.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : ''
                return (
                  <a
                    key={i}
                    href={n.item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-3 py-2.5 transition-colors hover:bg-accent/30 -mx-2 px-2 rounded-md"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-snug">{n.item.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono">{n.ticker}</span>
                        <span>·</span>
                        <span>{n.item.publisher}</span>
                        {when && <><span>·</span><span>{when}</span></>}
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-1" />
                  </a>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FileText } from 'lucide-react'
import { buildPortfolioNarrative } from '@/lib/portfolio-narrative'
import type { TickerAnalytics } from '@/app/api/analytics/route'
import type { Currency, EnrichedHolding, PortfolioStats } from '@/types'

interface Props {
  enriched: EnrichedHolding[]
  stats: PortfolioStats | null
  baseCurrency: Currency
}

// Plain-English portfolio narrative built deterministically from the
// existing analytics — no LLM, no API key, no per-render cost.
export function PortfolioSummaryWidget({ enriched, stats, baseCurrency }: Props) {
  const [analytics, setAnalytics] = useState<Record<string, TickerAnalytics>>({})

  useEffect(() => {
    if (enriched.length === 0) return
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: enriched.map((h) => h.ticker) }),
    })
      .then((r) => r.json())
      .then((data) => setAnalytics(data.analytics ?? {}))
      .catch(() => { /* widget falls back gracefully without analytics */ })
  }, [enriched.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const paragraphs = useMemo(() => {
    if (!stats) return []
    return buildPortfolioNarrative({ enriched, stats, baseCurrency, analytics })
  }, [enriched, stats, baseCurrency, analytics])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent" /> Portfolio summary
        </CardTitle>
        <CardDescription>Plain-English read of your current allocation, returns, and concentration.</CardDescription>
      </CardHeader>
      <CardContent>
        {paragraphs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="space-y-3">
            {paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-foreground/90">{p}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

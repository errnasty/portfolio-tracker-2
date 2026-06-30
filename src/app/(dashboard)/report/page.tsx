'use client'

import { useEffect, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { Button } from '@/components/ui/button'
import { Printer, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import {
  geographicBreakdown, sectorBreakdown, currencyBreakdown,
  concentrationMetrics, lookThroughStocks,
} from '@/lib/analytics'
import { formatCurrency, formatPercent, gainLossColor } from '@/lib/utils'
import type { TickerAnalytics } from '@/app/api/analytics/route'
import type { Currency } from '@/types'

export default function ReportPage() {
  const { enriched, stats, settings, transactions } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency
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
      .catch(() => { /* render with empty */ })
  }, [enriched.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (enriched.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Report</h1>
        <p className="text-sm text-muted-foreground">No holdings to report.</p>
      </div>
    )
  }

  const geo = geographicBreakdown(enriched, analytics)
  const sec = sectorBreakdown(enriched, analytics)
  const cur = currencyBreakdown(enriched, analytics)
  const conc = concentrationMetrics(enriched)
  const lt = lookThroughStocks(enriched, analytics)

  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  // Last 12m dividend income from transaction log
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const divs12m = transactions.filter((t) => t.type === 'dividend' && t.date >= cutoffStr)
    .reduce((s, t) => s + t.amount, 0)

  return (
    <div className="space-y-6 print:space-y-3">
      {/* Toolbar — hidden in print */}
      <div className="flex items-center justify-between print:hidden">
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
          </Button>
        </Link>
        <Button onClick={() => window.print()} size="sm">
          <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / Save as PDF
        </Button>
      </div>

      <div className="report-content space-y-6 print:space-y-4">
        {/* Header */}
        <div className="border-b border-border pb-3">
          <h1 className="text-2xl md:text-3xl font-bold">Portfolio Report</h1>
          <p className="text-sm text-muted-foreground">As of {today} · base currency {base}</p>
        </div>

        {/* Summary stats */}
        <Section title="Summary">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryStat label="Total value" value={formatCurrency(stats?.totalValue ?? 0, base)} />
            <SummaryStat label="Cost basis" value={formatCurrency(stats?.totalCost ?? 0, base)} />
            <SummaryStat label="Total return"
              value={formatPercent(stats?.totalGainLossPct ?? 0)}
              valueColor={gainLossColor(stats?.totalGainLoss ?? 0)} />
            <SummaryStat label="Holdings" value={enriched.length.toString()} />
            <SummaryStat label="HHI" value={conc.hhi.toFixed(0)} />
            <SummaryStat label="Effective holdings" value={conc.effectiveHoldings.toFixed(1)} />
            <SummaryStat label="Largest position" value={`${conc.largestPct.toFixed(1)}%`} />
            <SummaryStat label="Dividends (12m)" value={formatCurrency(divs12m, base)} />
          </div>
        </Section>

        {/* Holdings */}
        <Section title="Holdings">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">Ticker</th>
                <th className="py-1.5 font-medium">Name</th>
                <th className="py-1.5 font-medium text-right">Shares</th>
                <th className="py-1.5 font-medium text-right">Value</th>
                <th className="py-1.5 font-medium text-right">%</th>
                <th className="py-1.5 font-medium text-right">Return</th>
              </tr>
            </thead>
            <tbody>
              {[...enriched].sort((a, b) => b.currentValueBase - a.currentValueBase).map((h) => (
                <tr key={h.id} className="border-b border-border/50 last:border-0">
                  <td className="py-1 font-medium">{h.ticker}</td>
                  <td className="py-1 text-xs text-muted-foreground truncate max-w-[200px]">{h.name ?? '—'}</td>
                  <td className="py-1 text-right tabular-nums text-xs">{h.shares.toFixed(2)}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(h.currentValueBase, base)}</td>
                  <td className="py-1 text-right tabular-nums">{h.allocationPct.toFixed(1)}%</td>
                  <td className={`py-1 text-right tabular-nums text-xs ${gainLossColor(h.gainLoss)}`}>{formatPercent(h.gainLossPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* Breakdowns */}
        <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
          <Section title="Geographic (look-through)">
            <BreakdownTable rows={geo.slice(0, 10)} />
          </Section>
          <Section title="Sector (look-through)">
            <BreakdownTable rows={sec.slice(0, 10)} />
          </Section>
          <Section title="Currency (look-through)">
            <BreakdownTable rows={cur.slice(0, 6)} />
          </Section>
          <Section title="Look-through stocks (top 10)">
            <table className="w-full text-xs">
              <tbody>
                {lt.stocks.slice(0, 10).map((s, i) => (
                  <tr key={s.symbol} className="border-b border-border/50 last:border-0">
                    <td className="py-1 text-muted-foreground w-6">{i + 1}.</td>
                    <td className="py-1 font-medium">{s.symbol}</td>
                    <td className="py-1 text-muted-foreground truncate max-w-[120px]">{s.name}</td>
                    <td className="py-1 text-right tabular-nums">{s.pct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>

        <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
          Generated by Portfolio Tracker. This is for informational purposes only and is not financial advice.
        </p>
      </div>

      {/* Print-specific styling */}
      <style jsx global>{`
        @media print {
          aside, nav, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          .report-content { font-size: 11pt; }
          h1 { font-size: 18pt; }
          h2 { font-size: 13pt; }
          table { page-break-inside: auto; }
          tr  { page-break-inside: avoid; page-break-after: auto; }
          .rounded.border { page-break-inside: avoid; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

function SummaryStat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="rounded border border-border p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${valueColor ?? ''}`}>{value}</div>
    </div>
  )
}

function BreakdownTable({ rows }: { rows: { label: string; pct: number }[] }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-border/50 last:border-0">
            <td className="py-1">{r.label}</td>
            <td className="py-1 text-right tabular-nums">{r.pct.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

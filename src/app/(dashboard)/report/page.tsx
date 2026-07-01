'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBar } from '@/components/ui/status-bar'
import { Printer, ArrowLeft, Download } from 'lucide-react'
import Link from 'next/link'
import {
  geographicBreakdown, sectorBreakdown, currencyBreakdown,
  concentrationMetrics, lookThroughStocks,
} from '@/lib/analytics'
import { formatCurrency, formatPercent, gainLossColor } from '@/lib/utils'
import type { TickerAnalytics } from '@/app/api/analytics/route'
import type { Currency } from '@/types'

function thisMonth() { return new Date().toISOString().slice(0, 7) }

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
}
function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ReportPage() {
  const { enriched, stats, settings, transactions } = usePortfolio()
  const { statsForMonth, bankTransactions, categoryById } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency
  const [analytics, setAnalytics] = useState<Record<string, TickerAnalytics>>({})
  const [month, setMonth] = useState(thisMonth())

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

  const hasHoldings = enriched.length > 0
  const geo = hasHoldings ? geographicBreakdown(enriched, analytics) : []
  const sec = hasHoldings ? sectorBreakdown(enriched, analytics) : []
  const cur = hasHoldings ? currencyBreakdown(enriched, analytics) : []
  const conc = hasHoldings ? concentrationMetrics(enriched) : { hhi: 0, effectiveHoldings: 0, largestPct: 0 }
  const lt = hasHoldings ? lookThroughStocks(enriched, analytics) : { stocks: [] }

  const spend = statsForMonth(month)
  const savingsRate = spend.income > 0 ? (spend.net / spend.income) * 100 : 0
  const monthTxns = useMemo(
    () => bankTransactions.filter((t) => t.date.startsWith(month)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [bankTransactions, month],
  )

  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  const monthLabel = new Date(month + '-01').toLocaleDateString(undefined, { year: 'numeric', month: 'long' })

  // Last 12m dividend income from transaction log
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const divs12m = transactions.filter((t) => t.type === 'dividend' && t.date >= cutoffStr).reduce((s, t) => s + t.amount, 0)

  const exportSpendingCsv = () => {
    const rows: (string | number)[][] = [['Date', 'Description', 'Category', 'Amount', 'Currency']]
    for (const t of monthTxns) {
      rows.push([t.date, t.description, t.category_id ? (categoryById[t.category_id]?.name ?? '') : 'Uncategorized', Number(t.amount), t.currency])
    }
    download(`spending-${month}.csv`, toCsv(rows))
  }
  const exportHoldingsCsv = () => {
    const rows: (string | number)[][] = [['Ticker', 'Name', 'Shares', 'CostBasis', 'Price', `Value(${base})`, 'Gain', 'Gain%']]
    for (const h of [...enriched].sort((a, b) => b.currentValueBase - a.currentValueBase)) {
      rows.push([h.ticker, h.name ?? '', h.shares, h.cost_basis_per_share, h.currentPrice, h.currentValueBase.toFixed(2), h.gainLoss.toFixed(2), h.gainLossPct.toFixed(2)])
    }
    download('holdings.csv', toCsv(rows))
  }

  if (!hasHoldings && bankTransactions.length === 0) {
    return (
      <div className="space-y-4">
        <StatusBar screen="REPORT" className="print:hidden" />
        <p className="text-sm text-muted-foreground">Nothing to report yet — add holdings or import spending first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 print:space-y-3">
      <StatusBar screen="REPORT" className="print:hidden" />
      {/* Toolbar — hidden in print */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/dashboard">
          <Button variant="outline" size="sm"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back</Button>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-[150px]" />
          <Button variant="outline" size="sm" onClick={exportSpendingCsv}><Download className="mr-1.5 h-3.5 w-3.5" /> Spending CSV</Button>
          {hasHoldings && <Button variant="outline" size="sm" onClick={exportHoldingsCsv}><Download className="mr-1.5 h-3.5 w-3.5" /> Holdings CSV</Button>}
          <Button onClick={() => window.print()} size="sm"><Printer className="mr-1.5 h-3.5 w-3.5" /> Print / PDF</Button>
        </div>
      </div>

      <div className="report-content space-y-6 print:space-y-4">
        {/* Header */}
        <div className="border-b border-border pb-3">
          <h1 className="text-2xl md:text-3xl font-bold">Monthly Finance Report</h1>
          <p className="text-sm text-muted-foreground">{monthLabel} · generated {today} · base currency {base}</p>
        </div>

        {/* Spending summary */}
        <Section title={`Spending · ${monthLabel}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryStat label="Income" value={formatCurrency(spend.income, base)} valueColor="text-emerald-400" />
            <SummaryStat label="Spent" value={formatCurrency(spend.expense, base)} />
            <SummaryStat label="Net" value={formatCurrency(spend.net, base)} valueColor={gainLossColor(spend.net)} />
            <SummaryStat label="Savings rate" value={`${savingsRate.toFixed(0)}%`} valueColor={savingsRate >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          </div>
          {spend.byCategory.length > 0 && (
            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 font-medium">Category</th>
                  <th className="py-1.5 font-medium text-right">Spent</th>
                  <th className="py-1.5 font-medium text-right">% of spend</th>
                </tr>
              </thead>
              <tbody>
                {spend.byCategory.map((c) => (
                  <tr key={c.category_id ?? 'uncat'} className="border-b border-border/50 last:border-0">
                    <td className="py-1">{c.name}</td>
                    <td className="py-1 text-right tabular-nums">{formatCurrency(c.amount, base)}</td>
                    <td className="py-1 text-right tabular-nums">{spend.expense > 0 ? ((c.amount / spend.expense) * 100).toFixed(1) : '0'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {hasHoldings && (
          <>
            {/* Portfolio summary */}
            <Section title="Portfolio summary">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SummaryStat label="Total value" value={formatCurrency(stats?.totalValue ?? 0, base)} />
                <SummaryStat label="Cost basis" value={formatCurrency(stats?.totalCost ?? 0, base)} />
                <SummaryStat label="Total return" value={formatPercent(stats?.totalGainLossPct ?? 0)} valueColor={gainLossColor(stats?.totalGainLoss ?? 0)} />
                <SummaryStat label="Holdings" value={enriched.length.toString()} />
                <SummaryStat label="HHI" value={conc.hhi.toFixed(0)} />
                <SummaryStat label="Effective holdings" value={conc.effectiveHoldings.toFixed(1)} />
                <SummaryStat label="Largest position" value={`${conc.largestPct.toFixed(1)}%`} />
                <SummaryStat label="Dividends (12m)" value={formatCurrency(divs12m, base)} />
              </div>
            </Section>

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

            <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
              <Section title="Geographic (look-through)"><BreakdownTable rows={geo.slice(0, 10)} /></Section>
              <Section title="Sector (look-through)"><BreakdownTable rows={sec.slice(0, 10)} /></Section>
              <Section title="Currency (look-through)"><BreakdownTable rows={cur.slice(0, 6)} /></Section>
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
          </>
        )}

        <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
          Generated by Finance Console. For informational purposes only — not financial advice.
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

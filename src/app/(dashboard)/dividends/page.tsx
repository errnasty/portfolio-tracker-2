'use client'

import { useEffect, useState, useMemo } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { convertToBase } from '@/lib/calculations'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { Currency } from '@/types'
import type { DividendData } from '@/app/api/dividends/route'

export default function DividendsPage() {
  const { enriched, transactions, fxRates, settings, loading: portfolioLoading } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [dividends, setDividends] = useState<Record<string, DividendData>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (enriched.length === 0) return
    setLoading(true)
    fetch('/api/dividends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: enriched.map((h) => h.ticker) }),
    })
      .then((r) => r.json())
      .then((data) => setDividends(data.dividends ?? {}))
      .catch((err) => console.error('Dividends fetch failed:', err))
      .finally(() => setLoading(false))
  }, [enriched.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const perHolding = useMemo(() => {
    if (!fxRates) return []
    return enriched.map((h) => {
      const data = dividends[h.ticker]
      const ttm = data?.ttmPerShare ?? 0
      const cur = data?.currency ?? h.priceCurrency
      const annualIncomeLocal = ttm * h.shares
      const annualIncomeBase = convertToBase(annualIncomeLocal, cur, fxRates)
      const yieldPct = h.currentPrice > 0 ? (ttm / h.currentPrice) * 100 : 0
      const yieldOnCost = h.cost_basis_per_share > 0 ? (ttm / h.cost_basis_per_share) * 100 : 0
      return {
        ticker: h.ticker,
        name: h.name ?? '',
        shares: h.shares,
        currentValueBase: h.currentValueBase,
        ttmPerShare: ttm,
        annualIncomeBase,
        currency: cur,
        yieldPct,
        yieldOnCost,
        events: data?.events ?? [],
      }
    }).sort((a, b) => b.annualIncomeBase - a.annualIncomeBase)
  }, [enriched, dividends, fxRates])

  const totals = useMemo(() => {
    const totalForwardIncome = perHolding.reduce((s, h) => s + h.annualIncomeBase, 0)
    const totalValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)
    const totalCost = enriched.reduce((s, h) => s + h.costBasisBase, 0)
    const portfolioYield = totalValue > 0 ? (totalForwardIncome / totalValue) * 100 : 0
    const portfolioYoc = totalCost > 0 ? (totalForwardIncome / totalCost) * 100 : 0

    // Realized dividends from transaction log, converted to base
    let received = 0
    if (fxRates) {
      for (const t of transactions) {
        if (t.type === 'dividend') {
          received += convertToBase(t.amount, t.currency, fxRates)
        }
      }
    }

    // 12-month received from txn log
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 1)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    let received12m = 0
    if (fxRates) {
      for (const t of transactions) {
        if (t.type === 'dividend' && t.date >= cutoffStr) {
          received12m += convertToBase(t.amount, t.currency, fxRates)
        }
      }
    }

    return { totalForwardIncome, portfolioYield, portfolioYoc, received, received12m }
  }, [perHolding, enriched, transactions, fxRates])

  // Monthly chart of forward dividend payments by aligning each holding's
  // historical pay-pattern (months it has paid in TTM) and projecting forward
  const monthlyChart = useMemo(() => {
    const map = new Map<string, number>()
    if (!fxRates) return []
    const now = new Date()
    const months: string[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push(key)
      map.set(key, 0)
    }

    for (const h of perHolding) {
      // Use the TTM pattern: which months did each share earn dividends?
      // Project the same months forward.
      const cutoff = new Date()
      cutoff.setFullYear(cutoff.getFullYear() - 1)
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      const ttmEvents = h.events.filter((e) => e.date >= cutoffStr)
      for (const e of ttmEvents) {
        const m = parseInt(e.date.slice(5, 7), 10)
        // Project: same month of upcoming 12-month window
        const projDate = new Date(now.getFullYear(), m - 1, 1)
        if (projDate < new Date(now.getFullYear(), now.getMonth(), 1)) {
          projDate.setFullYear(projDate.getFullYear() + 1)
        }
        const key = `${projDate.getFullYear()}-${String(projDate.getMonth() + 1).padStart(2, '0')}`
        if (!map.has(key)) continue
        const payment = e.amount * h.shares
        const inBase = convertToBase(payment, h.currency, fxRates)
        map.set(key, (map.get(key) ?? 0) + inBase)
      }
    }
    return months.map((m) => {
      const [y, mo] = m.split('-')
      const monthLabel = new Date(parseInt(y, 10), parseInt(mo, 10) - 1, 1).toLocaleDateString('en-US', { month: 'short' })
      return { month: monthLabel, key: m, amount: map.get(m) ?? 0 }
    })
  }, [perHolding, fxRates])

  const initialLoading = portfolioLoading || (loading && Object.keys(dividends).length === 0)

  if (!portfolioLoading && enriched.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold">Dividends</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Add holdings to see dividend tracking.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Dividends</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Trailing income, forward projection, and per-holding yield
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Forward 12m income"
          value={formatCurrency(totals.totalForwardIncome, base)}
          sub="Projected at current rates"
          loading={initialLoading}
        />
        <SummaryCard
          label="Portfolio yield"
          value={formatPercent(totals.portfolioYield, 2)}
          sub="Forward income / value"
          loading={initialLoading}
        />
        <SummaryCard
          label="Yield on cost"
          value={formatPercent(totals.portfolioYoc, 2)}
          sub="Forward income / cost basis"
          loading={initialLoading}
        />
        <SummaryCard
          label="Last 12m received"
          value={formatCurrency(totals.received12m, base)}
          sub={`${formatCurrency(totals.received, base)} all-time`}
          loading={initialLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forward dividend calendar</CardTitle>
          <CardDescription>Projected next-12-month payments based on TTM pattern</CardDescription>
        </CardHeader>
        <CardContent>
          {initialLoading ? <Skeleton className="h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(v) => formatCurrency(v as number, base)}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="amount" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-holding income</CardTitle>
          <CardDescription>TTM dividend per share, forward income at current shares</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {initialLoading ? (
            <div className="space-y-3 p-6">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Ticker</th>
                    <th className="px-4 py-2 font-medium text-right">TTM / share</th>
                    <th className="px-4 py-2 font-medium text-right">Yield</th>
                    <th className="px-4 py-2 font-medium text-right">Yield on cost</th>
                    <th className="px-4 py-2 font-medium text-right">Forward 12m income</th>
                  </tr>
                </thead>
                <tbody>
                  {perHolding.map((h) => (
                    <tr key={h.ticker} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{h.ticker}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{h.name}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {h.ttmPerShare > 0 ? formatCurrency(h.ttmPerShare, h.currency) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">
                        {h.yieldPct > 0 ? formatPercent(h.yieldPct, 2) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">
                        {h.yieldOnCost > 0 ? formatPercent(h.yieldOnCost, 2) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {h.annualIncomeBase > 0 ? formatCurrency(h.annualIncomeBase, base) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({ label, value, sub, loading }: { label: string; value: string; sub: string; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <>
            <div className="text-lg md:text-2xl font-bold tabular-nums">{value}</div>
            <p className="text-xs text-muted-foreground truncate">{sub}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

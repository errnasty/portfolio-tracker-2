'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { TrendingUp, Loader2 } from 'lucide-react'
import { runBacktest, type PriceHistory, type BacktestResult } from '@/lib/backtest'
import { formatPercent } from '@/lib/utils'
import type { EnrichedHolding } from '@/types'
import type { PlannedPosition } from '@/lib/planner'

interface Props {
  positions: PlannedPosition[]
  currentEnriched: EnrichedHolding[]
}

const PERIODS: { label: string; value: string }[] = [
  { label: '1 year', value: '1y' },
  { label: '3 years', value: '3y' },
  { label: '5 years', value: '5y' },
  { label: '10 years', value: '10y' },
]

const REBAL: { label: string; months: number }[] = [
  { label: 'Annually', months: 12 },
  { label: 'Semi-annual', months: 6 },
  { label: 'Quarterly', months: 3 },
  { label: 'Buy & hold', months: 999 },
]

export function PlannerBacktest({ positions, currentEnriched }: Props) {
  const [period, setPeriod] = useState('5y')
  const [rebalMonths, setRebalMonths] = useState(12)
  const [histories, setHistories] = useState<Record<string, PriceHistory>>({})
  const [loading, setLoading] = useState(false)

  const allTickers = useMemo(() => {
    const set = new Set<string>()
    for (const p of positions) if (p.ticker.trim() && p.pct > 0) set.add(p.ticker.toUpperCase().trim())
    for (const h of currentEnriched) set.add(h.ticker)
    return Array.from(set)
  }, [positions, currentEnriched])

  // Fetch histories on period or ticker change
  useEffect(() => {
    if (allTickers.length === 0) return
    setLoading(true)
    fetch(`/api/historical?tickers=${encodeURIComponent(allTickers.join(','))}&period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        const out: Record<string, PriceHistory> = {}
        for (const t of allTickers) {
          out[t] = { ticker: t, series: data.history?.[t] ?? [] }
        }
        setHistories(out)
      })
      .catch((e) => console.error('Backtest history fetch failed:', e))
      .finally(() => setLoading(false))
  }, [allTickers.join(','), period]) // eslint-disable-line react-hooks/exhaustive-deps

  const plannedResult = useMemo(() => {
    return runBacktest(
      positions.map((p) => ({ ticker: p.ticker.toUpperCase().trim(), pct: p.pct })),
      histories,
      rebalMonths,
    )
  }, [positions, histories, rebalMonths])

  const currentResult = useMemo(() => {
    if (currentEnriched.length === 0) return null as BacktestResult | null
    const totalValue = currentEnriched.reduce((s, h) => s + h.currentValueBase, 0)
    if (totalValue <= 0) return null
    return runBacktest(
      currentEnriched.map((h) => ({ ticker: h.ticker, pct: (h.currentValueBase / totalValue) * 100 })),
      histories,
      rebalMonths,
    )
  }, [currentEnriched, histories, rebalMonths])

  const chartData = useMemo(() => {
    const map = new Map<string, { date: string; planned?: number; current?: number }>()
    for (const p of plannedResult.series) {
      map.set(p.date, { date: p.date, planned: p.value })
    }
    if (currentResult) {
      for (const p of currentResult.series) {
        const existing = map.get(p.date)
        if (existing) existing.current = p.value
        else map.set(p.date, { date: p.date, current: p.value })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [plannedResult, currentResult])

  const hasData = plannedResult.series.length > 1 || (currentResult && currentResult.series.length > 1)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Historical backtest
              </CardTitle>
              <CardDescription>
                Simulate the planned weights over history with periodic rebalancing.
                Each portfolio starts at index 100 — what would have happened if you held this mix?
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={String(rebalMonths)} onValueChange={(v) => setRebalMonths(parseInt(v))}>
                <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{REBAL.map((r) => <SelectItem key={r.months} value={String(r.months)}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-72 w-full" />
            </div>
          ) : !hasData ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              {positions.length === 0 ? 'Add planner positions to backtest.' : 'Not enough overlapping price history for these tickers.'}
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(d) => (d as string).slice(0, 7)} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    formatter={(v) => (v as number).toFixed(1)}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="planned" stroke="#22c55e" strokeWidth={2} dot={false} name="Planned" />
                  {currentResult && <Line type="monotone" dataKey="current" stroke="#a3a3a3" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Current" />}
                </LineChart>
              </ResponsiveContainer>
              {loading && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading prices…</p>}
            </>
          )}
        </CardContent>
      </Card>

      {hasData && (
        <div className="grid gap-3 md:grid-cols-2">
          <MetricsCard title="Planned" result={plannedResult} variant="planned" />
          {currentResult && <MetricsCard title="Current" result={currentResult} variant="current" />}
        </div>
      )}
    </div>
  )
}

function MetricsCard({ title, result, variant }: { title: string; result: BacktestResult; variant: 'planned' | 'current' }) {
  const accent = variant === 'planned' ? 'text-emerald-400' : 'text-muted-foreground'
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {result.startDate && (
          <CardDescription className="text-[10px]">
            {result.startDate} → {result.endDate} · {result.monthsCovered} months
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <Stat label="CAGR" value={formatPercent(result.cagrPct)} valueColor={result.cagrPct >= 0 ? accent : 'text-red-400'} />
        <Stat label="Total return" value={formatPercent(result.totalReturnPct)} valueColor={result.totalReturnPct >= 0 ? accent : 'text-red-400'} />
        <Stat label="Max drawdown" value={`${result.maxDrawdownPct.toFixed(1)}%`} valueColor="text-red-400" />
        <Stat label="Annual vol" value={`${result.volPct.toFixed(1)}%`} />
        <Stat label="Sharpe (rf=0)" value={result.sharpe.toFixed(2)} />
        <Stat label="Best / worst month" value={`${result.bestMonthPct.toFixed(1)}% / ${result.worstMonthPct.toFixed(1)}%`} />
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${valueColor ?? ''}`}>{value}</div>
    </div>
  )
}

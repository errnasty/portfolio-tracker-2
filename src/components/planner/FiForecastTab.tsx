'use client'

import { useEffect, useMemo, useState } from 'react'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ResponsiveContainer, ComposedChart, Line, ReferenceLine, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { monteCarlo, type ProjectionPoint } from '@/lib/projection'
import { trailingMonthlyNetSavings, trailingAnnualExpenses, fiTarget, yearsToTarget } from '@/lib/fi'
import { buildPortfolioSeries, computeRiskMetrics, type PriceSeries } from '@/lib/risk-metrics'
import { formatCurrency } from '@/lib/utils'
import type { Currency, EnrichedHolding } from '@/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface MonthStats { income: number; expense: number; net: number }

interface Props {
  netWorthBase: number
  baseCurrency: Currency
  enriched: EnrichedHolding[]
  statsForMonth: (ym: string) => MonthStats
}

const DEFAULT_RETURN_PCT = 7
const DEFAULT_VOL_PCT = 15
const DEFAULT_SWR_PCT = 4
const HORIZON_MONTHS = 480 // 40 years

function thisMonth() { return new Date().toISOString().slice(0, 7) }

export function FiForecastTab({ netWorthBase, baseCurrency, enriched, statsForMonth }: Props) {
  const ref = thisMonth()
  const monthlySavings = trailingMonthlyNetSavings(statsForMonth, ref, 3)
  const annualExpenses = trailingAnnualExpenses(statsForMonth, ref, 12)

  const [swrPct, setSwrPct] = useState(DEFAULT_SWR_PCT)
  const [returnPct, setReturnPct] = useState(DEFAULT_RETURN_PCT)
  const [volPct, setVolPct] = useState(DEFAULT_VOL_PCT)
  const [usedRealHistory, setUsedRealHistory] = useState(false)
  const [showAssumptions, setShowAssumptions] = useState(false)

  // Real portfolio CAGR/vol over the trailing year, when available — used as
  // the *default* return/vol so the forecast reflects actual performance
  // rather than an arbitrary guess. Still user-editable afterward.
  const [history, setHistory] = useState<Record<string, PriceSeries>>({})
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    if (enriched.length === 0) return
    const tickers = enriched.map((h) => h.ticker).join(',')
    setLoadingHistory(true)
    fetch(`/api/historical?tickers=${encodeURIComponent(tickers)}&period=1y`)
      .then((r) => r.json())
      .then((data) => setHistory(data.history ?? {}))
      .catch((e) => console.error('FI forecast history fetch failed:', e))
      .finally(() => setLoadingHistory(false))
  }, [enriched.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (usedRealHistory || Object.keys(history).length === 0) return
    const series = buildPortfolioSeries(enriched, history)
    const metrics = computeRiskMetrics(series)
    if (metrics && metrics.observations >= 180) {
      setReturnPct(Number((metrics.cagr * 100).toFixed(1)))
      setVolPct(Number((metrics.annualizedVol * 100).toFixed(1)))
      setUsedRealHistory(true)
    }
  }, [history, enriched, usedRealHistory])

  const target = fiTarget(annualExpenses, swrPct)

  const result = useMemo(() => {
    if (monthlySavings === null || target === null) return null
    return monteCarlo({
      startingValue: netWorthBase,
      monthlyContribution: monthlySavings,
      expectedAnnualReturnPct: returnPct,
      expectedAnnualVolPct: volPct,
      months: HORIZON_MONTHS,
    }, target)
  }, [netWorthBase, monthlySavings, returnPct, volPct, target])

  const whatIf = (deltaSavings: number, deltaReturn: number): number | null => {
    if (monthlySavings === null || target === null) return null
    const series = monteCarlo({
      startingValue: netWorthBase,
      monthlyContribution: monthlySavings + deltaSavings,
      expectedAnnualReturnPct: returnPct + deltaReturn,
      expectedAnnualVolPct: volPct,
      months: HORIZON_MONTHS,
    }).series
    return yearsToTarget(series, 'p50', target)
  }

  if (monthlySavings === null || annualExpenses === null || target === null) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Add a few months of spending history to see your Financial Independence forecast —
          it needs real income/expense data to estimate your savings rate and target.
        </CardContent>
      </Card>
    )
  }

  const p50Years = yearsToTarget(result!.series, 'p50', target)
  const p95Years = yearsToTarget(result!.series, 'p95', target) // optimistic (fastest)
  const p5Years = yearsToTarget(result!.series, 'p5', target)   // pessimistic (slowest)

  const baseYears = whatIf(0, 0)
  const saveMoreYears = whatIf(1000, 0)
  const spendLessYears = whatIf(500, 0)
  const lowerReturnYears = whatIf(0, -1)
  const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b)

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            label="Financial independence"
            value={p95Years ?? 0}
            format={(n) => p50Years === null
              ? 'not on track'
              : `${p50Years.toFixed(1)}y`}
            sub={`at ${formatCurrency(monthlySavings, baseCurrency)}/mo savings · ${returnPct}% ${usedRealHistory ? 'real (your portfolio)' : 'assumed'} return`}
          />
          <HeroMetric
            label="Success probability"
            value={(result!.successRate) * 100}
            format={(n) => `${n.toFixed(0)}%`}
            sub="across 1,000 Monte Carlo paths"
          />
          <HeroMetric
            label="Range"
            value={p95Years ?? 0}
            format={(n) => (p5Years === null
              ? `${n.toFixed(1)}y – 40y+`
              : `${n.toFixed(1)} – ${p5Years.toFixed(1)}y`)}
            sub="5th – 95th percentile"
          />
        </HeroBand>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Net worth projection</CardTitle>
          <CardDescription>
            Target {formatCurrency(target, baseCurrency)} ({swrPct}% safe withdrawal rate) ·
            now {formatCurrency(netWorthBase, baseCurrency)}
            {target > 0 ? ` · ${Math.min(100, (netWorthBase / target) * 100).toFixed(1)}%` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? <Skeleton className="h-72 w-full" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={result!.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(d) => (d as string).slice(0, 4)} minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => formatCurrency(v as number, baseCurrency, true)} />
                <Tooltip
                  formatter={(v) => formatCurrency(v as number, baseCurrency)}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <ReferenceLine y={target} stroke="#ffd166" strokeDasharray="4 4" label={{ value: 'FI target', fontSize: 10, fill: '#ffd166' }} />
                <Line type="monotone" dataKey="p95" stroke="#6aa9ff" strokeWidth={1} strokeDasharray="3 3" dot={false} name="95th pct" />
                <Line type="monotone" dataKey="p50" stroke="#6aa9ff" strokeWidth={2} dot={false} name="Median" />
                <Line type="monotone" dataKey="p5" stroke="#6aa9ff" strokeWidth={1} strokeDasharray="3 3" dot={false} name="5th pct" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <WhatIfCard label="Save +$1,000/mo" years={saveMoreYears} deltaYears={delta(baseYears, saveMoreYears)} />
        <WhatIfCard label="Spend −$500/mo" years={spendLessYears} deltaYears={delta(baseYears, spendLessYears)} />
        <WhatIfCard label="Return −1%" years={lowerReturnYears} deltaYears={delta(baseYears, lowerReturnYears)} inverse />
      </div>

      <Card>
        <CardHeader>
          <button
            type="button"
            onClick={() => setShowAssumptions((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {showAssumptions ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Adjust assumptions
          </button>
        </CardHeader>
        {showAssumptions && (
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Expected annual return (%)</Label>
              <Input type="number" step="0.1" value={returnPct}
                onChange={(e) => { setReturnPct(parseFloat(e.target.value) || 0); setUsedRealHistory(false) }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expected annual volatility (%)</Label>
              <Input type="number" step="0.1" value={volPct}
                onChange={(e) => { setVolPct(parseFloat(e.target.value) || 0); setUsedRealHistory(false) }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Safe withdrawal rate (%)</Label>
              <Input type="number" step="0.1" value={swrPct} onChange={(e) => setSwrPct(parseFloat(e.target.value) || DEFAULT_SWR_PCT)} />
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

function WhatIfCard({ label, years, deltaYears, inverse }: {
  label: string
  years: number | null
  deltaYears: number | null
  inverse?: boolean
}) {
  const improved = deltaYears !== null && (inverse ? deltaYears < 0 : deltaYears > 0)
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className={`text-2xl font-bold tabular-nums ${deltaYears === null ? '' : improved ? 'text-emerald-400' : 'text-red-400'}`}>
            {deltaYears === null ? '—' : `${deltaYears >= 0 ? '−' : '+'}${Math.abs(deltaYears).toFixed(1)}y`}
          </span>
          <span className="text-xs text-muted-foreground">
            {years === null ? 'not on track' : `→ ${years.toFixed(1)}y`}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

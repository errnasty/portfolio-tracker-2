# Real Monte Carlo FI Planner + Cross-Domain Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-data Monte Carlo "Financial Independence" tab to `/planner` and matching Net Worth + FI Outlook sections to `/report`, both driven by actual net worth and spending history instead of manual inputs.

**Architecture:** New pure-function lib (`src/lib/fi.ts`) derives real trailing savings/expenses and walks a Monte Carlo percentile series to find years-to-target. Reuses the existing tested `src/lib/projection.ts` engine unchanged. A new `FiForecastTab` component becomes the first/default tab on `/planner`; the existing 4 tabs are untouched. `/report` gets two new `<Section>` blocks using the same `fi.ts` functions.

**Tech Stack:** Next 13.5 App Router, React 18, TypeScript, Tailwind, recharts, vitest. No new dependencies.

**Verification vocabulary:**
- Typecheck: `npx tsc --noEmit` → Expected: no errors.
- Unit: `npm run test -- <path>` → Expected: PASS.
- Build: `npm run build` → Expected: compiles, 31+ pages.

---

## File Structure

**New**
- `src/lib/fi.ts` — 4 pure functions: `trailingMonthlyNetSavings`, `trailingAnnualExpenses`, `fiTarget`, `yearsToTarget`.
- `src/lib/__tests__/fi.test.ts` — unit tests for the above.
- `src/components/planner/FiForecastTab.tsx` — hero (years-to-FI / success % / range) + percentile-band chart + 3 what-if cards + editable-assumptions disclosure. Fetches its own real portfolio history for a CAGR/vol default, same pattern as `PlannerBacktest.tsx`.

**Modified**
- `src/app/(dashboard)/planner/page.tsx` — add `useSpending()`, insert `FiForecastTab` as the first/default tab.
- `src/app/(dashboard)/report/page.tsx` — add "Net worth" section after the header, "Financial independence outlook" section at the end.

---

### Task 1: `fi.ts` derivation functions (TDD)

**Files:**
- Create: `src/lib/fi.ts`
- Test: `src/lib/__tests__/fi.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, it, expect } from 'vitest'
import {
  trailingMonthlyNetSavings, trailingAnnualExpenses, fiTarget, yearsToTarget,
} from '../fi'
import type { ProjectionPoint } from '../projection'

type MonthStats = { income: number; expense: number; net: number }

function makeStatsForMonth(byYm: Record<string, MonthStats>) {
  return (ym: string): MonthStats => byYm[ym] ?? { income: 0, expense: 0, net: 0 }
}

describe('trailingMonthlyNetSavings', () => {
  it('averages net over the trailing N months', () => {
    const stats = makeStatsForMonth({
      '2026-05': { income: 8000, expense: 5000, net: 3000 },
      '2026-06': { income: 8000, expense: 6000, net: 2000 },
      '2026-07': { income: 8000, expense: 5500, net: 2500 },
    })
    // trailing 3 months ending 2026-07: (3000+2000+2500)/3
    expect(trailingMonthlyNetSavings(stats, '2026-07', 3)).toBeCloseTo(2500, 5)
  })
  it('returns null when there is no data at all', () => {
    const stats = makeStatsForMonth({})
    expect(trailingMonthlyNetSavings(stats, '2026-07', 3)).toBeNull()
  })
  it('defaults to 3 months when not specified', () => {
    const stats = makeStatsForMonth({
      '2026-05': { income: 100, expense: 0, net: 100 },
      '2026-06': { income: 100, expense: 0, net: 100 },
      '2026-07': { income: 100, expense: 0, net: 100 },
    })
    expect(trailingMonthlyNetSavings(stats, '2026-07')).toBeCloseTo(100, 5)
  })
})

describe('trailingAnnualExpenses', () => {
  it('sums expense over the trailing N months (default 12)', () => {
    const byYm: Record<string, MonthStats> = {}
    for (let m = 1; m <= 12; m++) {
      const ym = `2026-${String(m).padStart(2, '0')}`
      byYm[ym] = { income: 1000, expense: 500, net: 500 }
    }
    const stats = makeStatsForMonth(byYm)
    expect(trailingAnnualExpenses(stats, '2026-12')).toBeCloseTo(6000, 5)
  })
  it('returns null when there is no data at all', () => {
    const stats = makeStatsForMonth({})
    expect(trailingAnnualExpenses(stats, '2026-12')).toBeNull()
  })
  it('is a distinct sum from the savings average for the same data', () => {
    const byYm: Record<string, MonthStats> = {
      '2026-05': { income: 1000, expense: 500, net: 500 },
      '2026-06': { income: 1000, expense: 500, net: 500 },
      '2026-07': { income: 1000, expense: 500, net: 500 },
    }
    const stats = makeStatsForMonth(byYm)
    const savings = trailingMonthlyNetSavings(stats, '2026-07', 3)
    const expenses = trailingAnnualExpenses(stats, '2026-07', 3)
    expect(savings).toBeCloseTo(500, 5)      // average
    expect(expenses).toBeCloseTo(1500, 5)    // sum
  })
})

describe('fiTarget', () => {
  it('applies a 4% safe-withdrawal rate as a 25x multiple', () => {
    expect(fiTarget(48000, 4)).toBeCloseTo(1200000, 2)
  })
  it('applies a 3.33% safe-withdrawal rate as a 30x multiple', () => {
    expect(fiTarget(40000, 3.333333)).toBeCloseTo(1200000, -1)
  })
  it('returns null for null annualExpenses', () => {
    expect(fiTarget(null, 4)).toBeNull()
  })
  it('returns null for zero or negative annualExpenses', () => {
    expect(fiTarget(0, 4)).toBeNull()
    expect(fiTarget(-100, 4)).toBeNull()
  })
})

describe('yearsToTarget', () => {
  const series: ProjectionPoint[] = [
    { month: 0, date: '2026-01', p5: 100, p25: 100, p50: 100, p75: 100, p95: 100, expected: 100 },
    { month: 12, date: '2027-01', p5: 90, p25: 110, p50: 130, p75: 150, p95: 180, expected: 130 },
    { month: 24, date: '2028-01', p5: 95, p25: 140, p50: 170, p75: 200, p95: 260, expected: 170 },
  ]
  it('finds the first month a percentile crosses the target, in years', () => {
    // p50 crosses 130 at month 12 -> 1 year
    expect(yearsToTarget(series, 'p50', 130)).toBeCloseTo(1, 5)
  })
  it('returns 0 when already at/above target at month 0', () => {
    expect(yearsToTarget(series, 'p50', 50)).toBe(0)
  })
  it('returns null when the percentile never reaches the target in the series', () => {
    expect(yearsToTarget(series, 'p50', 1000)).toBeNull()
  })
  it('p95 (optimistic) crosses no later than p5 (pessimistic) for the same target', () => {
    const target = 150
    const fast = yearsToTarget(series, 'p95', target)
    const slow = yearsToTarget(series, 'p5', target)
    expect(fast).not.toBeNull()
    expect(slow === null || fast! <= slow).toBe(true)
  })
})
```

- [ ] **Step 2: Run — fails.** `npm run test -- src/lib/__tests__/fi.test.ts`
  Expected: FAIL, `Cannot find module '../fi'` (or similar).

- [ ] **Step 3: Implement `src/lib/fi.ts`.**

```ts
import type { ProjectionPoint } from './projection'

interface MonthStats { income: number; expense: number; net: number }
type StatsForMonth = (ym: string) => MonthStats

// 'YYYY-MM' -> 'YYYY-MM' one month earlier.
function priorMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function trailingMonths(referenceMonth: string, count: number): string[] {
  const out: string[] = []
  let ym = referenceMonth
  for (let i = 0; i < count; i++) { out.push(ym); ym = priorMonth(ym) }
  return out
}

// True only if every trailing month has zero income AND zero expense — the
// "no data yet" case we want to distinguish from "real months that happened
// to net to zero".
function hasNoData(stats: StatsForMonth, months: string[]): boolean {
  return months.every((ym) => {
    const s = stats(ym)
    return s.income === 0 && s.expense === 0
  })
}

// Average real net savings (income - expense) over the trailing N months.
export function trailingMonthlyNetSavings(
  stats: StatsForMonth,
  referenceMonth: string,
  months = 3,
): number | null {
  const ymList = trailingMonths(referenceMonth, months)
  if (hasNoData(stats, ymList)) return null
  const total = ymList.reduce((s, ym) => s + stats(ym).net, 0)
  return total / months
}

// Sum of real expense over the trailing N months (default 12) — a longer
// window than the savings average above, to smooth seasonal spending rather
// than reacting to a single unusually quiet or heavy month.
export function trailingAnnualExpenses(
  stats: StatsForMonth,
  referenceMonth: string,
  months = 12,
): number | null {
  const ymList = trailingMonths(referenceMonth, months)
  if (hasNoData(stats, ymList)) return null
  return ymList.reduce((s, ym) => s + stats(ym).expense, 0)
}

// FI target = annualExpenses * (100 / swrPct). swrPct=4 -> 25x multiple.
export function fiTarget(annualExpenses: number | null, swrPct: number): number | null {
  if (annualExpenses === null || annualExpenses <= 0) return null
  return annualExpenses * (100 / swrPct)
}

// Walks a monteCarlo() series to find the first month `percentileKey`
// crosses `target`. Returns years (month / 12), or null if it never crosses
// within the series' horizon.
export function yearsToTarget(
  series: ProjectionPoint[],
  percentileKey: 'p5' | 'p50' | 'p95',
  target: number,
): number | null {
  for (const point of series) {
    if (point[percentileKey] >= target) return point.month / 12
  }
  return null
}
```

- [ ] **Step 4: Run — passes.** `npm run test -- src/lib/__tests__/fi.test.ts`
  Expected: PASS, 14 tests.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/fi.ts src/lib/__tests__/fi.test.ts
git commit -m "feat(fi): trailing savings/expenses, FI target, years-to-target"
```

---

### Task 2: `FiForecastTab` component

**Files:**
- Create: `src/components/planner/FiForecastTab.tsx`

- [ ] **Step 1: Implement.**

```tsx
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
```

- [ ] **Step 2: Verify.** `npx tsc --noEmit`
  Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add src/components/planner/FiForecastTab.tsx
git commit -m "feat(planner): FiForecastTab component"
```

---

### Task 3: Wire `FiForecastTab` into `/planner`

**Files:**
- Modify: `src/app/(dashboard)/planner/page.tsx`

- [ ] **Step 1: Add the `useSpending` import** (after the existing `usePortfolio` import at line 4):

```tsx
import { useSpending } from '@/context/SpendingContext'
```

- [ ] **Step 2: Add the `FiForecastTab` import** (after the `PlannerBacktest` import at line 15):

```tsx
import { FiForecastTab } from '@/components/planner/FiForecastTab'
```

- [ ] **Step 3: Destructure spending data.** In `PlannerPage`, right after the existing `usePortfolio()` destructure (around line 63), add:

```tsx
  const { statsForMonth } = useSpending()
```

- [ ] **Step 4: Add `netWorthBase` to the `usePortfolio()` destructure.** Change:

```tsx
  const {
    enriched: currentEnriched,
    stats,
    settings,
    fxRates,
    prices: currentPrices,
    loading: portfolioLoading,
  } = usePortfolio()
```

to:

```tsx
  const {
    enriched: currentEnriched,
    stats,
    settings,
    fxRates,
    prices: currentPrices,
    loading: portfolioLoading,
    netWorthBase,
  } = usePortfolio()
```

- [ ] **Step 5: Make the FI tab always reachable, independent of `hasPlannerData`.** The existing 4 tabs are gated behind `{!hasPlannerData ? (...) : (<Tabs>...)}` — the FI tab must render even when the user hasn't set up any hypothetical positions yet, since it's about their *real* net worth, not the planner sandbox. Restructure: move the `<Tabs>` block outside that gate, and gate only the 4 existing tabs' *content* on `hasPlannerData` (each already has its own empty-state fallback, e.g. "You don't have any real holdings yet..."). Replace the block starting at `{!hasPlannerData ? (` (around line 269) through the matching `)}` before `</div>\n    </PageShell>` with:

```tsx
      <Tabs defaultValue="fi" className="w-full">
        <TabsList>
          <TabsTrigger value="fi">Financial Independence</TabsTrigger>
          <TabsTrigger value="composition">Composition</TabsTrigger>
          <TabsTrigger value="comparison">vs Current</TabsTrigger>
          <TabsTrigger value="lookthrough">Look-through</TabsTrigger>
          <TabsTrigger value="backtest">Backtest</TabsTrigger>
        </TabsList>

        <TabsContent value="fi" className="space-y-4 pt-4">
          <FiForecastTab
            netWorthBase={netWorthBase}
            baseCurrency={baseCurrency}
            enriched={currentEnriched}
            statsForMonth={statsForMonth}
          />
        </TabsContent>

        <TabsContent value="composition" className="space-y-4 pt-4">
          {!hasPlannerData ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Add at least one position with a non-zero allocation to see analytics.
              </CardContent>
            </Card>
          ) : (
            <>
              {(loadingPrices || loadingAnalytics) && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  {loadingPrices ? 'Fetching prices…' : 'Fetching ETF composition (may take a moment)…'}
                </div>
              )}
              {missingPriceCount > 0 && !loadingPrices && (
                <div className="rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-400">
                  {missingPriceCount} ticker{missingPriceCount === 1 ? '' : 's'} missing price data — implied share counts unavailable for those.
                </div>
              )}
              {Math.abs(totalPct - 100) > 0.05 && (
                <div className="rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-400">
                  Allocations sum to {totalPct.toFixed(2)}% — analytics treat the planned weights as-is.
                  Click <em>Normalize</em> to scale them to 100%.
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Stats for the planned portfolio
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Planned total</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {formatCurrency(totalValue, baseCurrency)}
                  </div>
                </div>
              </div>

              <ConcentrationCard metrics={plannerConcentration} totalHoldings={plannerEnriched.length} />

              {loadingAnalytics && Object.keys(analytics).length === 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Skeleton className="h-80" />
                  <Skeleton className="h-80" />
                  <Skeleton className="h-80" />
                  <Skeleton className="h-80" />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <BreakdownChart
                    title="Geographic Allocation (look-through)"
                    description="ETFs decomposed by underlying countries"
                    data={plannerGeo}
                    baseCurrency={baseCurrency}
                  />
                  <BreakdownChart
                    title="Sector Allocation (look-through)"
                    description="ETFs decomposed by sector weightings"
                    data={plannerSectors}
                    baseCurrency={baseCurrency}
                  />
                  <BreakdownChart
                    title="Currency Exposure (look-through)"
                    description="Underlying currency derived from country mix"
                    data={plannerCurrencies}
                    baseCurrency={baseCurrency}
                  />
                  <BreakdownChart
                    title="Asset Type"
                    description="Stocks vs ETFs vs other instruments"
                    data={plannerAssets}
                    baseCurrency={baseCurrency}
                  />
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4 pt-4">
          {!hasPlannerData || currentEnriched.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                You don&apos;t have any real holdings yet — add some on the Holdings page to enable comparison.
              </CardContent>
            </Card>
          ) : (
            <>
              <ComparisonSummary
                currentTotal={stats?.totalValue ?? 0}
                plannedTotal={totalValue}
                baseCurrency={baseCurrency}
              />
              <ConcentrationComparison rows={cmpConcentration} />
              <div className="grid gap-4 md:grid-cols-2">
                <ComparisonBars
                  title="Geographic — Current vs Planned"
                  description="Look-through country exposure shifts"
                  rows={cmpGeo}
                  baseCurrency={baseCurrency}
                />
                <ComparisonBars
                  title="Sector — Current vs Planned"
                  description="Look-through sector exposure shifts"
                  rows={cmpSectors}
                  baseCurrency={baseCurrency}
                />
                <ComparisonBars
                  title="Currency — Current vs Planned"
                  description="Underlying-currency exposure shifts"
                  rows={cmpCurrencies}
                  baseCurrency={baseCurrency}
                />
                <ComparisonBars
                  title="Asset Type — Current vs Planned"
                  rows={cmpAssets}
                  baseCurrency={baseCurrency}
                />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="backtest" className="space-y-4 pt-4">
          {!hasPlannerData ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Add at least one position with a non-zero allocation to see analytics.
              </CardContent>
            </Card>
          ) : (
            <PlannerBacktest
              positions={positions}
              currentEnriched={currentEnriched}
              startingValue={totalValue > 0 ? totalValue : undefined}
              baseCurrency={baseCurrency}
            />
          )}
        </TabsContent>

        <TabsContent value="lookthrough" className="space-y-4 pt-4">
          {!hasPlannerData ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Add at least one position with a non-zero allocation to see analytics.
              </CardContent>
            </Card>
          ) : (
            <>
              <LookThroughStocksCard
                stocks={plannerLookThrough.stocks}
                coveragePct={plannerLookThrough.coveragePct}
                baseCurrency={baseCurrency}
              />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Planned Positions</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Direct rows of the planner with implied share counts at current prices
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Ticker</th>
                          <th className="px-4 py-2 font-medium">Type</th>
                          <th className="px-4 py-2 font-medium text-right">Allocation</th>
                          <th className="px-4 py-2 font-medium text-right">Value</th>
                          <th className="px-4 py-2 font-medium text-right">Implied shares</th>
                          <th className="px-4 py-2 font-medium text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plannerEnriched.map((h) => {
                          const a = analytics[h.ticker]
                          const type = a?.quoteType === 'EQUITY' ? 'Stock'
                            : a?.quoteType === 'ETF' ? 'ETF'
                              : a?.quoteType === 'MUTUALFUND' ? 'Fund'
                                : '—'
                          return (
                            <tr key={h.id} className="border-b border-border/50 last:border-0">
                              <td className="px-4 py-2.5">
                                <div className="font-medium">{h.ticker}</div>
                                <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                                  {h.name ?? a?.longName ?? ''}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">{type}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">{h.allocationPct.toFixed(2)}%</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {formatCurrency(h.currentValueBase, baseCurrency)}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                                {h.currentPrice > 0 ? h.shares.toFixed(4) : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                                {h.currentPrice > 0
                                  ? formatCurrency(h.currentPrice, h.priceCurrency)
                                  : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
```

  Note: this also removes the old top-level `{!hasPlannerData ? (...) : (<>...</>)}` wrapper and the three warning banners (missing prices / allocation not 100% / loading spinner) are now nested inside the `composition` tab's non-empty branch instead of sitting above all tabs — they're composition-specific concerns, not FI-tab concerns, so this is a correctness fix as well as a structural one.

- [ ] **Step 6: Verify.** `npx tsc --noEmit`
  Expected: no errors (watch for `hasPlannerData`, `totalPct`, `missingPriceCount`, `loadingPrices`, `loadingAnalytics` still being in scope — they are, none were removed, only the JSX consuming them moved).

- [ ] **Step 7: Render check.** `npm run dev` → open `/planner` → confirm "Financial Independence" tab is selected by default and shows either the forecast or the "add a few months of spending" empty state; click through the other 4 tabs and confirm they still work exactly as before.

- [ ] **Step 8: Commit.**

```bash
git add "src/app/(dashboard)/planner/page.tsx"
git commit -m "feat(planner): wire FiForecastTab as the default tab"
```

---

### Task 4: Report — Net Worth section

**Files:**
- Modify: `src/app/(dashboard)/report/page.tsx`

- [ ] **Step 1: Add `netWorthBase` and `accountsNetBase` to the `usePortfolio()` destructure** (line 36). Change:

```tsx
  const { enriched, stats, settings, transactions } = usePortfolio()
```

to:

```tsx
  const { enriched, stats, settings, transactions, netWorthBase, accountsNetBase } = usePortfolio()
```

- [ ] **Step 2: Compute `holdingsValueBase` locally** (same pattern as `dashboard/page.tsx` — not separately exported by the context). Add right after the `hasHoldings` line (around line 54):

```tsx
  const holdingsValueBase = enriched.reduce((s, h) => s + h.currentValueBase, 0)
```

- [ ] **Step 3: Insert the Net Worth section** right after the header block and before the existing `{/* Spending summary */}` comment (around line 121-123):

```tsx
        {/* Net worth (financial + portfolio combined) */}
        <Section title="Net worth">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <SummaryStat label="Net worth" value={formatCurrency(netWorthBase, base)} />
            <SummaryStat label="Cash & accounts" value={formatCurrency(accountsNetBase, base)} />
            <SummaryStat label="Portfolio value" value={formatCurrency(holdingsValueBase, base)} />
          </div>
        </Section>

```

- [ ] **Step 4: Verify.** `npx tsc --noEmit`
  Expected: no errors.

- [ ] **Step 5: Commit.**

```bash
git add "src/app/(dashboard)/report/page.tsx"
git commit -m "feat(report): add Net worth section (accounts + holdings combined)"
```

---

### Task 5: Report — Financial independence outlook section

**Files:**
- Modify: `src/app/(dashboard)/report/page.tsx`

This section deliberately uses the fixed 7%/15% return/vol default (not a real-history
fetch) — Report is a point-in-time export/print snapshot, not an interactive tool, so
it doesn't warrant its own `/api/historical` round-trip. It shares the *same* `fi.ts`
functions and target logic as the Planner FI tab so the two numbers agree whenever the
user's real portfolio history isn't available anyway (new user, thin history);
when the Planner tab has picked up real CAGR/vol, Report's number will be a
close-but-not-identical estimate — acceptable for an export document.

- [ ] **Step 1: Add the imports** (alongside the existing `@/lib/analytics` import block, around line 14):

```tsx
import { monteCarlo } from '@/lib/projection'
import { trailingMonthlyNetSavings, trailingAnnualExpenses, fiTarget, yearsToTarget } from '@/lib/fi'
```

- [ ] **Step 2: Compute the FI forecast.** Add after the existing `savingsRate` line (around line 62):

```tsx
  const monthlySavings = trailingMonthlyNetSavings(statsForMonth, month, 3)
  const annualExpenses = trailingAnnualExpenses(statsForMonth, month, 12)
  const fiTargetAmount = fiTarget(annualExpenses, 4)
  const fiResult = (monthlySavings !== null && fiTargetAmount !== null)
    ? monteCarlo({
        startingValue: netWorthBase,
        monthlyContribution: monthlySavings,
        expectedAnnualReturnPct: 7,
        expectedAnnualVolPct: 15,
        months: 480,
      }, fiTargetAmount)
    : null
  const fiYears = fiResult ? yearsToTarget(fiResult.series, 'p50', fiTargetAmount!) : null
```

- [ ] **Step 3: Insert the section** right before the closing disclaimer paragraph (before `<p className="text-[10px] text-muted-foreground border-t border-border pt-2">`, around line 218):

```tsx
        {fiTargetAmount !== null && monthlySavings !== null && (
          <Section title="Financial independence outlook">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryStat
                label="Years to FI"
                value={fiYears === null ? 'not on track' : `${fiYears.toFixed(1)}y`}
              />
              <SummaryStat label="Success probability" value={`${(fiResult!.successRate * 100).toFixed(0)}%`} />
              <SummaryStat label="FI target (4% SWR)" value={formatCurrency(fiTargetAmount, base)} />
              <SummaryStat
                label="Progress"
                value={`${Math.min(100, (netWorthBase / fiTargetAmount) * 100).toFixed(1)}%`}
              />
            </div>
          </Section>
        )}
```

- [ ] **Step 4: Verify.** `npx tsc --noEmit`
  Expected: no errors.

- [ ] **Step 5: Render check.** `npm run dev` → open `/report` → confirm "Net worth" section appears right after the header, and "Financial independence outlook" appears after the Geographic/Sector/Currency/Look-through grid and before the disclaimer line. Toggle the month picker and confirm the FI section updates (it's driven by trailing months ending at the picked month, same as the Spending section).

- [ ] **Step 6: Commit.**

```bash
git add "src/app/(dashboard)/report/page.tsx"
git commit -m "feat(report): add Financial independence outlook section"
```

---

### Task 6: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite.**

Run: `npm run test`
Expected: all test files pass, including the new `src/lib/__tests__/fi.test.ts` (14 tests).

- [ ] **Step 2: Typecheck the whole project.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build the whole project.**

Run: `npm run build`
Expected: compiles successfully, all routes generate (31+ pages, unchanged count — no routes added or removed).

- [ ] **Step 4: Lint.**

Run: `npm run lint`
Expected: no new errors (the pre-existing `PosbImport.tsx` exhaustive-deps warning is unrelated and expected).

- [ ] **Step 5: Manual smoke test.** `npm run dev` →
  1. `/planner` — Financial Independence tab is the default; shows a real forecast (or the empty state if spending history is thin); Composition/vs Current/Look-through/Backtest tabs still work exactly as before.
  2. `/report` — Net Worth section near the top, Financial independence outlook section near the bottom; existing Spending/Portfolio/breakdown sections and CSV export/print button unchanged.
  3. `/goals` — unchanged, still uses manual per-goal inputs.

- [ ] **Step 6: Final commit** (only if any of the above steps required fixes not already committed).

```bash
git add -A
git commit -m "fix: address issues found during FI planner + report verification"
```

---

## Self-Review

**Spec coverage:**
- `fi.ts` four functions (design §Architecture) → Task 1.
- `FiForecastTab` (real net worth, real trailing savings, real-history return/vol with fallback, editable assumptions, hero + chart + what-if cards) → Task 2.
- FI tab as default, reachable independent of planner-sandbox state, other 4 tabs untouched → Task 3.
- Report Net Worth section → Task 4.
- Report FI Outlook section → Task 5.
- Edge cases (no spending data, zero expenses, never-crosses, cash-only net worth, short history fallback) → handled in `fi.ts` (Task 1 tests) and `FiForecastTab`'s empty-state branch (Task 2) and the `usedRealHistory`/`observations >= 180` gate (Task 2).
- Success criteria (default tab, matching numbers, real inputs with override, Net Worth combining both sides, empty states, full green verify) → Task 6.

**Placeholder scan:** no TBD/TODO; every step has complete, runnable code; test code is real assertions, not descriptions.

**Type consistency:** `trailingMonthlyNetSavings`/`trailingAnnualExpenses`/`fiTarget`/`yearsToTarget` signatures in Task 1 match every call site in Task 2 and Task 5 exactly (same param order, same nullable returns). `ProjectionPoint`'s `p5`/`p50`/`p95` keys (from existing `projection.ts`, unmodified) match `yearsToTarget`'s `percentileKey` union in both definition and every call site. `SummaryStat`'s existing `value: string` prop (Report, unmodified) is only ever passed strings in Task 4/5's new usages.



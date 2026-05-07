'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ZapOff, RotateCcw, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatPercent, gainLossColor } from '@/lib/utils'
import {
  PRESET_SCENARIOS, runStressTest, BUCKET_LABELS,
  type Scenario, type ScenarioShocks, type ShockBucket,
} from '@/lib/stress-test'
import type { TickerAnalytics } from '@/app/api/analytics/route'
import type { Currency } from '@/types'

const SHOCK_BUCKETS: ShockBucket[] = [
  'us_equity', 'developed_ex_us_equity', 'em_equity', 'sg_equity',
  'bond', 'gold', 'commodity', 'crypto', 'cash',
]

export default function StressTestPage() {
  const { enriched, settings, totalCashBase, loading: portfolioLoading } = usePortfolio()
  const baseCurrency: Currency = (settings?.base_currency ?? 'USD') as Currency

  const [analytics, setAnalytics] = useState<Record<string, TickerAnalytics>>({})
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [activePresetId, setActivePresetId] = useState<string>('2008-gfc')
  const [customShocks, setCustomShocks] = useState<ScenarioShocks>({})
  const [useCustom, setUseCustom] = useState(false)

  // Fetch analytics for geographic look-through
  useEffect(() => {
    if (enriched.length === 0) return
    setAnalyticsLoading(true)
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: enriched.map((h) => h.ticker) }),
    })
      .then((r) => r.json())
      .then((data) => setAnalytics(data.analytics ?? {}))
      .catch((e) => console.error('Analytics fetch failed:', e))
      .finally(() => setAnalyticsLoading(false))
  }, [enriched.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const activePreset: Scenario | undefined = PRESET_SCENARIOS.find((s) => s.id === activePresetId)

  // Initialize custom shocks from active preset whenever the preset changes
  useEffect(() => {
    if (activePreset) setCustomShocks({ ...activePreset.shocks })
  }, [activePresetId]) // eslint-disable-line react-hooks/exhaustive-deps

  const shocksToApply: ScenarioShocks = useMemo(
    () => useCustom ? customShocks : (activePreset?.shocks ?? {}),
    [useCustom, customShocks, activePreset],
  )

  const result = useMemo(
    () => runStressTest(enriched, analytics, shocksToApply, totalCashBase),
    [enriched, analytics, shocksToApply, totalCashBase],
  )

  if (!portfolioLoading && enriched.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold">Stress Test</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Add holdings to run scenarios.
          </CardContent>
        </Card>
      </div>
    )
  }

  const initialLoading = portfolioLoading || (analyticsLoading && Object.keys(analytics).length === 0)
  const isCritical = result.totalImpactPct < -25
  const isModerate = result.totalImpactPct < -10

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Stress Test</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Apply historical or custom shocks to your portfolio. Each holding is shocked
          based on its geographic and asset-class composition.
        </p>
      </div>

      {/* Scenario picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pick a scenario</CardTitle>
          <CardDescription>
            Drop-in shocks based on real historical drawdowns, or build your own.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESET_SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setActivePresetId(s.id); setUseCustom(false) }}
                className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  !useCustom && activePresetId === s.id
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <div className="font-medium">{s.name}</div>
              </button>
            ))}
          </div>
          {activePreset && !useCustom && (
            <p className="text-xs text-muted-foreground">{activePreset.description}</p>
          )}

          {/* Custom shocks */}
          <details
            className="rounded-md border border-border bg-muted/30 p-3"
            open={useCustom}
            onToggle={(e) => setUseCustom((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer text-sm font-medium">
              Custom scenario
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SHOCK_BUCKETS.map((b) => (
                <div key={b} className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">{BUCKET_LABELS[b]}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="1"
                      value={((customShocks[b] ?? 0) * 100).toFixed(0)}
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value) || 0
                        setCustomShocks((prev) => ({ ...prev, [b]: pct / 100 }))
                      }}
                      className="h-8 w-20 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm" variant="outline"
                onClick={() => setCustomShocks(activePreset?.shocks ?? {})}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset to {activePreset?.name ?? 'preset'}
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => setCustomShocks({})}
              >
                Zero all
              </Button>
            </div>
          </details>
        </CardContent>
      </Card>

      {initialLoading ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          {/* Headline impact */}
          <Card className={isCritical ? 'border-red-500/40' : isModerate ? 'border-amber-500/40' : ''}>
            <CardContent className="grid gap-4 py-5 md:grid-cols-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Portfolio impact</div>
                <div className={`text-3xl font-bold tabular-nums ${gainLossColor(result.totalImpactPct)}`}>
                  {formatPercent(result.totalImpactPct, 1)}
                </div>
                <div className={`text-sm ${gainLossColor(result.totalImpactDollars)}`}>
                  {formatCurrency(result.totalImpactDollars, baseCurrency)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Before</div>
                <div className="text-xl font-semibold tabular-nums">
                  {formatCurrency(result.startingValue, baseCurrency)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">After</div>
                <div className="text-xl font-semibold tabular-nums">
                  {formatCurrency(result.newPortfolioValue, baseCurrency)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Severity</div>
                <div className="text-xl font-semibold flex items-center gap-1.5">
                  {isCritical
                    ? <><AlertTriangle className="h-4 w-4 text-red-400" /> <span className="text-red-400">Severe</span></>
                    : isModerate
                      ? <><AlertTriangle className="h-4 w-4 text-amber-400" /> <span className="text-amber-400">Moderate</span></>
                      : <><ZapOff className="h-4 w-4 text-emerald-400" /> <span className="text-emerald-400">Mild</span></>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Per-bucket attribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">By asset class</CardTitle>
              <CardDescription>How much each bucket contributes to the total impact</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.byBucket.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data.</p>
              ) : (
                result.byBucket.map((b) => {
                  const positive = b.contribution >= 0
                  const maxAbs = Math.max(...result.byBucket.map((x) => Math.abs(x.contribution)), 0.1)
                  const widthPct = (Math.abs(b.contribution) / maxAbs) * 50
                  return (
                    <div key={b.bucket} className="space-y-0.5">
                      <div className="flex items-baseline justify-between text-sm">
                        <span>
                          <span className="font-medium">{BUCKET_LABELS[b.bucket]}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {b.weight.toFixed(1)}% × {(b.shock * 100).toFixed(1)}%
                          </span>
                        </span>
                        <span className={`tabular-nums font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatPercent(b.contribution, 2)}
                        </span>
                      </div>
                      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-foreground/20" />
                        <div
                          className={`absolute top-0 bottom-0 ${positive ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{
                            left: positive ? '50%' : `${50 - widthPct}%`,
                            width: `${widthPct}%`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          {/* Per-holding impact */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Worst-hit positions</CardTitle>
              <CardDescription>Per-holding $ impact under the scenario</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Ticker</th>
                      <th className="px-4 py-2 font-medium">Asset class</th>
                      <th className="px-4 py-2 font-medium text-right">Before</th>
                      <th className="px-4 py-2 font-medium text-right">After</th>
                      <th className="px-4 py-2 font-medium text-right">Impact %</th>
                      <th className="px-4 py-2 font-medium text-right">Impact ({baseCurrency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.perHolding.map((h) => (
                      <tr key={h.ticker} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{h.ticker}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{h.name}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {BUCKET_LABELS[h.dominantBucket]}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatCurrency(h.valueBefore, baseCurrency)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatCurrency(h.valueAfter, baseCurrency)}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${gainLossColor(h.impactPct)}`}>
                          {formatPercent(h.impactPct, 1)}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${gainLossColor(h.impactDollars)}`}>
                          {formatCurrency(h.impactDollars, baseCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="text-[10px] text-muted-foreground">
            Methodology: each holding is decomposed into asset-class buckets via geographic
            look-through (for equities) and ticker/name keywords (for bonds, gold, commodities, crypto).
            Each bucket is then shocked by its scenario percentage. Impact ignores correlation breakdowns,
            FX moves, and dividend reinvestment — it&apos;s a directional estimate, not a precise forecast.
          </p>
        </>
      )}
    </div>
  )
}

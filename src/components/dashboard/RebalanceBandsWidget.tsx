'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { MetricLabel } from '@/components/ui/metric-label'
import type { Currency, EnrichedHolding, TargetAllocation } from '@/types'

interface BandRow {
  ticker: string
  currentPct: number
  targetPct: number
  tolerancePct: number
  driftPct: number
  outOfBand: boolean
  currentValue: number
  targetValue: number
}

interface Props {
  enriched: EnrichedHolding[]
  targets: TargetAllocation[]
  base: Currency
}

export function RebalanceBandsWidget({ enriched, targets, base }: Props) {
  if (targets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rebalance check</CardTitle>
          <CardDescription>Set target allocations to monitor drift</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/rebalancer">
            <Button variant="outline" size="sm">
              Set targets <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  const totalValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  const rows: BandRow[] = targets.map((t) => {
    const holding = enriched.find((h) => h.ticker.toUpperCase() === t.ticker.toUpperCase())
    const currentValue = holding?.currentValueBase ?? 0
    const currentPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0
    const targetPct = Number(t.target_pct)
    const tolerancePct = Number(t.tolerance_pct ?? 5)
    const driftPct = currentPct - targetPct
    const outOfBand = Math.abs(driftPct) > tolerancePct
    return {
      ticker: t.ticker,
      currentPct,
      targetPct,
      tolerancePct,
      driftPct,
      outOfBand,
      currentValue,
      targetValue: (targetPct / 100) * totalValue,
    }
  }).sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct))

  const outOfBand = rows.filter((r) => r.outOfBand)
  const allGood = outOfBand.length === 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Rebalance check</CardTitle>
            <CardDescription>
              {allGood
                ? `All ${rows.length} target${rows.length === 1 ? '' : 's'} within tolerance band`
                : `${outOfBand.length} of ${rows.length} position${rows.length === 1 ? '' : 's'} out of band`}
            </CardDescription>
          </div>
          <Link href="/rebalancer">
            <Button variant="ghost" size="sm" className="h-8">
              Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {allGood ? (
          <div className="flex items-center gap-2 text-sm text-up">
            <CheckCircle2 className="h-4 w-4" /> Portfolio is on target — no action needed.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.slice(0, 6).map((r) => (
              <BandRow key={r.ticker} row={r} base={base} />
            ))}
            {rows.length > 6 && (
              <p className="text-[11px] text-muted-foreground pt-1">
                +{rows.length - 6} more — see Rebalancer for the full list
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BandRow({ row, base }: { row: BandRow; base: Currency }) {
  const driftAbs = Math.abs(row.driftPct)
  // Visual: bar centered on target, with bands at ±tolerance
  // Map drift in [-2*tol, +2*tol] to [0, 100] for position
  const range = row.tolerancePct * 2
  const pos = Math.min(100, Math.max(0, 50 + (row.driftPct / range) * 50))
  const overshoot = driftAbs > row.tolerancePct

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <div className="flex items-center gap-2">
          {overshoot ? <AlertTriangle className="h-3.5 w-3.5 text-warn" /> : null}
          <span className="font-medium">{row.ticker}</span>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="text-muted-foreground">{row.currentPct.toFixed(1)}% / {row.targetPct.toFixed(1)}%</span>
          <span className={overshoot ? (row.driftPct > 0 ? 'text-warn' : 'text-warn') : 'text-muted-foreground'}>
            {formatPercent(row.driftPct, 1)}
          </span>
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-[var(--hair)] overflow-hidden">
        {/* Tolerance band */}
        <div
          className="absolute top-0 bottom-0 bg-up/15"
          style={{ left: '25%', right: '25%' }}
        />
        {/* Center line (target) */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-foreground/30" />
        {/* Marker */}
        <div
          className={`absolute top-0 bottom-0 w-1 -translate-x-1/2 rounded-full ${overshoot ? 'bg-warn' : 'bg-up'}`}
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span><MetricLabel term="drift">Drift</MetricLabel> {formatCurrency(row.currentValue - row.targetValue, base)}</span>
        <span>±{row.tolerancePct.toFixed(0)}% band</span>
      </div>
    </div>
  )
}

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import type { Currency } from '@/types'
import type { ComparisonRow, ConcentrationDelta } from '@/lib/planner'

interface BarsProps {
  title: string
  description?: string
  rows: ComparisonRow[]
  baseCurrency: Currency
}

// Paired horizontal bars: for each label, show current % above and planned %
// below with a colored delta chip on the right.
export function ComparisonBars({ title, description, rows, baseCurrency }: BarsProps) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No data to compare
          </div>
        </CardContent>
      </Card>
    )
  }

  // Scale bar widths to the largest single value so visual differences are
  // readable when no slice is close to 100%.
  const maxPct = Math.max(
    1,
    ...rows.map((r) => Math.max(r.currentPct, r.plannedPct)),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-muted-foreground/60" /> Current
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-accent" /> Planned
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="truncate text-sm">{r.label}</div>
                <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
                  <span className="text-muted-foreground">
                    {r.currentPct.toFixed(1)}% → {r.plannedPct.toFixed(1)}%
                  </span>
                  <DeltaChip delta={r.deltaPct} />
                </div>
              </div>
              <div className="mt-1.5 space-y-1">
                <Bar pct={r.currentPct} maxPct={maxPct} variant="current" amount={r.currentValue} baseCurrency={baseCurrency} />
                <Bar pct={r.plannedPct} maxPct={maxPct} variant="planned" amount={r.plannedValue} baseCurrency={baseCurrency} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Bar({
  pct,
  maxPct,
  variant,
  amount,
  baseCurrency,
}: {
  pct: number
  maxPct: number
  variant: 'current' | 'planned'
  amount: number
  baseCurrency: Currency
}) {
  const widthPct = maxPct > 0 ? (pct / maxPct) * 100 : 0
  const fill = variant === 'planned' ? 'bg-accent' : 'bg-muted-foreground/40'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${fill} transition-all`}
          style={{ width: `${Math.min(100, widthPct)}%` }}
        />
      </div>
      <div className="w-24 text-right text-[11px] text-muted-foreground tabular-nums shrink-0">
        {amount > 0 ? formatCurrency(amount, baseCurrency) : '—'}
      </div>
    </div>
  )
}

function DeltaChip({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.05) {
    return <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">±0.0%</span>
  }
  const positive = delta > 0
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 font-medium ${
        positive ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
      }`}
    >
      {positive ? '+' : ''}{delta.toFixed(1)}%
    </span>
  )
}

// ── Concentration metric comparison ───────────────────────────────────────
export function ConcentrationComparison({
  rows,
}: {
  rows: ConcentrationDelta[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Concentration & Diversification</CardTitle>
        <p className="text-xs text-muted-foreground">Side-by-side: real portfolio vs planned</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Metric</th>
                <th className="pb-2 font-medium text-right">Current</th>
                <th className="pb-2 font-medium text-right">Planned</th>
                <th className="pb-2 font-medium text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meaningful = Math.abs(r.delta) > 0.05
                const sign = r.delta > 0 ? '+' : ''
                // For HHI/concentration metrics, lower is generally better;
                // for effective holdings, higher is better. Color hint:
                const goodIfLower = r.label !== 'Effective holdings'
                const goodDirection = goodIfLower ? r.delta < 0 : r.delta > 0
                const deltaColor = !meaningful
                  ? 'text-muted-foreground'
                  : goodDirection
                    ? 'text-up'
                    : 'text-down'
                return (
                  <tr key={r.label} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5">{r.label}</td>
                    <td className="py-2.5 text-right tabular-nums">{r.format(r.current)}</td>
                    <td className="py-2.5 text-right tabular-nums">{r.format(r.planned)}</td>
                    <td className={`py-2.5 text-right tabular-nums ${deltaColor}`}>
                      {meaningful ? `${sign}${r.format(r.delta)}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          HHI &lt; 1500 = well diversified · 1500–2500 = moderate · &gt; 2500 = concentrated.
          Effective holdings = 1 / Σ(weightᵢ²).
        </p>
      </CardContent>
    </Card>
  )
}

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MetricLabel } from '@/components/ui/metric-label'
import type { ConcentrationMetrics } from '@/lib/analytics'

interface Props {
  metrics: ConcentrationMetrics
  totalHoldings: number
}

function hhiInterpretation(hhi: number): { label: string; color: string } {
  if (hhi < 1500) return { label: 'Well diversified', color: 'text-up' }
  if (hhi < 2500) return { label: 'Moderately concentrated', color: 'text-yellow-400' }
  return { label: 'Highly concentrated', color: 'text-down' }
}

export function ConcentrationCard({ metrics, totalHoldings }: Props) {
  const interp = hhiInterpretation(metrics.hhi)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Concentration & Diversification</CardTitle>
        <p className="text-xs text-muted-foreground">
          How spread out is your portfolio?
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat
          label="Largest position"
          value={`${metrics.largestPct.toFixed(1)}%`}
        />
        <Stat
          label="Top 5 holdings"
          value={`${metrics.top5Pct.toFixed(1)}%`}
        />
        <Stat
          label="Top 10 holdings"
          value={`${metrics.top10Pct.toFixed(1)}%`}
        />
        <Stat
          label="Total holdings"
          value={totalHoldings.toString()}
        />
        <Stat
          label={<MetricLabel term="effective_holdings">Effective holdings</MetricLabel>}
          value={metrics.effectiveHoldings.toFixed(1)}
        />
        <Stat
          label={<MetricLabel term="hhi">HHI</MetricLabel>}
          value={metrics.hhi.toFixed(0)}
          hint={interp.label}
          hintColor={interp.color}
        />
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  hint,
  hintColor,
}: {
  label: React.ReactNode
  value: string
  hint?: string
  hintColor?: string
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className={`text-[11px] mt-0.5 ${hintColor ?? 'text-muted-foreground'}`}>
          {hint}
        </div>
      )}
    </div>
  )
}

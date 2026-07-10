'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Currency, EnrichedHolding } from '@/types'

interface PriceSeries {
  ticker: string
  series: { date: string; close: number }[]
}

interface Props {
  enriched: EnrichedHolding[]
  histories: Record<string, { date: string; close: number }[]>
  baseCurrency: Currency
  period: string
}

interface AttributionRow {
  ticker: string
  name: string | null
  weight: number          // share of portfolio (end of period)
  ret: number             // per-ticker return over the period (%)
  contribution: number    // weight × return (%)
  contributionDollars: number  // weight × return × portfolio_value (in base)
}

// Decompose the portfolio's period return into per-holding contributions.
// We use end-of-period weights (current allocation) and per-ticker period
// return measured in the ticker's quote currency. This is the standard
// arithmetic attribution: portfolio return ≈ Σ (weightᵢ × returnᵢ).
//
// Note: ignores intra-period FX moves (treated as part of each ticker's
// total return when expressed in base — close enough for retail tracking).
export function AttributionCard({ enriched, histories, baseCurrency, period }: Props) {
  const totalValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)

  const rows = useMemo<AttributionRow[]>(() => {
    if (totalValue <= 0) return []
    return enriched
      .map((h): AttributionRow | null => {
        const series = histories[h.ticker]
        if (!series || series.length < 2) return null
        const start = series[0].close
        const end = series[series.length - 1].close
        if (start <= 0) return null
        const ret = ((end - start) / start) * 100
        const weight = (h.currentValueBase / totalValue) * 100
        const contribution = (weight * ret) / 100
        const contributionDollars = (contribution / 100) * totalValue
        return {
          ticker: h.ticker,
          name: h.name,
          weight,
          ret,
          contribution,
          contributionDollars,
        }
      })
      .filter((r): r is AttributionRow => r !== null)
      .sort((a, b) => b.contribution - a.contribution)
  }, [enriched, histories, totalValue])

  const totalContribution = rows.reduce((s, r) => s + r.contribution, 0)
  const winners = rows.filter((r) => r.contribution > 0)
  const losers = rows.filter((r) => r.contribution < 0)
  const totalWinPct = winners.reduce((s, r) => s + r.contribution, 0)
  const totalLossPct = losers.reduce((s, r) => s + r.contribution, 0)

  // Normalize bar widths to the largest absolute contribution
  const maxAbsContribution = rows.length > 0
    ? Math.max(...rows.map((r) => Math.abs(r.contribution)))
    : 1

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance attribution</CardTitle>
          <CardDescription>Per-holding contribution to the {period.toUpperCase()} return</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Need historical price data — try refreshing the chart above.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Performance attribution</CardTitle>
        <CardDescription>
          Per-holding contribution to the {period.toUpperCase()} portfolio return.
          Sum ≈ portfolio return; gaps come from FX and turnover within the period.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top stats */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Stat
            label="Sum of contributions"
            value={formatPercent(totalContribution)}
            valueColor={totalContribution >= 0 ? 'text-up' : 'text-down'}
          />
          <Stat
            label="Winners"
            value={`${winners.length} (${formatPercent(totalWinPct)})`}
            valueColor="text-up"
          />
          <Stat
            label="Losers"
            value={`${losers.length} (${formatPercent(totalLossPct)})`}
            valueColor="text-down"
          />
          <Stat
            label="Net dollar impact"
            value={formatCurrency(totalValue * (totalContribution / 100), baseCurrency)}
            valueColor={totalContribution >= 0 ? 'text-up' : 'text-down'}
          />
        </div>

        {/* Per-holding bars */}
        <div className="space-y-2">
          {rows.map((r) => {
            const widthPct = (Math.abs(r.contribution) / maxAbsContribution) * 50
            const positive = r.contribution >= 0
            return (
              <div key={r.ticker} className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{r.ticker}</span>
                    {r.name && (
                      <span className="ml-2 text-xs text-muted-foreground">{r.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
                    <span className="text-muted-foreground">
                      {r.weight.toFixed(1)}% × {formatPercent(r.ret, 1)}
                    </span>
                    <span
                      className={`font-semibold ${positive ? 'text-up' : 'text-down'}`}
                    >
                      {formatPercent(r.contribution, 2)}
                    </span>
                  </div>
                </div>
                <div className="relative h-1.5 rounded-full bg-[var(--hair)] overflow-hidden">
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-foreground/20" />
                  <div
                    className={`absolute top-0 bottom-0 ${positive ? 'bg-up' : 'bg-down'}`}
                    style={{
                      left: positive ? '50%' : `${50 - widthPct}%`,
                      width: `${widthPct}%`,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-2">
          Method: weight × return per holding, summed. Weights are end-of-period (current allocation).
          For positions added or trimmed mid-period this is an approximation; the more
          stable your weights, the more exact the attribution.
        </p>
      </CardContent>
    </Card>
  )
}

function Stat({
  label, value, valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${valueColor ?? ''}`}>{value}</div>
    </div>
  )
}

export type { PriceSeries }

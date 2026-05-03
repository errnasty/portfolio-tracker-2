'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ALL_FACTOR_TICKERS, FACTOR_PROXIES, buildFactorSeries,
  runFactorRegression, type FactorKey,
} from '@/lib/factor-regression'
import type { PriceSeries } from '@/lib/risk-metrics'

interface Props {
  portfolioSeries: PriceSeries
  period: string
}

const FACTOR_DESCRIPTIONS: Record<FactorKey, string> = {
  market:   'Sensitivity to broad-market moves. Beta of 1.0 = moves with SPY.',
  size:     'Tilt toward small-caps (positive) or large-caps (negative).',
  value:    'Tilt toward value (positive) or growth (negative).',
  momentum: 'Exposure to recently-outperforming names.',
  quality:  'Tilt toward profitable, low-leverage companies.',
  lowvol:   'Tilt toward stable, low-volatility names.',
}

export function FactorExposureCard({ portfolioSeries, period }: Props) {
  const [histories, setHistories] = useState<Record<string, { date: string; close: number }[]>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/historical?tickers=${encodeURIComponent(ALL_FACTOR_TICKERS.join(','))}&period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        const out: Record<string, { date: string; close: number }[]> = {}
        for (const t of ALL_FACTOR_TICKERS) out[t] = data.history?.[t] ?? []
        setHistories(out)
      })
      .catch((err) => console.error('Factor history fetch failed:', err))
      .finally(() => setLoading(false))
  }, [period])

  const result = useMemo(() => {
    if (portfolioSeries.length < 30) return null
    const factorSeries = buildFactorSeries(histories)
    if (factorSeries.size < 6) return null

    // Convert daily portfolio series → monthly returns
    const byMonth = new Map<string, { date: string; close: number }>()
    for (const p of portfolioSeries) {
      const k = p.date.slice(0, 7)
      const e = byMonth.get(k)
      if (!e || p.date > e.date) byMonth.set(k, p)
    }
    const months = Array.from(byMonth.keys()).sort()
    const monthly = new Map<string, number>()
    for (let i = 1; i < months.length; i++) {
      const prev = byMonth.get(months[i - 1])!.close
      const curr = byMonth.get(months[i])!.close
      if (prev > 0) monthly.set(months[i], (curr - prev) / prev)
    }

    return runFactorRegression(monthly, factorSeries)
  }, [portfolioSeries, histories])

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Factor exposure</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-48" /></CardContent>
      </Card>
    )
  }

  if (!result || result.observations < 6) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Factor exposure</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Need at least 6 months of overlapping returns. Try a longer period (3Y or 5Y).
          </p>
        </CardContent>
      </Card>
    )
  }

  const factorKeys = Object.keys(FACTOR_PROXIES) as FactorKey[]
  const maxAbsBeta = Math.max(0.1, ...factorKeys.map((k) => Math.abs(result.betas[k])))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Factor exposure (Fama-French style)</CardTitle>
        <p className="text-xs text-muted-foreground">
          OLS regression of portfolio monthly returns vs factor-mimicking ETF returns over {result.observations} months.
          Betas show your tilt to each factor; alpha is the unexplained excess.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Stat label="R²" value={`${(result.rSquared * 100).toFixed(1)}%`}
            hint={result.rSquared > 0.85 ? 'Returns largely explained' : result.rSquared > 0.6 ? 'Most returns explained' : 'Significant unexplained variance'} />
          <Stat label="Alpha (monthly)" value={`${result.alpha.toFixed(2)}%`}
            valueColor={result.alpha >= 0 ? 'text-emerald-400' : 'text-red-400'}
            hint="Excess return after factor exposure" />
          <Stat label="Annualized alpha" value={`${(result.alpha * 12).toFixed(2)}%`}
            valueColor={result.alpha >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          <Stat label="Observations" value={result.observations.toString()} hint={`${period.toUpperCase()} window`} />
        </div>

        <div className="space-y-3">
          {factorKeys.map((k) => {
            const beta = result.betas[k]
            const widthPct = (Math.abs(beta) / maxAbsBeta) * 50
            const color = beta >= 0 ? 'bg-emerald-500' : 'bg-red-500'
            return (
              <div key={k} className="space-y-1">
                <div className="flex items-baseline justify-between text-sm">
                  <div>
                    <span className="font-medium">{FACTOR_PROXIES[k].label}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {FACTOR_PROXIES[k].tickers.length === 1
                        ? FACTOR_PROXIES[k].tickers[0]
                        : `${FACTOR_PROXIES[k].tickers[0]} − ${FACTOR_PROXIES[k].tickers[1]}`}
                    </span>
                  </div>
                  <span className={`tabular-nums font-semibold ${beta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {beta >= 0 ? '+' : ''}{beta.toFixed(2)}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-foreground/20" />
                  <div
                    className={`absolute top-0 bottom-0 ${color}`}
                    style={{
                      left: beta >= 0 ? '50%' : `${50 - widthPct}%`,
                      width: `${widthPct}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">{FACTOR_DESCRIPTIONS[k]}</p>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, valueColor, hint }: { label: string; value: string; valueColor?: string; hint?: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${valueColor ?? ''}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  )
}

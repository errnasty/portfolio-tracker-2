'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MetricCard } from '@/components/risk/MetricCard'
import { CorrelationMatrix } from '@/components/risk/CorrelationMatrix'
import { FactorExposureCard } from '@/components/risk/FactorExposureCard'
import {
  buildPortfolioSeries,
  computeRiskMetrics,
  correlationMatrix,
  type PriceSeries,
} from '@/lib/risk-metrics'
import { DEFAULT_BENCHMARKS, type Currency } from '@/types'
import { formatPercent, gainLossColor } from '@/lib/utils'

const PERIODS = [
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: 'YTD', value: 'ytd' },
  { label: '1Y', value: '1y' },
  { label: '3Y', value: '3y' },
  { label: '5Y', value: '5y' },
]

const RISK_FREE_DEFAULT = 0.04 // 4% annual — adjust as needed

export default function RiskPage() {
  const { enriched, holdings, loading: portfolioLoading } = usePortfolio()
  const [period, setPeriod] = useState('1y')
  const [benchTicker, setBenchTicker] = useState('SPY')
  const [riskFree, setRiskFree] = useState(RISK_FREE_DEFAULT)
  const [history, setHistory] = useState<Record<string, PriceSeries>>({})
  const [benchHistory, setBenchHistory] = useState<PriceSeries>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Fetch historical prices for holdings + benchmark whenever inputs change
  useEffect(() => {
    if (holdings.length === 0) return
    const tickers = Array.from(new Set([...holdings.map((h) => h.ticker), benchTicker])).join(',')
    setLoadingHistory(true)
    fetch(`/api/historical?tickers=${encodeURIComponent(tickers)}&period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        const all: Record<string, PriceSeries> = data.history ?? {}
        const bench = all[benchTicker] ?? []
        const portfolioHistory: Record<string, PriceSeries> = {}
        for (const h of holdings) {
          if (all[h.ticker]) portfolioHistory[h.ticker] = all[h.ticker]
        }
        setHistory(portfolioHistory)
        setBenchHistory(bench)
      })
      .catch((err) => console.error('History fetch failed:', err))
      .finally(() => setLoadingHistory(false))
  }, [holdings, period, benchTicker])

  const portfolioSeries = useMemo(
    () => buildPortfolioSeries(enriched, history),
    [enriched, history],
  )

  const metrics = useMemo(
    () => computeRiskMetrics(portfolioSeries, benchHistory, riskFree),
    [portfolioSeries, benchHistory, riskFree],
  )

  const corr = useMemo(() => {
    const tickers = enriched.map((h) => h.ticker).filter((t) => history[t]?.length)
    if (tickers.length < 2) return null
    return correlationMatrix(tickers, history)
  }, [enriched, history])

  const loading = portfolioLoading || loadingHistory

  if (!portfolioLoading && enriched.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Risk &amp; Performance</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Add some holdings to see risk metrics.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Risk &amp; Performance</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Sharpe, drawdown, beta, and other risk-adjusted return metrics.
          </p>
        </div>
      </div>

      {/* Controls — wrap on mobile */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
            <div className="flex flex-wrap gap-1.5">
              {PERIODS.map((p) => (
                <Button
                  key={p.value}
                  size="sm"
                  variant={period === p.value ? 'default' : 'outline'}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Benchmark</label>
              <select
                value={benchTicker}
                onChange={(e) => setBenchTicker(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs md:text-sm"
              >
                {DEFAULT_BENCHMARKS.map((b) => (
                  <option key={b.ticker} value={b.ticker}>
                    {b.ticker} — {b.name}
                  </option>
                ))}
              </select>
              <label className="text-xs text-muted-foreground whitespace-nowrap">Risk-free</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="20"
                value={(riskFree * 100).toFixed(1)}
                onChange={(e) => setRiskFree(parseFloat(e.target.value) / 100)}
                className="h-8 w-16 rounded-md border border-border bg-background px-2 text-xs md:text-sm tabular-nums"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && !metrics ? (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : !metrics ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Not enough historical data for the selected period.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Headline returns */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <MetricCard
              label="Total Return"
              value={formatPercent(metrics.totalReturnPct * 100)}
              tone={metrics.totalReturnPct >= 0 ? 'positive' : 'negative'}
              size="lg"
              hint={`${metrics.observations} trading days`}
            />
            <MetricCard
              label="CAGR"
              value={formatPercent(metrics.cagr * 100)}
              tone={metrics.cagr >= 0 ? 'positive' : 'negative'}
              size="lg"
              hint="Annualized compound growth"
            />
            <MetricCard
              label="Annualized Vol"
              value={`${(metrics.annualizedVol * 100).toFixed(2)}%`}
              size="lg"
              hint="Standard deviation × √252"
            />
            <MetricCard
              label="Max Drawdown"
              value={`${(metrics.maxDrawdownPct * 100).toFixed(2)}%`}
              tone="negative"
              size="lg"
              hint={
                metrics.drawdownPeakDate && metrics.drawdownTroughDate
                  ? `${metrics.drawdownPeakDate} → ${metrics.drawdownTroughDate}`
                  : undefined
              }
            />
          </div>

          {/* Risk-adjusted ratios */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Risk-Adjusted Returns</CardTitle>
              <p className="text-xs text-muted-foreground">
                Higher Sharpe/Sortino = more return per unit of risk taken.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
                <MetricCard
                  label="Sharpe Ratio"
                  value={metrics.sharpeRatio.toFixed(2)}
                  hint={
                    metrics.sharpeRatio > 1 ? 'Good (>1)'
                      : metrics.sharpeRatio > 0.5 ? 'Acceptable'
                        : metrics.sharpeRatio > 0 ? 'Sub-par'
                          : 'Negative — losing to risk-free'
                  }
                  hintColor={
                    metrics.sharpeRatio > 1 ? 'text-emerald-400'
                      : metrics.sharpeRatio > 0 ? 'text-yellow-400'
                        : 'text-red-400'
                  }
                />
                <MetricCard
                  label="Sortino Ratio"
                  value={metrics.sortinoRatio.toFixed(2)}
                  hint="Penalizes downside vol only"
                />
                <MetricCard
                  label="Calmar Ratio"
                  value={metrics.calmarRatio.toFixed(2)}
                  hint="CAGR / |Max Drawdown|"
                />
                <MetricCard
                  label="Downside Vol"
                  value={`${(metrics.downsideVol * 100).toFixed(2)}%`}
                  hint="Volatility of negative-return days"
                />
                <MetricCard
                  label="Positive Days"
                  value={`${(metrics.positiveDayPct * 100).toFixed(1)}%`}
                  hint="Win rate on daily returns"
                />
                <MetricCard
                  label="Mean Daily Return"
                  value={`${(metrics.meanDailyReturn * 100).toFixed(3)}%`}
                  tone={metrics.meanDailyReturn >= 0 ? 'positive' : 'negative'}
                />
              </div>
            </CardContent>
          </Card>

          {/* Tail risk */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tail Risk &amp; Day Stats</CardTitle>
              <p className="text-xs text-muted-foreground">
                What does a really bad day look like for this portfolio?
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                <MetricCard
                  label="VaR 95%"
                  value={`${(metrics.var95 * 100).toFixed(2)}%`}
                  tone="negative"
                  hint="Daily loss exceeded 1 day in 20"
                />
                <MetricCard
                  label="CVaR 95%"
                  value={`${(metrics.cvar95 * 100).toFixed(2)}%`}
                  tone="negative"
                  hint="Avg loss in worst 5% of days"
                />
                <MetricCard
                  label="Best Day"
                  value={`+${(metrics.bestDay * 100).toFixed(2)}%`}
                  tone="positive"
                />
                <MetricCard
                  label="Worst Day"
                  value={`${(metrics.worstDay * 100).toFixed(2)}%`}
                  tone="negative"
                />
              </div>
            </CardContent>
          </Card>

          {/* vs benchmark */}
          {metrics.beta !== undefined && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">vs. {benchTicker}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  How your portfolio behaves relative to the benchmark.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                  <MetricCard
                    label="Beta"
                    value={metrics.beta.toFixed(2)}
                    hint={
                      metrics.beta > 1.1 ? 'More volatile than benchmark'
                        : metrics.beta < 0.9 ? 'Less volatile than benchmark'
                          : 'Roughly market-like'
                    }
                  />
                  <MetricCard
                    label="Alpha"
                    value={`${((metrics.alpha ?? 0) * 100).toFixed(2)}%`}
                    tone={(metrics.alpha ?? 0) >= 0 ? 'positive' : 'negative'}
                    hint="Annualized excess return"
                  />
                  <MetricCard
                    label="Correlation"
                    value={(metrics.correlation ?? 0).toFixed(3)}
                    hint={
                      Math.abs(metrics.correlation ?? 0) > 0.9 ? 'Tracks benchmark closely'
                        : Math.abs(metrics.correlation ?? 0) > 0.5 ? 'Moderately correlated'
                          : 'Loosely related'
                    }
                  />
                  <MetricCard
                    label="Tracking Error"
                    value={`${((metrics.trackingError ?? 0) * 100).toFixed(2)}%`}
                    hint="Annualized stdev of excess returns"
                  />
                  <MetricCard
                    label="Information Ratio"
                    value={(metrics.informationRatio ?? 0).toFixed(2)}
                    hint="Excess return per unit of tracking error"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-holding returns */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per-Holding Risk</CardTitle>
              <p className="text-xs text-muted-foreground">
                Each position&apos;s standalone metrics over the selected window.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-3 md:mx-0">
                <table className="w-full text-xs md:text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-2 font-medium">Ticker</th>
                      <th className="p-2 font-medium text-right">Return</th>
                      <th className="p-2 font-medium text-right hidden sm:table-cell">CAGR</th>
                      <th className="p-2 font-medium text-right">Vol</th>
                      <th className="p-2 font-medium text-right">Max DD</th>
                      <th className="p-2 font-medium text-right hidden sm:table-cell">Sharpe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enriched.map((h) => {
                      const series = history[h.ticker]
                      if (!series || series.length < 5) {
                        return (
                          <tr key={h.id} className="border-b border-border/50">
                            <td className="p-2 font-medium">{h.ticker}</td>
                            <td colSpan={5} className="p-2 text-right text-muted-foreground">
                              No history
                            </td>
                          </tr>
                        )
                      }
                      const m = computeRiskMetrics(series, undefined, riskFree)
                      if (!m) return null
                      return (
                        <tr key={h.id} className="border-b border-border/50 last:border-0">
                          <td className="p-2 font-medium whitespace-nowrap">{h.ticker}</td>
                          <td className={`p-2 text-right tabular-nums ${gainLossColor(m.totalReturnPct)}`}>
                            {formatPercent(m.totalReturnPct * 100)}
                          </td>
                          <td className={`p-2 text-right tabular-nums hidden sm:table-cell ${gainLossColor(m.cagr)}`}>
                            {formatPercent(m.cagr * 100)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {(m.annualizedVol * 100).toFixed(1)}%
                          </td>
                          <td className="p-2 text-right tabular-nums text-red-400">
                            {(m.maxDrawdownPct * 100).toFixed(1)}%
                          </td>
                          <td className="p-2 text-right tabular-nums hidden sm:table-cell">
                            {m.sharpeRatio.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Factor exposure */}
          {portfolioSeries.length >= 30 && (
            <FactorExposureCard portfolioSeries={portfolioSeries} period={period} />
          )}

          {/* Correlation matrix */}
          {corr && <CorrelationMatrix tickers={corr.tickers} matrix={corr.matrix} />}
        </>
      )}
    </div>
  )
}

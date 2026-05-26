'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePortfolio } from '@/context/PortfolioContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MetricLabel } from '@/components/ui/metric-label'
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  Tooltip, CartesianGrid, Legend, Cell, ReferenceLine,
} from 'recharts'
import { Wand2, Plus, Trash2, Loader2, Compass, ArrowRight, X } from 'lucide-react'
import { formatPercent } from '@/lib/utils'
import {
  runOptimizer, scorePortfolio, dailyToMonthlyReturns, alignMonthlyReturns,
  annualizedMean, annualizedCovariance,
  type PortfolioPoint,
} from '@/lib/optimizer'
import type { Currency } from '@/types'
import { toast } from 'sonner'

const PERIODS = [
  { label: '3 years', value: '3y', months: 36 },
  { label: '5 years', value: '5y', months: 60 },
  { label: '10 years', value: '10y', months: 120 },
]

const SUGGESTED_DIVERSIFIERS = [
  { ticker: 'VWRA.L', label: 'Global equity (Irish UCITS)' },
  { ticker: 'AGGG.L', label: 'Global bonds (Irish UCITS)' },
  { ticker: 'IGLN.L', label: 'Gold' },
  { ticker: 'EIMI.L', label: 'Emerging markets' },
  { ticker: 'CSPX.L', label: 'S&P 500 (UCITS)' },
  { ticker: 'SWDA.L', label: 'MSCI World (UCITS)' },
]

const PLANNER_KEY = 'planner-state-v1'

export default function OptimizerPage() {
  const { enriched, settings } = usePortfolio()
  const router = useRouter()
  const baseCurrency: Currency = (settings?.base_currency ?? 'USD') as Currency

  // Candidate tickers — default to current holdings
  const [tickers, setTickers] = useState<string[]>([])
  const [newTicker, setNewTicker] = useState('')
  const [period, setPeriod] = useState('5y')
  const [riskFree, setRiskFree] = useState('4')
  const [simulations, setSimulations] = useState('5000')
  const [target, setTarget] = useState<'sharpe' | 'sortino'>('sharpe')

  // Per-ticker expected return overrides (annualized %). Empty = use historical mean.
  const [overrides, setOverrides] = useState<Record<string, string>>({})

  // Historical price data
  const [histories, setHistories] = useState<Record<string, { date: string; close: number }[]>>({})
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [running, setRunning] = useState(false)

  // Initialise tickers from current portfolio once
  useEffect(() => {
    if (tickers.length === 0 && enriched.length > 0) {
      setTickers(enriched.map((h) => h.ticker))
    }
  }, [enriched, tickers.length])

  // Fetch histories whenever tickers or period changes
  useEffect(() => {
    if (tickers.length === 0) return
    setLoadingHistory(true)
    fetch(`/api/historical?tickers=${encodeURIComponent(tickers.join(','))}&period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        const h: Record<string, { date: string; close: number }[]> = {}
        for (const t of tickers) h[t] = data.history?.[t] ?? []
        setHistories(h)
      })
      .catch((e) => console.error('History fetch failed:', e))
      .finally(() => setLoadingHistory(false))
  }, [tickers.join(','), period]) // eslint-disable-line react-hooks/exhaustive-deps

  // Monthly returns per ticker + aligned matrix
  const aligned = useMemo(() => {
    const perTicker: Record<string, { months: string[]; returns: number[] }> = {}
    for (const t of tickers) {
      perTicker[t] = dailyToMonthlyReturns(histories[t] ?? [])
    }
    return alignMonthlyReturns(perTicker, tickers)
  }, [tickers, histories])

  // Historical mean per ticker (for display & override defaults)
  const historicalMeans = useMemo(
    () => aligned.matrix.map((row) => annualizedMean(row)),
    [aligned],
  )

  // Build expected-return vector with user overrides applied
  const expectedReturns = useMemo(() => {
    return tickers.map((t, i) => {
      const v = overrides[t]
      const parsed = v !== undefined && v !== '' ? parseFloat(v) : NaN
      return isNaN(parsed) ? historicalMeans[i] : parsed
    })
  }, [tickers, overrides, historicalMeans])

  const [result, setResult] = useState<ReturnType<typeof runOptimizer> | null>(null)

  const run = () => {
    if (tickers.length < 2) {
      toast.error('Add at least 2 tickers to optimize')
      return
    }
    if (aligned.months.length < 6) {
      toast.error('Not enough overlapping history for these tickers — try a longer period or different mix')
      return
    }
    setRunning(true)
    // Run on next tick so the UI can show the spinner
    setTimeout(() => {
      const out = runOptimizer({
        tickers,
        monthlyReturns: aligned.matrix,
        expectedReturnsAnnualized: expectedReturns,
        riskFreeRatePct: parseFloat(riskFree) || 0,
        simulations: Math.max(100, Math.min(20000, parseInt(simulations, 10) || 5000)),
        seed: 42,
      })
      setResult(out)
      setRunning(false)
    }, 50)
  }

  // Score the user's current allocation under the same math
  const currentPortfolio = useMemo<PortfolioPoint | null>(() => {
    if (!result || tickers.length === 0 || enriched.length === 0) return null
    const totalValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)
    if (totalValue <= 0) return null
    const weights = tickers.map((t) => {
      const h = enriched.find((x) => x.ticker.toUpperCase() === t.toUpperCase())
      return h ? h.currentValueBase / totalValue : 0
    })
    const sum = weights.reduce((s, w) => s + w, 0)
    if (sum <= 0) return null
    const normalized = weights.map((w) => w / sum)
    const cov = annualizedCovariance(aligned.matrix)
    return scorePortfolio(normalized, expectedReturns, cov, aligned.matrix, parseFloat(riskFree) || 0)
  }, [result, tickers, enriched, aligned, expectedReturns, riskFree])

  const winner = result
    ? (target === 'sharpe' ? result.tangency : result.maxSortino)
    : null

  const addTicker = (t: string) => {
    const upper = t.toUpperCase().trim()
    if (!upper) return
    if (tickers.includes(upper)) return
    setTickers([...tickers, upper])
    setNewTicker('')
  }

  const removeTicker = (t: string) => {
    setTickers(tickers.filter((x) => x !== t))
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[t]
      return next
    })
  }

  const applyToPlanner = () => {
    if (!winner) return
    const positions = tickers.map((t, i) => ({
      id: Math.random().toString(36).slice(2, 10),
      ticker: t,
      name: '',
      pct: parseFloat((winner.weights[i] * 100).toFixed(2)),
    })).filter((p) => p.pct > 0.1)
    const totalValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)
    const planner = { positions, totalValue: Math.round(totalValue) || 100000 }
    localStorage.setItem(PLANNER_KEY, JSON.stringify(planner))
    toast.success('Optimal weights applied to Planner')
    router.push('/planner')
  }

  // Chart data — points colored by Sharpe quintile
  const chartData = useMemo(() => {
    if (!result) return []
    return result.points.map((p) => ({
      vol: parseFloat(p.volatility.toFixed(2)),
      ret: parseFloat(p.expectedReturn.toFixed(2)),
      sharpe: p.sharpe,
    }))
  }, [result])

  const chartHighlights = useMemo(() => {
    if (!result) return []
    const items: { name: string; vol: number; ret: number; color: string }[] = []
    items.push({ name: 'Max Sharpe (Tangency)', vol: result.tangency.volatility, ret: result.tangency.expectedReturn, color: '#22c55e' })
    items.push({ name: 'Max Sortino', vol: result.maxSortino.volatility, ret: result.maxSortino.expectedReturn, color: '#0ea5e9' })
    items.push({ name: 'Min volatility', vol: result.minVol.volatility, ret: result.minVol.expectedReturn, color: '#a855f7' })
    if (currentPortfolio) {
      items.push({ name: 'Current portfolio', vol: currentPortfolio.volatility, ret: currentPortfolio.expectedReturn, color: '#f59e0b' })
    }
    return items
  }, [result, currentPortfolio])

  const initialLoading = loadingHistory && Object.keys(histories).length === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Compass className="h-6 w-6 text-primary" /> Portfolio Optimizer
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Monte Carlo simulation of the efficient frontier. Finds the weight mix with the highest
          risk-adjusted return (Sharpe or Sortino) — the &ldquo;tangency portfolio&rdquo; — using your candidate tickers.
        </p>
      </div>

      {/* Inputs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inputs</CardTitle>
          <CardDescription>
            Start with your current holdings, add diversifiers, override expected returns if you have a forward view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Top-level controls */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">History period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Risk-free rate %</Label>
              <Input
                type="number" step="0.1" value={riskFree}
                onChange={(e) => setRiskFree(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Simulations</Label>
              <Input
                type="number" step="500" min="500" max="20000"
                value={simulations}
                onChange={(e) => setSimulations(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Optimize for</Label>
              <Select value={target} onValueChange={(v) => setTarget(v as 'sharpe' | 'sortino')}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sharpe">Sharpe (total volatility)</SelectItem>
                  <SelectItem value="sortino">Sortino (downside only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Ticker editor */}
          <div>
            <Label className="text-xs">Candidate tickers</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tickers.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs">
                  {t}
                  <button type="button" onClick={() => removeTicker(t)} aria-label={`Remove ${t}`}>
                    <X className="h-3 w-3 text-muted-foreground hover:text-red-400" />
                  </button>
                </span>
              ))}
              <div className="flex gap-1">
                <Input
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTicker(newTicker))}
                  placeholder="Add ticker"
                  className="h-7 w-32 text-xs"
                />
                <Button size="sm" variant="outline" className="h-7" onClick={() => addTicker(newTicker)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-muted-foreground">Common diversifiers:</span>
              {SUGGESTED_DIVERSIFIERS.map((s) => (
                <button
                  key={s.ticker}
                  type="button"
                  onClick={() => addTicker(s.ticker)}
                  disabled={tickers.includes(s.ticker)}
                  className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                  title={s.label}
                >
                  + {s.ticker}
                </button>
              ))}
            </div>
          </div>

          {/* Expected return overrides */}
          {tickers.length > 0 && (
            <details className="rounded-md border border-border bg-muted/30 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Expected returns
                <span className="ml-2 text-xs text-muted-foreground">(defaults to historical mean — override if you have a forward view)</span>
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {tickers.map((t, i) => (
                  <div key={t} className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{t}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Historical: {formatPercent(historicalMeans[i] ?? 0, 1)} /yr
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number" step="0.1"
                        placeholder="auto"
                        value={overrides[t] ?? ''}
                        onChange={(e) => setOverrides({ ...overrides, [t]: e.target.value })}
                        className="h-8 w-20 text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">% /yr</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                <strong>The Misho critique:</strong> historical returns rarely equal future returns.
                Mean-variance optimisation is an &ldquo;error-maximizing algorithm&rdquo; — it will overweight whichever asset happened to do best in your window.
                Override with forward-looking estimates (e.g. earnings yield, Vanguard / GMO capital-market assumptions) for more honest output.
              </p>
            </details>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button onClick={run} disabled={running || tickers.length < 2 || initialLoading}>
              {running
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Running…</>
                : <><Wand2 className="mr-1.5 h-4 w-4" /> Run optimizer</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {initialLoading && (
        <div className="grid gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-80" />
        </div>
      )}

      {/* Results */}
      {result && winner && (
        <>
          {/* Headline cards */}
          <div className="grid gap-3 md:grid-cols-4">
            <ResultCard
              label={target === 'sharpe' ? 'Max Sharpe' : 'Max Sortino'}
              point={winner}
              accent="text-emerald-400"
              metric={target}
            />
            <ResultCard
              label="Min volatility"
              point={result.minVol}
              accent="text-purple-400"
              metric={target}
            />
            {currentPortfolio && (
              <ResultCard
                label="Your current"
                point={currentPortfolio}
                accent="text-amber-400"
                metric={target}
              />
            )}
            <Card>
              <CardContent className="py-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Apply optimal</div>
                <p className="text-xs text-muted-foreground">
                  Send {target === 'sharpe' ? 'tangency' : 'max-Sortino'} weights to the Planner for further analysis.
                </p>
                <Button size="sm" onClick={applyToPlanner} className="w-full">
                  Apply to Planner <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Efficient frontier scatter */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Efficient frontier</CardTitle>
              <CardDescription>
                Each dot is a random portfolio. The upper-left envelope is the frontier —
                best return for any given risk. Stars mark the optimal portfolios.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number" dataKey="vol" name="Volatility"
                    tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v) => `${v.toFixed(1)}%`}
                    label={{ value: 'Annualized volatility (%)', position: 'bottom', offset: 10, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    type="number" dataKey="ret" name="Expected return"
                    tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v) => `${v.toFixed(1)}%`}
                    label={{ value: 'Expected return (%)', angle: -90, position: 'left', offset: 0, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <ZAxis range={[10, 10]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(v) => typeof v === 'number' ? `${v.toFixed(2)}%` : String(v)}
                  />
                  <ReferenceLine
                    y={parseFloat(riskFree) || 0}
                    stroke="#64748b" strokeDasharray="2 4"
                    label={{ value: 'Risk-free', fontSize: 10, fill: '#64748b', position: 'insideTopLeft' }}
                  />
                  <Scatter name="Portfolios" data={chartData} fill="#6366f1">
                    {chartData.map((d, i) => {
                      // Color gradient by Sharpe — higher = greener
                      const sharpeMax = Math.max(...chartData.map((x) => x.sharpe), 0.1)
                      const intensity = Math.min(1, Math.max(0, d.sharpe / sharpeMax))
                      const hue = 200 + intensity * 100  // 200 (blue) → 300 (purple/pink-green)
                      return <Cell key={i} fill={`hsl(${hue}, 70%, 55%)`} fillOpacity={0.45} />
                    })}
                  </Scatter>
                  {chartHighlights.map((h) => (
                    <Scatter
                      key={h.name}
                      name={h.name}
                      data={[{ vol: parseFloat(h.vol.toFixed(2)), ret: parseFloat(h.ret.toFixed(2)) }]}
                      fill={h.color}
                      shape="star"
                    />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tangency weights table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Optimal weights — {target === 'sharpe' ? 'max Sharpe (tangency)' : 'max Sortino'}
              </CardTitle>
              <CardDescription>
                Per-ticker allocation that maximises the chosen risk-adjusted return.
                Compare against your current weights to see what to add or trim.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Ticker</th>
                      <th className="px-4 py-2 font-medium text-right">Optimal %</th>
                      <th className="px-4 py-2 font-medium text-right">Current %</th>
                      <th className="px-4 py-2 font-medium text-right">Delta</th>
                      <th className="px-4 py-2 font-medium text-right">Expected return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickers.map((t, i) => {
                      const optimalPct = winner.weights[i] * 100
                      const currentPct = currentPortfolio ? currentPortfolio.weights[i] * 100 : 0
                      const delta = optimalPct - currentPct
                      return (
                        <tr key={t} className="border-b border-border/50 last:border-0">
                          <td className="px-4 py-2.5 font-medium">{t}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{optimalPct.toFixed(1)}%</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                            {currentPortfolio ? `${currentPct.toFixed(1)}%` : '—'}
                          </td>
                          <td className={`px-4 py-2.5 text-right tabular-nums ${
                            !currentPortfolio ? 'text-muted-foreground'
                            : delta > 0 ? 'text-emerald-400'
                            : delta < 0 ? 'text-red-400' : 'text-muted-foreground'
                          }`}>
                            {currentPortfolio
                              ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                            {formatPercent(expectedReturns[i] ?? 0, 1)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="text-[10px] text-muted-foreground">
            <MetricLabel term="sharpe">Sharpe</MetricLabel> and <MetricLabel term="sortino">Sortino</MetricLabel> are
            risk-adjusted return metrics. Sharpe uses total volatility; Sortino punishes only downside.
            Mean-variance optimisation is sensitive to input estimates — small changes in expected returns can shift the
            tangency portfolio dramatically. Use it as a sanity-check, not a literal target.
          </p>
        </>
      )}
    </div>
  )
}

function ResultCard({
  label, point, accent, metric,
}: {
  label: string
  point: PortfolioPoint
  accent: string
  metric: 'sharpe' | 'sortino'
}) {
  return (
    <Card>
      <CardContent className="py-3 space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold tabular-nums ${accent}`}>
          {(metric === 'sharpe' ? point.sharpe : point.sortino).toFixed(2)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {metric === 'sharpe' ? 'Sharpe ratio' : 'Sortino ratio'}
        </div>
        <div className="pt-1 text-xs space-y-0.5 tabular-nums">
          <div className="flex justify-between"><span className="text-muted-foreground">Return</span> <span>{point.expectedReturn.toFixed(1)}%</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Volatility</span> <span>{point.volatility.toFixed(1)}%</span></div>
        </div>
      </CardContent>
    </Card>
  )
}

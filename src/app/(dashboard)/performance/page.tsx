'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { DEFAULT_BENCHMARKS } from '@/types'
import { format, parseISO } from 'date-fns'
import { RefreshCw } from 'lucide-react'

const PERIODS = [
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: 'YTD', value: 'ytd' },
  { label: '1Y', value: '1y' },
  { label: '3Y', value: '3y' },
]

const LINE_COLORS = ['#6366f1', '#22c55e', '#f97316', '#ec4899', '#0ea5e9', '#eab308']

function normalizeToBase(series: { date: string; close: number }[]): { date: string; value: number }[] {
  if (series.length === 0) return []
  const base = series[0].close
  return series.map((d) => ({ date: d.date, value: parseFloat(((d.close / base) * 100).toFixed(2)) }))
}

function mergeSeriesOnDates(
  portfolio: { date: string; value: number }[],
  benchmarks: Record<string, { date: string; value: number }[]>,
): any[] {
  const dateMap = new Map<string, any>()
  portfolio.forEach((p) => dateMap.set(p.date, { date: p.date, Portfolio: p.value }))
  Object.entries(benchmarks).forEach(([ticker, series]) => {
    series.forEach((p) => {
      const row = dateMap.get(p.date) ?? { date: p.date }
      row[ticker] = p.value
      dateMap.set(p.date, row)
    })
  })
  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export default function PerformancePage() {
  const { holdings, fxRates } = usePortfolio()
  const [period, setPeriod] = useState('1y')
  const [activeBenchmarks, setActiveBenchmarks] = useState<string[]>(['SPY'])
  const [chartData, setChartData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (holdings.length === 0) return
    setLoading(true)

    const holdingTickers = holdings.map((h) => h.ticker)
    const allTickers = [...holdingTickers, ...activeBenchmarks]

    const res = await fetch(`/api/historical?tickers=${allTickers.join(',')}&period=${period}`)
    if (!res.ok) { setLoading(false); return }

    const { history } = await res.json() as { history: Record<string, { date: string; close: number }[]> }

    // Build portfolio value series: assume equal-weighted by current allocation
    // (simplification since we don't have historical fx rates)
    const holdingData = holdingTickers
      .map((t) => ({ ticker: t, series: history[t] ?? [] }))
      .filter((d) => d.series.length > 0)

    if (holdingData.length === 0) { setLoading(false); return }

    // Find common date range across all holdings
    const allDates = holdingData[0].series.map((d) => d.date)
    const holdingMaps = holdingData.map((hd) => {
      const map = new Map(hd.series.map((d) => [d.date, d.close]))
      return { ticker: hd.ticker, map }
    })

    // Calculate weighted portfolio return on each date
    const portfolioSeries: { date: string; close: number }[] = allDates
      .filter((date) => holdingMaps.every((hm) => hm.map.has(date)))
      .map((date) => {
        // Simple average of normalized returns across holdings
        const avg = holdingMaps.reduce((sum, hm) => sum + (hm.map.get(date) ?? 0), 0) / holdingMaps.length
        return { date, close: avg }
      })

    const normalizedPortfolio = normalizeToBase(portfolioSeries)

    const normalizedBenchmarks: Record<string, { date: string; value: number }[]> = {}
    activeBenchmarks.forEach((ticker) => {
      if (history[ticker]) {
        normalizedBenchmarks[ticker] = normalizeToBase(history[ticker])
      }
    })

    setChartData(mergeSeriesOnDates(normalizedPortfolio, normalizedBenchmarks))
    setLoading(false)
  }, [holdings, activeBenchmarks, period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleBenchmark = (ticker: string) => {
    setActiveBenchmarks((prev) =>
      prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker],
    )
  }

  const lines = ['Portfolio', ...activeBenchmarks]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Performance</h1>
          <p className="text-sm md:text-base text-muted-foreground">Normalised returns (base = 100 at start of period)</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="self-start sm:self-auto">
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Period selector */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                period === p.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Benchmark toggles */}
        <div className="flex flex-wrap gap-2">
          {DEFAULT_BENCHMARKS.map((b) => (
            <button
              key={b.ticker}
              onClick={() => toggleBenchmark(b.ticker)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                activeBenchmarks.includes(b.ticker)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Normalised Return (%)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-80 w-full" />
          ) : chartData.length === 0 ? (
            <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
              {holdings.length === 0 ? 'Add holdings to see performance' : 'No data available for this period'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => {
                    try { return format(parseISO(d), period === '1m' ? 'MMM d' : 'MMM yy') } catch { return d }
                  }}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false} tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v) => `${v}`}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false} tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  formatter={(value, name) => [typeof value === 'number' ? value.toFixed(2) : value, name]}
                  labelFormatter={(label) => {
                    try { return format(parseISO(label), 'dd MMM yyyy') } catch { return label }
                  }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {lines.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    dot={false}
                    strokeWidth={name === 'Portfolio' ? 2.5 : 1.5}
                    strokeDasharray={name === 'Portfolio' ? undefined : '4 2'}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

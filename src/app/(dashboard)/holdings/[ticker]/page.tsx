'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { usePortfolio } from '@/context/PortfolioContext'
import { formatCurrency, formatPercent, formatShares, cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TLink } from '@/components/motion/TLink'
import { ArrowLeft } from 'lucide-react'
import type { Currency, PriceQuote } from '@/types'
import type { ValuationMetrics } from '@/app/api/valuation/route'

// Range chips → /api/historical periods. 1D/5D are intraday (5m/30m bars),
// ALL is weekly bars over the ticker's full history.
const RANGES = [
  { key: '1D', period: '1d' },
  { key: '5D', period: '5d' },
  { key: '1M', period: '1m' },
  { key: '6M', period: '6m' },
  { key: 'YTD', period: 'ytd' },
  { key: '1Y', period: '1y' },
  { key: '5Y', period: '5y' },
  { key: 'ALL', period: 'all' },
] as const
type RangeKey = (typeof RANGES)[number]['key']

const UP = '#2f8f5b'
const DOWN = '#9a4a3f'

interface Point { date: string; close: number }

export default function StockDetailPage() {
  const params = useParams<{ ticker: string }>()
  const ticker = decodeURIComponent(String(params?.ticker ?? '')).toUpperCase()
  const { holdings, enriched, prices, transactions, settings } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const holding = holdings.find((h) => h.ticker.toUpperCase() === ticker)
  const position = enriched.find((h) => h.ticker.toUpperCase() === ticker)
  const ctxQuote = prices[ticker] ?? prices[holding?.ticker ?? '']

  const [quote, setQuote] = useState<PriceQuote | null>(ctxQuote ?? null)
  const [range, setRange] = useState<RangeKey>('6M')
  const [seriesByRange, setSeriesByRange] = useState<Partial<Record<RangeKey, Point[]>>>({})
  const [chartLoading, setChartLoading] = useState(true)
  const [metrics, setMetrics] = useState<ValuationMetrics | null>(null)

  // Quote: prefer the already-loaded portfolio quote; fetch if missing.
  useEffect(() => {
    if (ctxQuote) { setQuote(ctxQuote); return }
    if (!ticker) return
    fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: [ticker] }),
    })
      .then((r) => r.json())
      .then((d) => { if (d?.quotes?.[ticker]) setQuote(d.quotes[ticker]) })
      .catch(() => { /* chart + stats still render */ })
  }, [ticker, ctxQuote])

  // History for the selected range, cached per range.
  useEffect(() => {
    if (!ticker) return
    const cfg = RANGES.find((r) => r.key === range)!
    if (seriesByRange[range]) { setChartLoading(false); return }
    setChartLoading(true)
    fetch(`/api/historical?tickers=${encodeURIComponent(ticker)}&period=${cfg.period}`)
      .then((r) => r.json())
      .then((d) => setSeriesByRange((s) => ({ ...s, [range]: d?.history?.[ticker] ?? [] })))
      .catch(() => setSeriesByRange((s) => ({ ...s, [range]: [] })))
      .finally(() => setChartLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, range])

  // Valuation stats (P/E, yield, 52w range, RSI…), once.
  useEffect(() => {
    if (!ticker) return
    fetch('/api/valuation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: [ticker] }),
    })
      .then((r) => r.json())
      .then((d) => setMetrics(d?.metrics?.[ticker] ?? null))
      .catch(() => { /* stats grid shows em-dashes */ })
  }, [ticker])

  const series = seriesByRange[range] ?? []
  const cur = quote?.currency ?? position?.priceCurrency ?? 'USD'

  // Range change: first close vs latest (live quote when we have one).
  const first = series[0]?.close
  const last = quote?.price ?? series[series.length - 1]?.close
  const rangeChange = first != null && last != null ? last - first : null
  const rangeChangePct = first ? ((last! - first) / first) * 100 : null
  const rangeUp = (rangeChange ?? 0) >= 0

  const intraday = range === '1D' || range === '5D'
  const xTick = (d: string) => (range === '1D' ? d.slice(11) : intraday ? d.slice(5, 16) : d)

  const tickerTxns = useMemo(
    () => transactions.filter((t) => t.ticker.toUpperCase() === ticker).slice(0, 12),
    [transactions, ticker],
  )

  const chartColor = rangeUp ? UP : DOWN

  return (
    <PageShell
      screen="Invest"
      title={ticker}
      statusRight={<TLink href="/holdings" className="flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> holdings</TLink>}
      footerHints={<span><span className="text-accent">▸</span> <span className="text-foreground">g o</span> holdings · <span className="text-foreground">g h</span> home</span>}
    >
    <div className="space-y-4">
      {/* Price header + chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{quote?.longName ?? holding?.name ?? ticker}</CardTitle>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-2xl font-semibold tabular-nums">
                  {quote ? formatCurrency(quote.price, cur) : '—'}
                </span>
                {quote && (
                  <span className={`text-sm tabular-nums ${quote.change >= 0 ? 'text-up' : 'text-down'}`}>
                    {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({formatPercent(quote.changePercent)}) today
                  </span>
                )}
              </div>
              {rangeChange != null && (
                <div className={`mt-0.5 text-xs tabular-nums ${rangeUp ? 'text-up' : 'text-down'}`}>
                  {rangeUp ? '+' : '−'}{formatCurrency(Math.abs(rangeChange), cur)}
                  {rangeChangePct != null && ` (${formatPercent(rangeChangePct)})`}
                  <span className="text-muted-foreground"> over {range === 'ALL' ? 'all time' : range}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors',
                    range === r.key ? 'border-accent bg-[var(--accent-soft)] text-accent font-medium' : 'border-border text-muted-foreground hover:text-foreground')}
                >
                  {r.key}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : series.length < 2 ? (
            <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
              No price history for this range{intraday ? ' (market may be closed / intraday data unavailable)' : ''}.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="stockFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                  tickFormatter={xTick} minTickGap={48} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false}
                  width={56} domain={['auto', 'auto']}
                  tickFormatter={(v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
                <Tooltip
                  formatter={(v) => [formatCurrency(Number(v), cur), 'Price']}
                  labelFormatter={(d) => String(d)}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                {first != null && (
                  <ReferenceLine y={first} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                )}
                <Area type="monotone" dataKey="close" stroke={chartColor} strokeWidth={2} fill="url(#stockFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Your position */}
      {position && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your position</CardTitle>
            <CardDescription>In {base} · {formatShares(Number(holding?.shares ?? 0))} shares</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <Stat label="Market value" value={formatCurrency(position.currentValueBase, base)} />
              <Stat label="Cost basis" value={formatCurrency(position.costBasisBase, base)}
                hint={holding ? `${formatCurrency(Number(holding.cost_basis_per_share), holding.cost_basis_currency)} / share` : undefined} />
              <Stat
                label="Unrealized P/L"
                value={`${position.gainLoss >= 0 ? '+' : ''}${formatCurrency(position.gainLoss, base)}`}
                valueColor={position.gainLoss >= 0 ? 'text-up' : 'text-down'}
                hint={formatPercent(position.gainLossPct)}
              />
              <Stat label="Of portfolio" value={`${position.allocationPct.toFixed(1)}%`} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>Valuation & technicals{metrics ? '' : ' — loading…'}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Stat label="P/E (trailing)" value={fmtNum(metrics?.trailingPE)} />
            <Stat label="P/E (forward)" value={fmtNum(metrics?.forwardPE)} />
            <Stat label="Price / book" value={fmtNum(metrics?.priceToBook)} />
            <Stat label="Dividend yield" value={metrics?.dividendYield != null ? `${(metrics.dividendYield * 100).toFixed(2)}%` : '—'} />
            <Stat label="52-week high" value={metrics?.high52w != null ? formatCurrency(metrics.high52w, cur) : '—'} />
            <Stat label="52-week low" value={metrics?.low52w != null ? formatCurrency(metrics.low52w, cur) : '—'} />
            <Stat
              label="From 52w high"
              value={metrics?.drawdownFromHigh != null ? formatPercent(metrics.drawdownFromHigh) : '—'}
              valueColor={metrics?.drawdownFromHigh != null && metrics.drawdownFromHigh < -10 ? 'text-down' : undefined}
            />
            <Stat
              label="1-year change"
              value={metrics?.yearChange != null ? formatPercent(metrics.yearChange) : '—'}
              valueColor={metrics?.yearChange != null ? (metrics.yearChange >= 0 ? 'text-up' : 'text-down') : undefined}
            />
            <Stat label="RSI (14d)" value={fmtNum(metrics?.rsi14)}
              hint={metrics?.rsi14 != null ? (metrics.rsi14 > 70 ? 'overbought' : metrics.rsi14 < 30 ? 'oversold' : 'neutral') : undefined} />
            <Stat label="50-day avg" value={metrics?.sma50 != null ? formatCurrency(metrics.sma50, cur) : '—'} />
            <Stat label="200-day avg" value={metrics?.sma200 != null ? formatCurrency(metrics.sma200, cur) : '—'} />
            <Stat label="Price / sales" value={fmtNum(metrics?.priceToSales)} />
          </div>
        </CardContent>
      </Card>

      {/* Your transactions in this ticker */}
      {tickerTxns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your transactions</CardTitle>
            <CardDescription>Latest {tickerTxns.length} · full log under Holdings → Transactions</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickerTxns.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="py-2 text-xs whitespace-nowrap">{t.date}</TableCell>
                    <TableCell className="py-2 text-xs capitalize">{t.type}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums text-sm">{formatShares(Number(t.shares))}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums text-sm">
                      {Number(t.price_per_share) > 0 ? formatCurrency(Number(t.price_per_share), t.currency) : '—'}
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums text-sm">
                      {Number(t.amount) > 0 ? formatCurrency(Number(t.amount), t.currency) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
    </PageShell>
  )
}

function fmtNum(n?: number): string {
  return n != null && Number.isFinite(n) ? n.toFixed(2) : '—'
}

function Stat({ label, value, valueColor, hint }: {
  label: string; value: string; valueColor?: string; hint?: string
}) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${valueColor ?? ''}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  )
}

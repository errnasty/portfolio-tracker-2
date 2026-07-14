'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '@/lib/supabase'
import { usePortfolio } from '@/context/PortfolioContext'
import { formatCurrency, cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageShell } from '@/components/ui/page-shell'
import { SubNav } from '@/components/ui/sub-nav'
import { SUB_NAVS } from '@/lib/nav-registry'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
import { Skeleton } from '@/components/ui/skeleton'
import type { Currency, NetWorthSnapshot } from '@/types'

// Net worth trend — full-size version of the Home sparkline (dataviz: single
// series area, one axis; ink line so it never fights the composition bars).

type RangeKey = '3m' | '6m' | '1y' | 'all'
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '3m', label: '3M', days: 91 },
  { key: '6m', label: '6M', days: 182 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All', days: null },
]

export default function NetWorthPage() {
  const {
    settings, netWorthBase, totalCashBase, accountsNetBase, assetsBase, liabilitiesBase,
    enriched, loading: portfolioLoading,
  } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency
  const holdingsValueBase = enriched.reduce((s, h) => s + h.currentValueBase, 0)

  const [range, setRange] = useState<RangeKey>('6m')
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('networth_snapshots')
      .select('date, net_worth, currency, holdings_value, accounts_value, assets_value, liabilities_value')
      .eq('user_id', user.id)
      .order('date')
    if (data) { setSnapshots(data); return }
    // Older DBs without composition columns reject the select — retry bare.
    const { data: bare } = await supabase
      .from('networth_snapshots')
      .select('date, net_worth, currency')
      .eq('user_id', user.id)
      .order('date')
    setSnapshots(bare ?? [])
  }, [])

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [refresh])

  const series = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days
    const cutoff = days ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) : ''
    const rows = snapshots
      .filter((s) => !days || s.date >= cutoff)
      .map((s) => ({ date: s.date, value: Number(s.net_worth) }))
    // Append a live "today" point so the chart never lags the hero number.
    const today = new Date().toISOString().slice(0, 10)
    if (netWorthBase > 0 && (rows.length === 0 || rows[rows.length - 1].date !== today)) {
      rows.push({ date: today, value: netWorthBase })
    }
    return rows
  }, [snapshots, range, netWorthBase])

  const rangeChange = series.length >= 2 ? series[series.length - 1].value - series[0].value : 0
  const rangeChangePct = series.length >= 2 && series[0].value !== 0
    ? (rangeChange / Math.abs(series[0].value)) * 100 : 0

  // Current composition, negatives (credit-heavy accounts, liabilities) shown as such.
  const composition = [
    { label: 'Bank & cash accounts', value: accountsNetBase },
    { label: 'Investments', value: holdingsValueBase },
    { label: 'Other assets (CPF, deposits, property)', value: assetsBase },
    { label: 'Debts', value: -liabilitiesBase },
  ].filter((c) => Math.abs(c.value) > 0.005)
  const compositionMax = Math.max(1, ...composition.map((c) => Math.abs(c.value)))

  return (
    <PageShell
      screen="Money" title="Net worth"
      statusRight={<span>{snapshots.length} daily snapshot{snapshots.length === 1 ? '' : 's'}</span>}
      footerHints={<span><span className="text-accent">▸</span> <span className="text-foreground">g a</span> accounts · <span className="text-foreground">g h</span> home</span>}
    >
    <div className="space-y-4">
      <SubNav links={[...SUB_NAVS.accounts]} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            label="Net worth"
            value={netWorthBase}
            format={(n) => formatCurrency(n, base)}
            sub="accounts + investments + assets − debts"
          />
          <HeroMetric
            label={`Change · ${RANGES.find((r) => r.key === range)?.label}`}
            value={rangeChange}
            format={(n) => `${n >= 0 ? '+' : ''}${formatCurrency(n, base)}`}
            delta={series.length >= 2 ? [
              <span key="p" className={rangeChange >= 0 ? 'text-up' : 'text-down'}>
                {rangeChange >= 0 ? '+' : ''}{rangeChangePct.toFixed(1)}%
              </span>,
            ] : undefined}
          />
          <HeroMetric
            label="Investable cash"
            value={totalCashBase}
            format={(n) => formatCurrency(n, base)}
            sub="ready to deploy"
          />
        </HeroBand>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Trend</CardTitle>
              <CardDescription>One snapshot per day you open the app</CardDescription>
            </div>
            <div className="flex items-center gap-1.5">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={cn('rounded-full border px-3 py-1 text-xs transition-colors',
                    range === r.key ? 'border-accent bg-[var(--accent-soft)] text-accent font-medium' : 'border-border text-muted-foreground hover:text-foreground')}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading || portfolioLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : series.length < 2 ? (
            <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
              Not enough history yet — a snapshot is saved each day you open the app.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2f8f5b" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2f8f5b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" minTickGap={40} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} width={56}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => formatCurrency(Number(v), base, true)} />
                <Tooltip
                  formatter={(v) => [formatCurrency(Number(v), base), 'Net worth']}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="value" stroke="#2f8f5b" strokeWidth={2} fill="url(#nwFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What it&apos;s made of</CardTitle>
          <CardDescription>Today&apos;s composition, in {base}</CardDescription>
        </CardHeader>
        <CardContent>
          {composition.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Add accounts, holdings, or assets to see the breakdown.
            </div>
          ) : (
            <div className="space-y-2.5">
              {composition.map((c) => {
                const neg = c.value < 0
                return (
                  <div key={c.label}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span>{c.label}</span>
                      <span className={`tabular-nums font-medium ${neg ? 'text-down' : ''}`}>
                        {neg ? '−' : ''}{formatCurrency(Math.abs(c.value), base)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--hair)]">
                      <div
                        className={`h-full rounded-full ${neg ? 'bg-down' : 'bg-up'}`}
                        style={{ width: `${(Math.abs(c.value) / compositionMax) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </PageShell>
  )
}

'use client'

import { useEffect, useState, useMemo } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { PageShell } from '@/components/ui/page-shell'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { convertToBase } from '@/lib/calculations'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { Currency } from '@/types'
import type { DividendData } from '@/app/api/dividends/route'
import { detectDomicile, singaporeDwtRate, DOMICILE_LABEL, type Domicile } from '@/lib/tax'
import { Receipt } from 'lucide-react'
import { MetricLabel } from '@/components/ui/metric-label'

export default function DividendsPage() {
  const { enriched, transactions, fxRates, settings, loading: portfolioLoading } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [dividends, setDividends] = useState<Record<string, DividendData>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (enriched.length === 0) return
    setLoading(true)
    fetch('/api/dividends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: enriched.map((h) => h.ticker) }),
    })
      .then((r) => r.json())
      .then((data) => setDividends(data.dividends ?? {}))
      .catch((err) => console.error('Dividends fetch failed:', err))
      .finally(() => setLoading(false))
  }, [enriched.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const perHolding = useMemo(() => {
    if (!fxRates) return []
    return enriched.map((h) => {
      const data = dividends[h.ticker]
      const ttm = data?.ttmPerShare ?? 0
      const cur = data?.currency ?? h.priceCurrency
      const annualIncomeLocal = ttm * h.shares
      const annualIncomeBase = convertToBase(annualIncomeLocal, cur, fxRates)
      const yieldPct = h.currentPrice > 0 ? (ttm / h.currentPrice) * 100 : 0
      const yieldOnCost = h.cost_basis_per_share > 0 ? (ttm / h.cost_basis_per_share) * 100 : 0
      const domicile = detectDomicile(h.ticker)
      const dwtRate = base === 'SGD' ? singaporeDwtRate(domicile) : 0
      const wht = annualIncomeBase * dwtRate
      const netIncomeBase = annualIncomeBase - wht
      return {
        ticker: h.ticker,
        name: h.name ?? '',
        shares: h.shares,
        currentValueBase: h.currentValueBase,
        ttmPerShare: ttm,
        annualIncomeBase,
        currency: cur,
        yieldPct,
        yieldOnCost,
        events: data?.events ?? [],
        domicile,
        dwtRate,
        wht,
        netIncomeBase,
      }
    }).sort((a, b) => b.annualIncomeBase - a.annualIncomeBase)
  }, [enriched, dividends, fxRates, base])

  const totals = useMemo(() => {
    const totalForwardIncome = perHolding.reduce((s, h) => s + h.annualIncomeBase, 0)
    const totalValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)
    const totalCost = enriched.reduce((s, h) => s + h.costBasisBase, 0)
    const portfolioYield = totalValue > 0 ? (totalForwardIncome / totalValue) * 100 : 0
    const portfolioYoc = totalCost > 0 ? (totalForwardIncome / totalCost) * 100 : 0

    // Realized dividends from transaction log, converted to base
    let received = 0
    if (fxRates) {
      for (const t of transactions) {
        if (t.type === 'dividend') {
          received += convertToBase(t.amount, t.currency, fxRates)
        }
      }
    }

    // 12-month received from txn log
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 1)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    let received12m = 0
    if (fxRates) {
      for (const t of transactions) {
        if (t.type === 'dividend' && t.date >= cutoffStr) {
          received12m += convertToBase(t.amount, t.currency, fxRates)
        }
      }
    }

    return { totalForwardIncome, portfolioYield, portfolioYoc, received, received12m }
  }, [perHolding, enriched, transactions, fxRates])

  // Monthly chart of forward dividend payments by aligning each holding's
  // historical pay-pattern (months it has paid in TTM) and projecting forward
  const monthlyChart = useMemo(() => {
    const map = new Map<string, number>()
    if (!fxRates) return []
    const now = new Date()
    const months: string[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push(key)
      map.set(key, 0)
    }

    for (const h of perHolding) {
      // Use the TTM pattern: which months did each share earn dividends?
      // Project the same months forward.
      const cutoff = new Date()
      cutoff.setFullYear(cutoff.getFullYear() - 1)
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      const ttmEvents = h.events.filter((e) => e.date >= cutoffStr)
      for (const e of ttmEvents) {
        const m = parseInt(e.date.slice(5, 7), 10)
        // Project: same month of upcoming 12-month window
        const projDate = new Date(now.getFullYear(), m - 1, 1)
        if (projDate < new Date(now.getFullYear(), now.getMonth(), 1)) {
          projDate.setFullYear(projDate.getFullYear() + 1)
        }
        const key = `${projDate.getFullYear()}-${String(projDate.getMonth() + 1).padStart(2, '0')}`
        if (!map.has(key)) continue
        const payment = e.amount * h.shares
        const inBase = convertToBase(payment, h.currency, fxRates)
        map.set(key, (map.get(key) ?? 0) + inBase)
      }
    }
    return months.map((m) => {
      const [y, mo] = m.split('-')
      const monthLabel = new Date(parseInt(y, 10), parseInt(mo, 10) - 1, 1).toLocaleDateString('en-US', { month: 'short' })
      return { month: monthLabel, key: m, amount: map.get(m) ?? 0 }
    })
  }, [perHolding, fxRates])

  const initialLoading = portfolioLoading || (loading && Object.keys(dividends).length === 0)

  if (!portfolioLoading && enriched.length === 0) {
    return (
      <PageShell screen="Invest" title="Dividends">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Add holdings to see dividend tracking.
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  return (
    <PageShell screen="Invest" title="Dividends" footerHints={<span><span className="text-[var(--accent)]">▸</span> <span className="text-foreground">g o</span> holdings · <span className="text-foreground">g h</span> home</span>}>
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Forward 12m income"
          value={formatCurrency(totals.totalForwardIncome, base)}
          sub="Projected at current rates"
          loading={initialLoading}
        />
        <SummaryCard
          label={<MetricLabel term="yield">Portfolio yield</MetricLabel>}
          value={formatPercent(totals.portfolioYield, 2)}
          sub="Forward income / value"
          loading={initialLoading}
        />
        <SummaryCard
          label={<MetricLabel term="yield_on_cost">Yield on cost</MetricLabel>}
          value={formatPercent(totals.portfolioYoc, 2)}
          sub="Forward income / cost basis"
          loading={initialLoading}
        />
        <SummaryCard
          label="Last 12m received"
          value={formatCurrency(totals.received12m, base)}
          sub={`${formatCurrency(totals.received, base)} all-time`}
          loading={initialLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forward dividend calendar</CardTitle>
          <CardDescription>Projected next-12-month payments based on TTM pattern</CardDescription>
        </CardHeader>
        <CardContent>
          {initialLoading ? <Skeleton className="h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(v) => formatCurrency(v as number, base)}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="amount" fill="#2f8f5b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tax summary — only meaningful for SGD-base (Singapore-resident) users */}
      {base === 'SGD' && perHolding.length > 0 && !initialLoading && (
        <TaxSummaryCard perHolding={perHolding} base={base} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-holding income</CardTitle>
          <CardDescription>
            TTM dividend per share, forward income at current shares.
            {base === 'SGD' && ' Withholding tax estimated for Singapore-resident investors.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {initialLoading ? (
            <div className="space-y-3 p-6">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Ticker</th>
                    <th className="px-4 py-2 font-medium">Domicile</th>
                    <th className="px-4 py-2 font-medium text-right">TTM / share</th>
                    <th className="px-4 py-2 font-medium text-right"><MetricLabel term="yield">Yield</MetricLabel></th>
                    <th className="px-4 py-2 font-medium text-right">Gross 12m</th>
                    {base === 'SGD' && <th className="px-4 py-2 font-medium text-right"><MetricLabel term="wht">WHT</MetricLabel></th>}
                    {base === 'SGD' && <th className="px-4 py-2 font-medium text-right">Net 12m</th>}
                  </tr>
                </thead>
                <tbody>
                  {perHolding.map((h) => (
                    <tr key={h.ticker} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{h.ticker}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{h.name}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {DOMICILE_LABEL[h.domicile]}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {h.ttmPerShare > 0 ? formatCurrency(h.ttmPerShare, h.currency) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-up">
                        {h.yieldPct > 0 ? formatPercent(h.yieldPct, 2) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {h.annualIncomeBase > 0 ? formatCurrency(h.annualIncomeBase, base) : '—'}
                      </td>
                      {base === 'SGD' && (
                        <td className="px-4 py-2.5 text-right tabular-nums text-down">
                          {h.wht > 0 ? `−${formatCurrency(h.wht, base)} (${(h.dwtRate * 100).toFixed(0)}%)` : '—'}
                        </td>
                      )}
                      {base === 'SGD' && (
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                          {h.netIncomeBase > 0 ? formatCurrency(h.netIncomeBase, base) : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </PageShell>
  )
}

interface PerHoldingTax {
  domicile: Domicile
  annualIncomeBase: number
  wht: number
  netIncomeBase: number
}

function TaxSummaryCard({ perHolding, base }: { perHolding: PerHoldingTax[]; base: Currency }) {
  const totalGross = perHolding.reduce((s, h) => s + h.annualIncomeBase, 0)
  const totalWht = perHolding.reduce((s, h) => s + h.wht, 0)
  const totalNet = totalGross - totalWht
  const effectiveRate = totalGross > 0 ? (totalWht / totalGross) * 100 : 0

  // Hypothetical: what if everything were Irish-domiciled UCITS?
  const hypotheticalIrishWht = totalGross * 0.15
  const hypotheticalSavings = Math.max(0, totalWht - hypotheticalIrishWht)

  // Per-domicile breakdown
  const byDomicile = new Map<Domicile, { gross: number; wht: number }>()
  for (const h of perHolding) {
    const cur = byDomicile.get(h.domicile) ?? { gross: 0, wht: 0 }
    cur.gross += h.annualIncomeBase
    cur.wht += h.wht
    byDomicile.set(h.domicile, cur)
  }
  const sorted = Array.from(byDomicile.entries()).sort((a, b) => b[1].gross - a[1].gross)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="h-4 w-4" /> Tax summary (Singapore resident)
        </CardTitle>
        <CardDescription>
          Estimated dividend withholding tax based on each holding&apos;s domicile.
          SG itself imposes no further tax on these dividends, and capital gains are tax-free.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Stat label="Gross 12m" value={formatCurrency(totalGross, base)} />
          <Stat label="Estimated WHT" value={`−${formatCurrency(totalWht, base)}`} valueColor="text-down" />
          <Stat label="Net to you" value={formatCurrency(totalNet, base)} valueColor="text-up" />
          <Stat label="Effective rate" value={`${effectiveRate.toFixed(1)}%`} />
        </div>

        {hypotheticalSavings > 0 && (
          <div className="rounded-md bg-up/10 px-3 py-2 text-sm text-up">
            <strong>Saving opportunity:</strong> If all your equity were held via Irish-domiciled UCITS
            (15% WHT instead of 30% on US holdings), your annual WHT would be approximately{' '}
            <strong>{formatCurrency(hypotheticalIrishWht, base)}</strong> — saving roughly{' '}
            <strong>{formatCurrency(hypotheticalSavings, base)}/year</strong>.
            See the Suggestions page for specific UCITS equivalents.
          </div>
        )}

        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">By domicile</div>
          <div className="space-y-1 text-sm">
            {sorted.map(([domicile, v]) => {
              const rate = v.gross > 0 ? (v.wht / v.gross) * 100 : 0
              return (
                <div key={domicile} className="flex justify-between rounded-md bg-muted/30 px-3 py-1.5">
                  <span>{DOMICILE_LABEL[domicile]}</span>
                  <span className="tabular-nums text-xs">
                    {formatCurrency(v.gross, base)} gross · WHT {formatCurrency(v.wht, base)} ({rate.toFixed(0)}%)
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${valueColor ?? ''}`}>{value}</div>
    </div>
  )
}

function SummaryCard({ label, value, sub, loading }: { label: React.ReactNode; value: string; sub: string; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <>
            <div className="text-lg md:text-2xl font-bold tabular-nums">{value}</div>
            <p className="text-xs text-muted-foreground truncate">{sub}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

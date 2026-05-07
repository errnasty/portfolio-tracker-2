'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePortfolio } from '@/context/PortfolioContext'
import { calcRebalance, type RebalanceMode } from '@/lib/calculations'
import { formatCurrency, formatPercent, formatShares } from '@/lib/utils'
import { Wallet, Check } from 'lucide-react'
import { TableScroll } from '@/components/ui/table-scroll'
import { ConfirmTradeDialog } from '@/components/rebalancer/ConfirmTradeDialog'
import type { RebalanceRecommendation } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import type { Currency } from '@/types'

export default function RebalancerPage() {
  const {
    enriched, holdings, targets, prices, fxRates, loading, upsertTarget, deleteTarget, settings,
    totalCashBase, cashBalances, applyTrade,
  } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [tradeRec, setTradeRec] = useState<RebalanceRecommendation | null>(null)
  const [recentlyExecuted, setRecentlyExecuted] = useState<Record<string, number>>({})
  const searchParams = useSearchParams()

  const [newCash, setNewCash] = useState('')
  const [newTicker, setNewTicker] = useState('')
  const [newPct, setNewPct] = useState('')
  const [newTolerance, setNewTolerance] = useState('5')
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<RebalanceMode>('buy-only')

  // Persist mode preference
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('rebalancer-mode')
    if (stored === 'full' || stored === 'buy-only') setMode(stored)
  }, [])

  // Pre-fill cash from ?cash= query string (e.g. dashboard "Rebalance" button)
  useEffect(() => {
    const cashParam = searchParams.get('cash')
    if (cashParam && !newCash) setNewCash(cashParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('rebalancer-mode', mode)
  }, [mode])

  const totalTargetPct = targets.reduce((s, t) => s + Number(t.target_pct), 0)
  const remaining = 100 - totalTargetPct

  const result = useMemo(() => {
    if (!fxRates || targets.length === 0 || Object.keys(prices).length === 0) {
      return { recommendations: [], unallocatedCash: 0, totalBuy: 0, totalSell: 0 }
    }
    return calcRebalance(enriched, targets, parseFloat(newCash) || 0, prices, fxRates, mode)
  }, [enriched, targets, prices, fxRates, newCash, mode])

  const recommendations = result.recommendations

  const handleAddTarget = async () => {
    if (!newTicker || !newPct) return
    const pct = parseFloat(newPct)
    if (isNaN(pct) || pct <= 0) return
    setSaving(true)
    const tolerance = parseFloat(newTolerance)
    await upsertTarget(newTicker.toUpperCase().trim(), pct, isNaN(tolerance) ? undefined : tolerance)
    setNewTicker('')
    setNewPct('')
    setSaving(false)
  }

  const actionBadge = (action: string) => {
    if (action === 'buy') return <Badge className="bg-emerald-400/10 text-emerald-400 border-0">Buy</Badge>
    if (action === 'sell') return <Badge className="bg-red-400/10 text-red-400 border-0">Sell</Badge>
    return <Badge variant="outline">Hold</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Rebalancer</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {mode === 'buy-only'
              ? 'Deploy new cash into underweight positions — no sells'
              : 'Set your target allocations and get buy/sell recommendations'}
          </p>
        </div>
        {/* Mode toggle */}
        <div className="flex gap-1 rounded-md bg-muted p-1 self-start">
          <button
            type="button"
            onClick={() => setMode('buy-only')}
            className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'buy-only'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Buy-only
          </button>
          <button
            type="button"
            onClick={() => setMode('full')}
            className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'full'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Full rebalance
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Target allocations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Target Allocations</CardTitle>
            <CardDescription>
              Total allocated: <strong className={totalTargetPct > 100 ? 'text-red-400' : 'text-foreground'}>{totalTargetPct.toFixed(1)}%</strong>
              {remaining !== 0 && (
                <span className="ml-2 text-muted-foreground">({remaining > 0 ? `${remaining.toFixed(1)}% unallocated` : 'over 100%'})</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : targets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No targets set yet.</p>
            ) : (
              <div className="space-y-2">
                {targets.map((t) => {
                  const holding = enriched.find((h) => h.ticker === t.ticker)
                  const currentPct = holding
                    ? (holding.currentValueBase / enriched.reduce((s, h) => s + h.currentValueBase, 0)) * 100
                    : 0
                  return (
                    <div key={t.id} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{t.ticker}</span>
                          <span>
                            <span className="text-muted-foreground">{currentPct.toFixed(1)}%</span>
                            {' → '}
                            <span className="font-medium">{t.target_pct.toFixed(1)}%</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(t.target_pct, 100)}%` }}
                          />
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-400"
                        onClick={() => deleteTarget(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add new target */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2 pt-2 border-t border-border">
              <div className="space-y-1">
                <Label className="text-xs">Ticker</Label>
                <Input
                  placeholder="e.g. AAPL"
                  className="h-8 text-sm"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTarget()}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Target %</Label>
                <Input
                  type="number" min="0" max="100" step="0.1" placeholder="25"
                  className="h-8 w-20 text-sm"
                  value={newPct}
                  onChange={(e) => setNewPct(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTarget()}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">±Band %</Label>
                <Input
                  type="number" min="0" max="50" step="0.5"
                  className="h-8 w-16 text-sm"
                  value={newTolerance}
                  onChange={(e) => setNewTolerance(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTarget()}
                />
              </div>
              <Button size="sm" className="h-8" onClick={handleAddTarget} disabled={saving || !newTicker || !newPct}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {totalTargetPct > 100 && (
              <div className="flex items-center gap-2 rounded-md bg-red-400/10 p-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Targets exceed 100% — adjust allocations before rebalancing.
              </div>
            )}
          </CardContent>
        </Card>

        {/* New cash input */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Cash to Deploy</CardTitle>
            <CardDescription>Enter additional cash you want to invest ({base})</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Cash Amount ({base})</Label>
                {totalCashBase > 0 && (
                  <Button
                    type="button" variant="outline" size="sm" className="h-7"
                    onClick={() => setNewCash(String(Math.round(totalCashBase)))}
                  >
                    <Wallet className="mr-1 h-3 w-3" />
                    Use {formatCurrency(totalCashBase, base)}
                  </Button>
                )}
              </div>
              <Input
                type="number" min="0" step="any" placeholder="10000"
                value={newCash}
                onChange={(e) => setNewCash(e.target.value)}
              />
              {totalCashBase > 0 && cashBalances.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  Cash position: {cashBalances.map((c) => `${formatCurrency(Number(c.balance), c.currency)}`).join(' + ')}
                </p>
              )}
            </div>
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current portfolio value</span>
                <span>{formatCurrency(enriched.reduce((s, h) => s + h.currentValueBase, 0), base)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">New cash</span>
                <span>+ {formatCurrency(parseFloat(newCash) || 0, base)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-medium">
                <span>Target portfolio value</span>
                <span>{formatCurrency(enriched.reduce((s, h) => s + h.currentValueBase, 0) + (parseFloat(newCash) || 0), base)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {mode === 'buy-only' ? 'New cash deployment plan' : 'Recommendations'}
          </CardTitle>
          <CardDescription>
            {mode === 'buy-only' ? (
              <>
                Distributes {parseFloat(newCash) > 0 ? formatCurrency(parseFloat(newCash), base) : 'new cash'} into underweight positions.
                Overweight positions show <strong>Hold</strong> — drift down naturally as the rest grows.
              </>
            ) : (
              <>Based on your target allocations {parseFloat(newCash) > 0 && `+ ${formatCurrency(parseFloat(newCash), base)} new cash`}</>
            )}
            {' '}Trade amounts are shown in each ticker&apos;s native currency. Click <strong>Mark as bought</strong> after executing — your holdings update automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recommendations.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Set target allocations above to see recommendations
            </div>
          ) : (
            <TableScroll stickyFirstCol>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Trade amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recommendations.map((r) => {
                  const justExecuted = recentlyExecuted[r.ticker]
                    && Date.now() - recentlyExecuted[r.ticker] < 8000
                  const cur = (r.priceCurrency || base).toUpperCase()
                  const isForeign = cur !== base
                  return (
                    <TableRow key={r.ticker}>
                      <TableCell>
                        <div className="font-semibold">{r.ticker}</div>
                        <div className="text-xs text-muted-foreground">{r.name}</div>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <div>{formatCurrency(r.currentValue, base)}</div>
                        <div className="text-xs text-muted-foreground">{r.currentPct.toFixed(1)}%</div>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <div>{formatCurrency(r.targetValue, base)}</div>
                        <div className="text-xs text-muted-foreground">{r.targetPct.toFixed(1)}%</div>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm ${r.delta > 0 ? 'text-emerald-400' : r.delta < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {r.action !== 'hold' && r.nativeAmount > 0 && isForeign ? (
                          <>
                            <div>{r.delta >= 0 ? '+' : '−'}{formatCurrency(r.nativeAmount, cur)}</div>
                            <div className="text-[10px] text-muted-foreground">
                              ≈ {r.delta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(r.delta), base)}
                            </div>
                          </>
                        ) : (
                          <div>{r.delta >= 0 ? '+' : ''}{formatCurrency(r.delta, base)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{actionBadge(r.action)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {r.action !== 'hold' ? (
                          <span className={r.action === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                            {r.action === 'buy' ? '+' : ''}{formatShares(r.sharesToTrade)}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.action === 'hold' ? null : justExecuted ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-400">
                            <Check className="h-3 w-3" /> Logged
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={r.nativePrice <= 0 || Math.abs(r.sharesToTrade) < 0.0001}
                            onClick={() => setTradeRec(r)}
                          >
                            Mark as {r.action === 'buy' ? 'bought' : 'sold'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </TableScroll>
          )}

          {/* Buy-only summary footer */}
          {recommendations.length > 0 && mode === 'buy-only' && (
            <div className="border-t border-border p-4 space-y-2">
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total to buy</div>
                  <div className="font-semibold tabular-nums text-emerald-400">{formatCurrency(result.totalBuy, base)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Cash deployed</div>
                  <div className="font-semibold tabular-nums">
                    {formatCurrency((parseFloat(newCash) || 0) - result.unallocatedCash, base)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Unallocated</div>
                  <div className={`font-semibold tabular-nums ${result.unallocatedCash > 0.005 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                    {formatCurrency(result.unallocatedCash, base)}
                  </div>
                </div>
              </div>
              {result.unallocatedCash > 0.005 && (
                <div className="flex items-start gap-2 rounded-md bg-amber-400/10 p-3 text-xs text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div>
                    <strong>{formatCurrency(result.unallocatedCash, base)}</strong> is left over after filling every underweight position to its target.
                    Adding more to already-overweight positions would push them further out of band.
                    Keep this in cash for the next rebalance, or switch to <em>Full rebalance</em> if you&apos;re willing to sell.
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmTradeDialog
        open={tradeRec !== null}
        onOpenChange={(o) => { if (!o) setTradeRec(null) }}
        recommendation={tradeRec}
        baseCurrency={base}
        fxRates={fxRates}
        existingHolding={tradeRec
          ? holdings.find((h) => h.ticker.toUpperCase() === tradeRec.ticker.toUpperCase()) ?? null
          : null}
        onConfirm={async (trade, alsoLog) => {
          await applyTrade(trade, alsoLog)
          setRecentlyExecuted((prev) => ({ ...prev, [trade.ticker.toUpperCase()]: Date.now() }))
        }}
      />
    </div>
  )
}

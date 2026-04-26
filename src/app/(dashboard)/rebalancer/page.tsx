'use client'

import { useState, useMemo } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { calcRebalance } from '@/lib/calculations'
import { formatCurrency, formatPercent, formatShares } from '@/lib/utils'
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
  const { enriched, targets, prices, fxRates, loading, upsertTarget, deleteTarget, settings } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [newCash, setNewCash] = useState('')
  const [newTicker, setNewTicker] = useState('')
  const [newPct, setNewPct] = useState('')
  const [saving, setSaving] = useState(false)

  const totalTargetPct = targets.reduce((s, t) => s + Number(t.target_pct), 0)
  const remaining = 100 - totalTargetPct

  const recommendations = useMemo(() => {
    if (!fxRates || targets.length === 0 || Object.keys(prices).length === 0) return []
    return calcRebalance(enriched, targets, parseFloat(newCash) || 0, prices, fxRates)
  }, [enriched, targets, prices, fxRates, newCash])

  const handleAddTarget = async () => {
    if (!newTicker || !newPct) return
    const pct = parseFloat(newPct)
    if (isNaN(pct) || pct <= 0) return
    setSaving(true)
    await upsertTarget(newTicker.toUpperCase().trim(), pct)
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
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Rebalancer</h1>
        <p className="text-sm md:text-base text-muted-foreground">Set your target allocations and get buy/sell recommendations</p>
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
            <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2 pt-2 border-t border-border">
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
              <Label>Cash Amount ({base})</Label>
              <Input
                type="number" min="0" step="any" placeholder="10000"
                value={newCash}
                onChange={(e) => setNewCash(e.target.value)}
              />
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
          <CardTitle className="text-base">Recommendations</CardTitle>
          <CardDescription>
            Based on your target allocations {parseFloat(newCash) > 0 && `+ ${formatCurrency(parseFloat(newCash), base)} new cash`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recommendations.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Set target allocations above to see recommendations
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Delta ({base})</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recommendations.map((r) => (
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
                      {r.delta >= 0 ? '+' : ''}{formatCurrency(r.delta, base)}
                    </TableCell>
                    <TableCell className="text-right">{actionBadge(r.action)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.action !== 'hold' ? (
                        <span className={r.action === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                          {r.action === 'buy' ? '+' : ''}{formatShares(r.sharesToTrade)}
                        </span>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

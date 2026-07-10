'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { convertToBase, convertBetween } from '@/lib/calculations'
import type { TradeInput } from '@/context/PortfolioContext'
import type { Currency, FxRates, Holding, RebalanceRecommendation } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  recommendation: RebalanceRecommendation | null
  baseCurrency: Currency
  fxRates: FxRates | null
  // Existing holding for this ticker, if any — used for the post-trade preview.
  existingHolding: Holding | null
  onConfirm: (trade: TradeInput, alsoLog: boolean) => Promise<void>
}

export function ConfirmTradeDialog({
  open, onOpenChange, recommendation, baseCurrency, fxRates, existingHolding, onConfirm,
}: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('0')
  const [alsoLog, setAlsoLog] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reset form whenever the dialog opens with a new recommendation.
  // Persist the user's "also log" preference across opens via localStorage.
  useEffect(() => {
    if (!open || !recommendation) return
    setDate(new Date().toISOString().slice(0, 10))
    setShares(Math.abs(recommendation.sharesToTrade).toFixed(4).replace(/\.?0+$/, ''))
    setPrice(recommendation.nativePrice ? recommendation.nativePrice.toFixed(4).replace(/\.?0+$/, '') : '')
    setFees('0')
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('rebalancer-also-log')
      setAlsoLog(stored === 'true')
    }
  }, [open, recommendation])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('rebalancer-also-log', String(alsoLog))
  }, [alsoLog])

  if (!recommendation) return null

  const isSell = recommendation.action === 'sell'
  const isBuy = recommendation.action === 'buy'
  const cur = (recommendation.priceCurrency || baseCurrency).toUpperCase()

  const sharesNum = parseFloat(shares) || 0
  const priceNum = parseFloat(price) || 0
  const feesNum = parseFloat(fees) || 0

  const nativeTotal = sharesNum * priceNum + (isBuy ? feesNum : -feesNum)
  const nativeProceeds = sharesNum * priceNum
  const baseEquivalent = fxRates ? convertToBase(nativeTotal, cur, fxRates) : 0

  const fxNativeToBase = (fxRates && cur !== fxRates.base && fxRates.rates[cur])
    ? 1 / fxRates.rates[cur]
    : 1
  const showFx = cur !== baseCurrency && fxRates !== null

  // Holding preview — what the holdings table will look like after this trade
  const holdingCur = existingHolding?.cost_basis_currency ?? cur
  const oldShares = existingHolding ? Number(existingHolding.shares) || 0 : 0
  const oldCostPerShare = existingHolding ? Number(existingHolding.cost_basis_per_share) || 0 : 0
  let newShares = oldShares
  let newCostPerShare = oldCostPerShare
  if (isBuy) {
    let buyTotalInHoldingCur = sharesNum * priceNum + feesNum
    if (cur !== holdingCur.toUpperCase() && fxRates) {
      buyTotalInHoldingCur = convertBetween(buyTotalInHoldingCur, cur, holdingCur, fxRates)
    }
    if (existingHolding) {
      newShares = oldShares + sharesNum
      const newTotalCost = oldShares * oldCostPerShare + buyTotalInHoldingCur
      newCostPerShare = newShares > 0 ? newTotalCost / newShares : 0
    } else {
      newShares = sharesNum
      newCostPerShare = sharesNum > 0 ? buyTotalInHoldingCur / sharesNum : 0
    }
  } else {
    newShares = Math.max(0, oldShares - sharesNum)
    // Cost basis per share is unchanged on sells (weighted-avg method)
  }

  const Icon = isBuy ? ArrowDownCircle : ArrowUpCircle
  const accent = isBuy ? 'text-up' : 'text-down'
  const accentBg = isBuy ? 'bg-up/10' : 'bg-down/10'

  const handleConfirm = async () => {
    if (sharesNum <= 0 || priceNum <= 0) return
    setSaving(true)
    try {
      await onConfirm({
        ticker: recommendation.ticker,
        type: isSell ? 'sell' : 'buy',
        date,
        shares: sharesNum,
        pricePerShare: priceNum,
        fees: feesNum,
        currency: cur,
        name: recommendation.name,
        notes: 'Rebalancer',
      }, alsoLog)
      onOpenChange(false)
    } catch {
      // Error reported via toast; keep dialog open so user can retry.
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${accent}`} />
            {isBuy ? 'Mark as bought' : 'Mark as sold'} — {recommendation.ticker}
          </DialogTitle>
        </DialogHeader>

        {/* Summary card with FX conversion clearly displayed */}
        <div className={`rounded-md ${accentBg} p-3 space-y-1.5 text-sm`}>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{isBuy ? 'You spend' : 'You receive'}</span>
            <span className={`font-semibold tabular-nums ${accent}`}>
              {formatCurrency(Math.abs(nativeTotal), cur)}
            </span>
          </div>
          {showFx && (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">≈ in {baseCurrency}</span>
                <span className="tabular-nums">{formatCurrency(Math.abs(baseEquivalent), baseCurrency)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground border-t border-border/50 pt-1">
                <span>FX rate</span>
                <span className="tabular-nums">
                  1 {cur} = {fxNativeToBase.toFixed(4)} {baseCurrency}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="grid gap-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Shares</Label>
              <Input
                type="number" min="0" step="any"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Recommended: {Math.abs(recommendation.sharesToTrade).toFixed(4)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Price per share ({cur})</Label>
              <Input
                type="number" min="0" step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Market: {formatCurrency(recommendation.nativePrice, cur)}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Fees ({cur})</Label>
            <Input
              type="number" min="0" step="any"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Holding preview — what the holdings table will look like after */}
          {sharesNum > 0 && priceNum > 0 && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
              <div className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">
                Holding after trade
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shares</span>
                <span className="tabular-nums">
                  {oldShares.toFixed(4).replace(/\.?0+$/, '') || '0'} → <strong>{newShares.toFixed(4).replace(/\.?0+$/, '') || '0'}</strong>
                </span>
              </div>
              {isBuy && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg cost / share ({holdingCur})</span>
                  <span className="tabular-nums">
                    {existingHolding
                      ? <>{formatCurrency(oldCostPerShare, holdingCur)} → <strong>{formatCurrency(newCostPerShare, holdingCur)}</strong></>
                      : <strong>{formatCurrency(newCostPerShare, holdingCur)}</strong>}
                  </span>
                </div>
              )}
              {isBuy && cur !== holdingCur.toUpperCase() && (
                <p className="text-[10px] text-muted-foreground italic pt-0.5">
                  Trade in {cur}, holding tracked in {holdingCur} — converted at current FX
                </p>
              )}
            </div>
          )}

          {/* Optional transaction-log checkbox */}
          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={alsoLog}
              onChange={(e) => setAlsoLog(e.target.checked)}
              className="mt-0.5 cursor-pointer"
            />
            <span className="text-xs text-muted-foreground">
              Also log this trade to Transaction history
              <span className="block text-[10px] text-muted-foreground/70">
                Optional ledger — doesn&apos;t affect your holdings
              </span>
            </span>
          </label>

          <div className="rounded-md bg-muted px-3 py-2 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal ({cur})</span>
              <span className="tabular-nums">{formatCurrency(nativeProceeds, cur)}</span>
            </div>
            {feesNum > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isBuy ? '+' : '−'} fees</span>
                <span className="tabular-nums">{formatCurrency(feesNum, cur)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border/50 pt-1 font-medium">
              <span>{isBuy ? 'Total cost' : 'Net proceeds'}</span>
              <span className="tabular-nums">{formatCurrency(Math.abs(nativeTotal), cur)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={saving || sharesNum <= 0 || priceNum <= 0}>
            {saving
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</>
              : isBuy ? 'Confirm buy' : 'Confirm sell'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

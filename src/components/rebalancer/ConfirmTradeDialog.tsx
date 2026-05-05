'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { convertToBase } from '@/lib/calculations'
import type { Currency, FxRates, RebalanceRecommendation, Transaction } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  recommendation: RebalanceRecommendation | null
  baseCurrency: Currency
  fxRates: FxRates | null
  onConfirm: (txn: Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
}

export function ConfirmTradeDialog({
  open, onOpenChange, recommendation, baseCurrency, fxRates, onConfirm,
}: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('0')
  const [saving, setSaving] = useState(false)

  // Reset form whenever the dialog opens with a new recommendation
  useEffect(() => {
    if (!open || !recommendation) return
    setDate(new Date().toISOString().slice(0, 10))
    setShares(Math.abs(recommendation.sharesToTrade).toFixed(4).replace(/\.?0+$/, ''))
    setPrice(recommendation.nativePrice ? recommendation.nativePrice.toFixed(4).replace(/\.?0+$/, '') : '')
    setFees('0')
  }, [open, recommendation])

  if (!recommendation) return null

  const isSell = recommendation.action === 'sell'
  const isBuy = recommendation.action === 'buy'
  const cur = (recommendation.priceCurrency || baseCurrency).toUpperCase()

  const sharesNum = parseFloat(shares) || 0
  const priceNum = parseFloat(price) || 0
  const feesNum = parseFloat(fees) || 0

  const nativeTotal = sharesNum * priceNum + (isBuy ? feesNum : -feesNum)
  const nativeProceeds = sharesNum * priceNum  // before fees, used for "you'll spend / receive ~X native"
  const baseEquivalent = fxRates ? convertToBase(nativeTotal, cur, fxRates) : 0

  // Display the FX rate as "1 NATIVE = X BASE" — most intuitive direction.
  // fxRates.rates[cur] is base→native; invert to get native→base.
  const fxNativeToBase = (fxRates && cur !== fxRates.base && fxRates.rates[cur])
    ? 1 / fxRates.rates[cur]
    : 1
  const showFx = cur !== baseCurrency && fxRates !== null

  const Icon = isBuy ? ArrowDownCircle : ArrowUpCircle
  const accent = isBuy ? 'text-emerald-400' : 'text-red-400'
  const accentBg = isBuy ? 'bg-emerald-500/10' : 'bg-red-500/10'

  const handleConfirm = async () => {
    if (sharesNum <= 0 || priceNum <= 0) return
    setSaving(true)
    try {
      await onConfirm({
        ticker: recommendation.ticker,
        type: isSell ? 'sell' : 'buy',
        date,
        shares: sharesNum,
        price_per_share: priceNum,
        amount: 0,
        currency: cur,
        fees: feesNum,
        split_ratio: null,
        notes: 'Rebalancer',
      })
      onOpenChange(false)
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

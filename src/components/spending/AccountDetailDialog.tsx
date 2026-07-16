'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useSpending } from '@/context/SpendingContext'
import { convertToBase } from '@/lib/calculations'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeftRight, Scale } from 'lucide-react'
import type { Account, Currency, FxRates } from '@/types'

function thisMonth() { return new Date().toISOString().slice(0, 7) }

// Balance-freshness nudge: current_balance is a single stored number nudged
// by transactions and edits (not a time series), so "drift" can't be
// computed exactly — but a balance nobody has touched or verified in a long
// time is worth flagging. updated_at moves on every edit, including a
// reconcile, so this doubles as "days since last verified".
const STALE_DAYS = 45
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// Per-account drill-down: balance, this month's flows, recent activity.
export function AccountDetailDialog({ account, base, fxRates, onClose, onTransfer }: {
  account: Account | null
  base: Currency
  fxRates: FxRates | null
  onClose: () => void
  onTransfer: (fromAccountId: string) => void
}) {
  const { bankTransactions, resolveDescription, categoryById, categories, addBankTransaction } = useSpending()
  const month = thisMonth()

  // ── Reconciliation: set the real balance; the delta becomes an adjustment
  // transaction (Transfers category, so it never counts as income/spending).
  const [reconcileValue, setReconcileValue] = useState('')
  const [reconciling, setReconciling] = useState(false)

  const reconcile = async () => {
    if (!account) return
    const actual = parseFloat(reconcileValue)
    if (isNaN(actual)) return
    const delta = Math.round((actual - Number(account.current_balance)) * 100) / 100
    if (delta === 0) { toast.success('Balance already matches'); setReconcileValue(''); return }
    const transfers = categories.filter((c) => c.kind === 'transfer')
    const transferCatId = (transfers.find((c) => c.name === 'Transfers') ?? transfers[0])?.id ?? null
    setReconciling(true)
    try {
      await addBankTransaction({
        account_id: account.id,
        date: new Date().toISOString().slice(0, 10),
        description: 'Balance reconciliation',
        merchant: null,
        amount: delta,
        currency: String(account.currency),
        category_id: transferCatId,
        source: 'manual',
        external_id: null,
        notes: `Set balance to ${formatCurrency(actual, account.currency)}`,
      })
      toast.success(`Balance set to ${formatCurrency(actual, account.currency)} (${delta > 0 ? '+' : ''}${formatCurrency(delta, account.currency)})`)
      setReconcileValue('')
    } catch {
      // toasted in context
    } finally {
      setReconciling(false)
    }
  }

  const accountTxns = useMemo(
    () => (account ? bankTransactions.filter((t) => t.account_id === account.id) : []),
    [bankTransactions, account],
  )

  const monthStats = useMemo(() => {
    let inflow = 0
    let outflow = 0
    for (const t of accountTxns) {
      if (!t.date.startsWith(month)) continue
      const amt = Number(t.amount) || 0
      if (amt >= 0) inflow += amt
      else outflow += -amt
    }
    return { inflow, outflow }
  }, [accountTxns, month])

  if (!account) return null

  const bal = Number(account.current_balance)
  const inBase = fxRates ? convertToBase(bal, account.currency, fxRates) : null
  const recent = accountTxns.slice(0, 10)

  return (
    <Dialog open={!!account} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span>{account.name}</span>
            <span className="text-xs font-normal uppercase tracking-wide text-muted-foreground">
              {account.institution || account.type} · {account.currency}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Balance</div>
              <div className="text-lg font-semibold tabular-nums">{formatCurrency(bal, account.currency)}</div>
              {inBase != null && account.currency !== base && (
                <div className="text-[10px] text-muted-foreground">≈ {formatCurrency(inBase, base)}</div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">In · {month}</div>
              <div className="text-lg font-semibold tabular-nums text-up">+{formatCurrency(monthStats.inflow, account.currency)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Out · {month}</div>
              <div className="text-lg font-semibold tabular-nums">−{formatCurrency(monthStats.outflow, account.currency)}</div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Recent activity ({accountTxns.length} total)
            </div>
            {recent.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No transactions on this account yet.
              </div>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {recent.map((t) => {
                  const amt = Number(t.amount)
                  const cat = t.category_id ? categoryById[t.category_id]?.name : null
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate">
                        <span className="text-muted-foreground">{t.date}</span> · {resolveDescription(t)}
                        {cat ? <span className="text-muted-foreground"> · {cat}</span> : null}
                      </span>
                      <span className={`tabular-nums whitespace-nowrap ${amt >= 0 ? 'text-up' : ''}`}>
                        {amt >= 0 ? '+' : ''}{formatCurrency(amt, t.currency)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Reconcile: type what the bank actually says; we book the difference. */}
          <div className="border-t border-border pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Scale className="h-3 w-3" /> Reconcile balance
            </div>
            {(() => {
              const days = daysSince(account.updated_at)
              return days >= STALE_DAYS ? (
                <p className="mb-2 text-xs text-warn">
                  Not verified in {days} days — check it still matches your bank before trusting it.
                </p>
              ) : (
                <p className="mb-2 text-[11px] text-muted-foreground">Last updated {days === 0 ? 'today' : `${days}d ago`}.</p>
              )
            })()}
            <div className="flex items-center gap-2">
              <Input
                type="number" step="any"
                placeholder={`Actual balance (${account.currency})`}
                className="h-8 flex-1 text-sm"
                value={reconcileValue}
                onChange={(e) => setReconcileValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') reconcile() }}
              />
              <Button size="sm" variant="outline" onClick={reconcile} disabled={reconciling || !reconcileValue}>
                {reconciling ? 'Saving…' : 'Set balance'}
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Books the difference as an adjustment (excluded from income &amp; spending).
            </p>
          </div>

          <div className="flex justify-end border-t border-border pt-3">
            <Button size="sm" variant="outline" onClick={() => { onClose(); onTransfer(account.id) }}>
              <ArrowLeftRight className="mr-2 h-3.5 w-3.5" /> Transfer from this account
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

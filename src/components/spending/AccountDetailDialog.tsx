'use client'

import { useMemo } from 'react'
import { useSpending } from '@/context/SpendingContext'
import { convertToBase } from '@/lib/calculations'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeftRight } from 'lucide-react'
import type { Account, Currency, FxRates } from '@/types'

function thisMonth() { return new Date().toISOString().slice(0, 7) }

// Per-account drill-down: balance, this month's flows, recent activity.
export function AccountDetailDialog({ account, base, fxRates, onClose, onTransfer }: {
  account: Account | null
  base: Currency
  fxRates: FxRates | null
  onClose: () => void
  onTransfer: (fromAccountId: string) => void
}) {
  const { bankTransactions, resolveDescription, categoryById } = useSpending()
  const month = thisMonth()

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

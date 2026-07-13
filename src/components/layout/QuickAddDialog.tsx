'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { parseQuickEntry } from '@/lib/quick-parse'
import { useQuickAction } from '@/lib/quick-actions'
import { formatCurrency } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Zap } from 'lucide-react'
import type { Currency } from '@/types'

function today() { return new Date().toISOString().slice(0, 10) }

// Global quick-add: one line ("14.50 lunch grab", "+2500 salary"), Enter,
// done. Opens from anywhere via the `a` key, ⌘K, or the mobile + button.
export function QuickAddDialog() {
  const { accounts } = usePortfolio()
  const { addBankTransaction, categorize, categoryById, categories } = useSpending()

  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState(today())
  const [categoryOverride, setCategoryOverride] = useState('')
  const [saving, setSaving] = useState(false)

  useQuickAction('add-expense', () => {
    setText(''); setDate(today()); setCategoryOverride('')
    setAccountId((prev) => prev || accounts[0]?.id || '')
    setOpen(true)
  })

  const parsed = useMemo(() => parseQuickEntry(text), [text])
  const guessedCategoryId = useMemo(
    () => (parsed.description ? categorize(parsed.description) : null),
    [parsed.description, categorize],
  )
  const effectiveCategoryId = categoryOverride || guessedCategoryId || ''
  const account = accounts.find((a) => a.id === accountId)
  const currency = (account?.currency as Currency) ?? 'SGD'
  const valid = parsed.amount != null && parsed.description.length > 0

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await addBankTransaction({
        account_id: accountId || null,
        date,
        description: parsed.description,
        merchant: null,
        amount: parsed.kind === 'income' ? parsed.amount! : -parsed.amount!,
        currency,
        category_id: effectiveCategoryId || null,
        source: 'manual',
        external_id: null,
        notes: null,
      })
      toast.success(
        `${parsed.kind === 'income' ? '+' : '−'}${formatCurrency(parsed.amount!, currency)} · ${parsed.description}`,
      )
      setOpen(false)
    } catch {
      // toasted in context; keep open to retry
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[520px] gap-0 overflow-hidden rounded-2xl border border-border p-0 shadow-2xl" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Quick add transaction</DialogTitle>
        <div className="flex items-center gap-3 border-b border-[var(--hair)] px-5 py-4">
          <Zap className="h-4 w-4 shrink-0 text-accent" />
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
            placeholder="14.50 lunch grab · +2500 salary"
            className="flex-1 border-none bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <span className="font-mono rounded border border-border bg-card px-1.5 py-0.5 text-[10.5px] text-faint">↵</span>
        </div>

        {/* Live preview + adjustable details */}
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {parsed.amount != null ? (
              <span className={`font-semibold tabular-nums ${parsed.kind === 'income' ? 'text-up' : ''}`}>
                {parsed.kind === 'income' ? '+' : '−'}{formatCurrency(parsed.amount, currency)}
              </span>
            ) : (
              <span className="text-muted-foreground">Type an amount…</span>
            )}
            {parsed.description && <span className="text-muted-foreground">·</span>}
            {parsed.description && <span className="truncate">{parsed.description}</span>}
            {effectiveCategoryId && categoryById[effectiveCategoryId] && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {categoryById[effectiveCategoryId].name}{!categoryOverride && ' (auto)'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryOverride} onValueChange={setCategoryOverride}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category: auto" /></SelectTrigger>
              <SelectContent>
                {categories
                  .filter((c) => (parsed.kind === 'income' ? c.kind !== 'expense' : c.kind !== 'income'))
                  .map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Start with <span className="font-mono text-foreground">+</span> for income. Category is guessed from the description — override above if needed.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

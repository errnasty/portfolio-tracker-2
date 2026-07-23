'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { parseQuickEntry } from '@/lib/quick-parse'
import { captureExternalId, type TxnDraft } from '@/lib/extract'
import { useQuickAction, consumeSharedText, onShareCheck } from '@/lib/quick-actions'
import { formatCurrency } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Zap, ClipboardType, Loader2 } from 'lucide-react'
import type { Currency } from '@/types'

function today() { return new Date().toISOString().slice(0, 10) }

type Mode = 'type' | 'paste'

// Global quick-add. "Type" is the fast one-liner ("14.50 lunch grab"); "Paste"
// takes a whole bank SMS/email and extracts the transaction (regex + AI).
// Opens from anywhere via the `a` key, ⌘K, or the mobile + button.
export function QuickAddDialog() {
  const { accounts } = usePortfolio()
  const { addBankTransaction, categorize, categoryById, categories, aiCategorize } = useSpending()

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('type')
  const [text, setText] = useState('')
  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState(today())
  const [categoryOverride, setCategoryOverride] = useState('')
  const [saving, setSaving] = useState(false)

  // Paste-mode state
  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [draft, setDraft] = useState<TxnDraft | null>(null)

  useQuickAction('add-expense', () => {
    setMode('type'); setText(''); setDate(today()); setCategoryOverride('')
    setPasteText(''); setDraft(null)
    setAccountId((prev) => prev || accounts[0]?.id || '')
    setOpen(true)
  })

  useQuickAction('paste-transaction', () => {
    setMode('paste'); setText(''); setDate(today()); setCategoryOverride('')
    setPasteText(''); setDraft(null)
    setAccountId((prev) => prev || accounts[0]?.id || '')
    setOpen(true)
  })

  // PWA share target: open paste mode pre-filled with text shared from another
  // app. Checked on mount (cold launch) and on the share-check event (warm).
  useEffect(() => {
    const openIfShared = () => {
      const shared = consumeSharedText()
      if (!shared) return
      setMode('paste'); setText(''); setDate(today()); setCategoryOverride('')
      setPasteText(shared); setDraft(null)
      setAccountId((prev) => prev || accounts[0]?.id || '')
      setOpen(true)
    }
    openIfShared()
    return onShareCheck(openIfShared)
  }, [accounts])

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

  // ── Paste mode ────────────────────────────────────────────────────────────
  const runParse = async () => {
    const t = pasteText.trim()
    if (!t || parsing) return
    setParsing(true)
    setDraft(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ text: t }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error ?? 'Could not parse'); return }
      const d = data.draft as TxnDraft
      setDraft(d)
      setDate(d.date ?? today())
      setCategoryOverride('')
      setAccountId((prev) => prev || accounts[0]?.id || '')
    } catch (e) {
      toast.error(`Parse failed: ${String(e)}`)
    } finally {
      setParsing(false)
    }
  }

  const draftCategoryId = useMemo(() => {
    if (!draft) return ''
    return categoryOverride || categorize(draft.description, draft.merchant) || ''
  }, [draft, categoryOverride, categorize])

  const savePaste = async () => {
    if (!draft || saving) return
    setSaving(true)
    try {
      const cur = (account?.currency as Currency) ?? draft.currency
      // Resolve category via rules→AI→keyword if the user didn't override.
      const categoryId = categoryOverride
        || (await aiCategorize(draft.description, draft.merchant, draft.amount, cur))
        || null
      await addBankTransaction({
        account_id: accountId || null,
        date,
        description: draft.description,
        merchant: draft.merchant,
        amount: draft.amount,
        currency: draft.currency,
        category_id: categoryId,
        source: 'paste',
        external_id: captureExternalId('paste', pasteText.trim(), date, draft.amount),
        notes: null,
        payee_key: null,
        needs_review: draft.confidence === 'low',
      })
      toast.success(`${draft.amount >= 0 ? '+' : '−'}${formatCurrency(Math.abs(draft.amount), draft.currency)} · ${draft.description}`)
      setOpen(false)
    } catch {
      // toasted in context
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="fixed inset-x-0 bottom-0 top-auto left-0 right-0 max-h-[90dvh] max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-t-2xl rounded-b-none border border-border p-0 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-none sm:max-w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Quick add transaction</DialogTitle>

        {/* Grab handle — signals the sheet is swipeable on phones. */}
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />

        {/* Mode switch */}
        <div className="flex gap-1 border-b border-[var(--hair)] px-3 pt-2">
          <button
            onClick={() => setMode('type')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${mode === 'type' ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Zap className="h-3.5 w-3.5" /> Type
          </button>
          <button
            onClick={() => setMode('paste')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${mode === 'paste' ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <ClipboardType className="h-3.5 w-3.5" /> Paste bank alert
          </button>
        </div>

        {mode === 'type' ? (
          <>
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
          </>
        ) : (
          <div className="space-y-3 px-5 py-4">
            <textarea
              autoFocus
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste a bank SMS or notification email here, e.g.&#10;&#10;Dear Customer, a transaction of SGD 25.50 was made at NTUC FAIRPRICE on 10 Jul 2026 using your card ending 1234."
              rows={4}
              className="w-full rounded-md border border-border bg-transparent p-3 text-sm outline-none placeholder:text-faint"
            />
            {!draft ? (
              <Button onClick={runParse} disabled={!pasteText.trim() || parsing} className="w-full">
                {parsing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Parsing…</> : 'Parse transaction'}
              </Button>
            ) : (
              <>
                <div className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`font-semibold tabular-nums ${draft.amount >= 0 ? 'text-up' : ''}`}>
                      {draft.amount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(draft.amount), draft.currency)}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <Input
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      className="h-7 flex-1 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={accountId} onValueChange={setAccountId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={categoryOverride} onValueChange={setCategoryOverride}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={draftCategoryId && categoryById[draftCategoryId] ? `${categoryById[draftCategoryId].name} (auto)` : 'Category: auto'} />
                      </SelectTrigger>
                      <SelectContent>
                        {categories
                          .filter((c) => (draft.amount >= 0 ? c.kind !== 'expense' : c.kind !== 'income'))
                          .map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
                  </div>
                  {draft.confidence === 'low' && (
                    <p className="text-[11px] text-warn">Low confidence — double-check the amount and description before saving.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDraft(null)} className="flex-1">Re-parse</Button>
                  <Button onClick={savePaste} disabled={saving} className="flex-1">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save transaction'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

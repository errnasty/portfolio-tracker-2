'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useSpending } from '@/context/SpendingContext'
import { normalizeMerchant } from '@/lib/subscriptions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Check, CheckCheck, AlertTriangle } from 'lucide-react'

interface Draft {
  description: string
  alias: string
  categoryId: string
  remember: boolean            // save keyword→category as a rule + backfill
}

// Rows the parser flagged (low confidence or possible duplicate). Lets the
// user fix the description, name the payee, pick a category — optionally
// remembering it as a rule applied to past + future rows — and clear the
// flag one at a time or all at once.
export function ReviewQueueCard() {
  const {
    bankTransactions, categories, updateBankTransaction, upsertPayeeAlias,
    addCategoryRule, applyRuleRetroactively, categorize,
  } = useSpending()
  const rows = useMemo(() => bankTransactions.filter((t) => t.needs_review), [bankTransactions])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState(false)

  if (rows.length === 0) return null

  const draftFor = (t: (typeof rows)[number]): Draft => drafts[t.id] ?? {
    description: t.description,
    alias: '',
    categoryId: t.category_id ?? categorize(t.description, t.merchant) ?? '',
    remember: false,
  }
  const setDraft = (t: (typeof rows)[number], patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [t.id]: { ...draftFor(t), ...patch } }))

  const confirm = async (t: (typeof rows)[number]) => {
    const d = draftFor(t)
    if (d.alias.trim() && t.payee_key) await upsertPayeeAlias(t.payee_key, d.alias)
    await updateBankTransaction(t.id, {
      description: d.description.trim() || t.description,
      category_id: d.categoryId || null,
      needs_review: false,
    })
    // "Remember": keyword rule from the payee name (alias if given, else the
    // normalized merchant), plus retroactive application to uncategorized rows.
    if (d.remember && d.categoryId) {
      const keyword = (d.alias.trim() || normalizeMerchant(d.description, t.merchant)).toLowerCase()
      if (keyword.length >= 3) {
        await addCategoryRule(keyword, d.categoryId)
        const n = await applyRuleRetroactively(keyword, d.categoryId)
        toast.success(`Rule saved: “${keyword}”${n > 0 ? ` · categorized ${n} past transaction${n === 1 ? '' : 's'}` : ''}`)
      }
    }
  }

  const confirmAll = async () => {
    setBusy(true)
    try {
      for (const t of rows) await confirm(t)
      toast.success(`Confirmed ${rows.length} transaction${rows.length === 1 ? '' : 's'}`)
    } catch { /* individual errors already toasted */ } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-warn/40">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warn" />
              Needs review · {rows.length}
            </CardTitle>
            <CardDescription>
              Fix the description, pick a category, tick “remember” to teach the app for next time.
            </CardDescription>
          </div>
          {rows.length > 1 && (
            <Button size="sm" variant="outline" onClick={confirmAll} disabled={busy}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" /> {busy ? 'Confirming…' : 'Confirm all'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((t) => {
          const d = draftFor(t)
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{t.date}</span>
              <Input
                value={d.description}
                onChange={(e) => setDraft(t, { description: e.target.value })}
                className="h-8 flex-1 min-w-[160px] text-sm"
                placeholder="Description"
              />
              {t.payee_key && (
                <Input
                  value={d.alias}
                  onChange={(e) => setDraft(t, { alias: e.target.value })}
                  className="h-8 w-36 text-sm"
                  placeholder={`Name (${t.payee_key})`}
                />
              )}
              <Select value={d.categoryId} onValueChange={(v) => setDraft(t, { categoryId: v })}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Save as a rule and apply to past uncategorized transactions">
                <input
                  type="checkbox" checked={d.remember}
                  onChange={(e) => setDraft(t, { remember: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                remember
              </label>
              <span className="tabular-nums text-sm whitespace-nowrap">
                {Number(t.amount).toFixed(2)} {t.currency}
              </span>
              <Button size="sm" className="h-8" onClick={() => confirm(t)}>
                <Check className="h-3.5 w-3.5 mr-1" /> Confirm
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

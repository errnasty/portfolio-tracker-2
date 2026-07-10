'use client'

import { useMemo, useState } from 'react'
import { useSpending } from '@/context/SpendingContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, AlertTriangle } from 'lucide-react'

// Rows the parser flagged (low confidence or possible duplicate). Lets the user
// fix the description, optionally name the payee (writes a payee_alias), and
// clear the flag. Renders nothing when the queue is empty.
export function ReviewQueueCard() {
  const { bankTransactions, updateBankTransaction, upsertPayeeAlias } = useSpending()
  const rows = useMemo(() => bankTransactions.filter((t) => t.needs_review), [bankTransactions])
  const [drafts, setDrafts] = useState<Record<string, { description: string; alias: string }>>({})

  if (rows.length === 0) return null

  const draftFor = (id: string, description: string) => drafts[id] ?? { description, alias: '' }
  const setDraft = (
    id: string,
    patch: Partial<{ description: string; alias: string }>,
    description: string,
  ) => setDrafts((d) => ({ ...d, [id]: { ...draftFor(id, description), ...patch } }))

  const confirm = async (t: (typeof rows)[number]) => {
    const d = draftFor(t.id, t.description)
    if (d.alias.trim() && t.payee_key) await upsertPayeeAlias(t.payee_key, d.alias)
    await updateBankTransaction(t.id, {
      description: d.description.trim() || t.description,
      needs_review: false,
    })
  }

  return (
    <Card className="border-warn/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warn" />
          Needs review · {rows.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((t) => {
          const d = draftFor(t.id, t.description)
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{t.date}</span>
              <Input
                value={d.description}
                onChange={(e) => setDraft(t.id, { description: e.target.value }, t.description)}
                className="h-8 flex-1 min-w-[180px] text-sm"
                placeholder="Description"
              />
              {t.payee_key && (
                <Input
                  value={d.alias}
                  onChange={(e) => setDraft(t.id, { alias: e.target.value }, t.description)}
                  className="h-8 w-40 text-sm"
                  placeholder={`Name (${t.payee_key})`}
                />
              )}
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

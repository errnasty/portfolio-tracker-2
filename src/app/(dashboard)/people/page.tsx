'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { usePortfolio } from '@/context/PortfolioContext'
import { aggregateIous, distinctTags } from '@/lib/ious'
import { convertToBase } from '@/lib/calculations'
import { formatCurrency, cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageShell } from '@/components/ui/page-shell'
import { SubNav } from '@/components/ui/sub-nav'
import { SUB_NAVS } from '@/lib/nav-registry'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Check, ChevronDown, ChevronUp, Plus, Users } from 'lucide-react'
import { useQuickAction } from '@/lib/quick-actions'
import type { Currency, Iou, IouDirection } from '@/types'
import { CURRENCY_CODES } from '@/types'

function today() { return new Date().toISOString().slice(0, 10) }

export default function PeoplePage() {
  const { settings, fxRates } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [ious, setIous] = useState<Iou[]>([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [tagFilter, setTagFilter] = useState('all')
  const [showSettled, setShowSettled] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('ious').select('*').eq('user_id', user.id).order('date', { ascending: false })
    if (error) {
      if (error.code === '42P01' || /relation .* does not exist|schema cache/i.test(error.message)) setTableMissing(true)
      else toast.error(`Couldn't load IOUs: ${error.message}`)
      return
    }
    setTableMissing(false)
    setIous(data ?? [])
  }, [])

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [refresh])

  const toBase = useCallback(
    (amt: number, cur: string) => (fxRates ? convertToBase(amt, cur, fxRates) : amt),
    [fxRates],
  )

  const tags = useMemo(() => distinctTags(ious), [ious])
  const filtered = useMemo(
    () => (tagFilter === 'all' ? ious : ious.filter((i) => i.tag === tagFilter)),
    [ious, tagFilter],
  )
  const summary = useMemo(() => aggregateIous(filtered, toBase), [filtered, toBase])
  const settledRows = useMemo(() => filtered.filter((i) => i.settled), [filtered])

  // ── Actions ─────────────────────────────────────────────────────────────
  const setSettled = async (iou: Iou, settled: boolean) => {
    const { error } = await supabase.from('ious').update({
      settled, settled_at: settled ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', iou.id)
    if (error) { toast.error(`Update failed: ${error.message}`); return }
    await refresh()
  }

  const settlePerson = async (person: string) => {
    const open = filtered.filter((i) => !i.settled && i.person.trim().toLowerCase() === person.trim().toLowerCase())
    const now = new Date().toISOString()
    const { error } = await supabase.from('ious')
      .update({ settled: true, settled_at: now, updated_at: now })
      .in('id', open.map((i) => i.id))
    if (error) { toast.error(`Settle failed: ${error.message}`); return }
    toast.success(`Settled up with ${person}`)
    await refresh()
  }

  // ── Add dialog ──────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    person: '', direction: 'owed_to_me' as IouDirection, amount: '',
    currency: base as Currency, tag: '', date: today(), notes: '',
  })
  const [saving, setSaving] = useState(false)

  const openAdd = () => {
    setForm({ person: '', direction: 'owed_to_me', amount: '', currency: base, tag: '', date: today(), notes: '' })
    setOpen(true)
  }
  useQuickAction('add-iou', openAdd)

  const handleSave = async () => {
    const amt = parseFloat(form.amount)
    if (!form.person.trim() || isNaN(amt) || amt <= 0) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase.from('ious').insert({
        user_id: user.id, person: form.person.trim(), direction: form.direction,
        amount: amt, currency: form.currency, tag: form.tag.trim() || null,
        date: form.date, notes: form.notes.trim() || null,
      })
      if (error) { toast.error(`Save failed: ${error.message}`); return }
      setOpen(false)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const statusRight = (
    <span className="flex items-center gap-4">
      <button onClick={openAdd} className="press flex items-center gap-1 hover:text-foreground"><Plus className="h-3.5 w-3.5" /> add IOU</button>
    </span>
  )

  return (
    <PageShell
      screen="Money" title="People" statusRight={statusRight}
      footerHints={<span><span className="text-accent">▸</span> <span className="text-foreground">g s</span> spending · <span className="text-foreground">g h</span> home</span>}
    >
    <div className="space-y-4">
      <SubNav links={[...SUB_NAVS.payments]} />
      {tableMissing && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          The <code className="font-mono text-xs">ious</code> table is missing — run{' '}
          <code className="font-mono text-xs">supabase/migrations/002_finance_features.sql</code> in your Supabase SQL editor.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            label="Net position"
            value={summary.net}
            format={(n) => `${n >= 0 ? '+' : ''}${formatCurrency(n, base)}`}
            delta={[
              <span key="n" className={summary.net >= 0 ? 'text-up' : 'text-down'}>
                {summary.net >= 0 ? 'in your favour' : 'you owe more than you’re owed'}
              </span>,
            ]}
          />
          <HeroMetric label="Owed to you" value={summary.totalOwedToMe} format={(n) => formatCurrency(n, base)} sub={`${summary.people.filter((p) => p.net > 0).length} people`} />
          <HeroMetric label="You owe" value={summary.totalIOwe} format={(n) => formatCurrency(n, base)} sub={`${summary.people.filter((p) => p.net < 0).length} people`} />
        </HeroBand>
      </div>

      {/* Tag filter chips */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setTagFilter('all')}
            className={cn('rounded-full border px-3 py-1 text-xs transition-colors',
              tagFilter === 'all' ? 'border-accent bg-[var(--accent-soft)] text-accent font-medium' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(t)}
              className={cn('rounded-full border px-3 py-1 text-xs transition-colors',
                tagFilter === t ? 'border-accent bg-[var(--accent-soft)] text-accent font-medium' : 'border-border text-muted-foreground hover:text-foreground')}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Balances</CardTitle>
          <CardDescription>
            Both directions are netted per person — if you owe them too, only the difference shows.
            Tag entries by group or occasion to filter above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : summary.people.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nothing outstanding{tagFilter !== 'all' ? ` for “${tagFilter}”` : ''}. Add an IOU when you split a bill or lend money.
            </div>
          ) : (
            <div className="space-y-2">
              {summary.people.map((p) => {
                const isOpen = expanded === p.person
                return (
                  <div key={p.person} className="rounded-md border border-border">
                    <button
                      className="flex w-full items-center justify-between gap-3 p-3 text-left"
                      onClick={() => setExpanded(isOpen ? null : p.person)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{p.person}</span>
                          {p.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.owedToMe > 0 && <>owes you {formatCurrency(p.owedToMe, base)}</>}
                          {p.owedToMe > 0 && p.iOwe > 0 && ' · '}
                          {p.iOwe > 0 && <>you owe {formatCurrency(p.iOwe, base)}</>}
                          {' · '}{p.openCount} open
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`tabular-nums text-sm font-semibold ${p.net >= 0 ? 'text-up' : 'text-down'}`}>
                          {p.net >= 0 ? '+' : ''}{formatCurrency(p.net, base)}
                        </span>
                        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="space-y-1 border-t border-border p-3">
                        {p.entries.map((e) => (
                          <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate">
                              {e.date} · {e.direction === 'owed_to_me' ? 'they owe' : 'you owe'} {formatCurrency(Number(e.amount), e.currency)}
                              {e.tag ? ` · ${e.tag}` : ''}{e.notes ? ` · ${e.notes}` : ''}
                            </span>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setSettled(e, true)}>
                              <Check className="mr-1 h-3 w-3" /> settle
                            </Button>
                          </div>
                        ))}
                        <div className="pt-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => settlePerson(p.person)}>
                            Settle up everything with {p.person}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settled history */}
      <div>
        <button onClick={() => setShowSettled((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {showSettled ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Settled history ({settledRows.length})
        </button>
        {showSettled && settledRows.length > 0 && (
          <div className="mt-2 space-y-1 rounded-md border border-border p-3">
            {settledRows.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 truncate line-through">
                  {e.date} · {e.person} · {e.direction === 'owed_to_me' ? 'owed you' : 'you owed'} {formatCurrency(Number(e.amount), e.currency)}
                  {e.tag ? ` · ${e.tag}` : ''}
                </span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setSettled(e, false)}>
                  reopen
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add IOU dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add IOU</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Person *</Label>
                <Input value={form.person} onChange={(e) => setForm((f) => ({ ...f, person: e.target.value }))} placeholder="Alex" list="iou-people" />
                <datalist id="iou-people">
                  {[...new Set(ious.map((i) => i.person))].map((p) => <option key={p} value={p} />)}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Direction</Label>
                <Select value={form.direction} onValueChange={(v) => setForm((f) => ({ ...f, direction: v as IouDirection }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owed_to_me">They owe me</SelectItem>
                    <SelectItem value="i_owe">I owe them</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input type="number" step="any" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="25.00" />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v as Currency }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCY_CODES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Group / occasion</Label>
                <Input value={form.tag} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))} placeholder="JB trip · cell group · dinner" list="iou-tags" />
                <datalist id="iou-tags">
                  {tags.map((t) => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Paid for their movie ticket" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.person.trim() || !form.amount}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageShell>
  )
}

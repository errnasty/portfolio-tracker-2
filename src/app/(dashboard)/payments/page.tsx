'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { advanceDate, buildUpcoming, buildIcs, googleCalendarUrl } from '@/lib/payments'
import { convertToBase } from '@/lib/calculations'
import { formatCurrency } from '@/lib/utils'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CalendarPlus, CalendarCheck, Check, Plus, Trash2, Zap } from 'lucide-react'
import type { Currency, PaymentRepeat, PlannedPayment } from '@/types'
import { CURRENCY_CODES } from '@/types'

const REPEAT_LABEL: Record<PaymentRepeat, string> = {
  none: 'One-off', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly',
}

function today() { return new Date().toISOString().slice(0, 10) }

export default function PaymentsPage() {
  const { settings, fxRates } = usePortfolio()
  const { subscriptions, loading: spendingLoading } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [planned, setPlanned] = useState<PlannedPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('planned_payments').select('*').eq('user_id', user.id).order('due_date')
    if (error) {
      if (error.code === '42P01' || /relation .* does not exist|schema cache/i.test(error.message)) setTableMissing(true)
      else toast.error(`Couldn't load payments: ${error.message}`)
      return
    }
    setTableMissing(false)
    setPlanned(data ?? [])
  }, [])

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [refresh])

  const upcoming = useMemo(() => buildUpcoming({
    planned, subscriptions, baseCurrency: base, today: today(), horizonDays: 60,
  }), [planned, subscriptions, base])

  const toBase = useCallback(
    (amt: number, cur: string) => (fxRates ? convertToBase(amt, cur, fxRates) : amt),
    [fxRates],
  )

  const due30 = upcoming.filter((i) => i.daysUntil >= 0 && i.daysUntil <= 30)
  const due30Total = due30.reduce((s, i) => s + toBase(i.amount, i.currency), 0)
  const overdue = upcoming.filter((i) => i.daysUntil < 0)
  const monthlyCommit = upcoming
    .filter((i) => i.repeat === 'monthly')
    .reduce((s, i) => s + toBase(i.amount, i.currency), 0)

  // ── Actions ─────────────────────────────────────────────────────────────
  const markPaid = async (p: PlannedPayment) => {
    if (p.repeat === 'none') {
      const { error } = await supabase.from('planned_payments')
        .update({ paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', p.id)
      if (error) { toast.error(`Update failed: ${error.message}`); return }
      toast.success(`${p.name} marked paid`)
    } else {
      const next = advanceDate(p.due_date, p.repeat)
      const { error } = await supabase.from('planned_payments')
        .update({ due_date: next, updated_at: new Date().toISOString() })
        .eq('id', p.id)
      if (error) { toast.error(`Update failed: ${error.message}`); return }
      toast.success(`${p.name} paid — next due ${next}`)
    }
    await refresh()
  }

  const remove = async (p: PlannedPayment) => {
    const { error } = await supabase.from('planned_payments').delete().eq('id', p.id)
    if (error) { toast.error(`Delete failed: ${error.message}`); return }
    await refresh()
  }

  const exportIcs = () => {
    const ics = buildIcs(upcoming)
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'aureus-payments.ics'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Calendar file downloaded — import it into Google/Apple Calendar')
  }

  // ── Add dialog ──────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: '', amount: '', currency: base as Currency, due_date: today(),
    repeat: 'monthly' as PaymentRepeat, autopay: false, notes: '',
  })
  const [saving, setSaving] = useState(false)

  const openAdd = () => {
    setForm({ name: '', amount: '', currency: base, due_date: today(), repeat: 'monthly', autopay: false, notes: '' })
    setOpen(true)
  }

  const handleSave = async () => {
    const amt = parseFloat(form.amount)
    if (!form.name.trim() || isNaN(amt) || amt <= 0) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase.from('planned_payments').insert({
        user_id: user.id, name: form.name.trim(), amount: amt, currency: form.currency,
        due_date: form.due_date, repeat: form.repeat, autopay: form.autopay,
        notes: form.notes.trim() || null,
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
      <button onClick={exportIcs} className="press flex items-center gap-1 hover:text-foreground"><CalendarCheck className="h-3.5 w-3.5" /> export .ics</button>
      <button onClick={openAdd} className="press flex items-center gap-1 hover:text-foreground"><Plus className="h-3.5 w-3.5" /> add payment</button>
    </span>
  )

  return (
    <PageShell
      screen="Money" title="Payments" statusRight={statusRight}
      footerHints={<span><span className="text-accent">▸</span> <span className="text-foreground">g s</span> spending · <span className="text-foreground">g b</span> budgets</span>}
    >
    <div className="space-y-4">
      <SubNav links={[...SUB_NAVS.payments]} />

      {tableMissing && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          The <code className="font-mono text-xs">planned_payments</code> table is missing — run{' '}
          <code className="font-mono text-xs">supabase/migrations/002_finance_features.sql</code> in your Supabase SQL editor.
          Detected subscriptions still show below.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            label="Due · next 30 days"
            value={due30Total}
            format={(n) => formatCurrency(n, base)}
            sub={`${due30.length} payment${due30.length === 1 ? '' : 's'}`}
          />
          <HeroMetric
            label="Overdue"
            value={overdue.length}
            format={(n) => String(Math.round(n))}
            delta={overdue.length > 0 ? [<span key="o" className="text-down">needs attention</span>] : [<span key="o" className="text-up">all clear</span>]}
          />
          <HeroMetric
            label="Monthly recurring"
            value={monthlyCommit}
            format={(n) => formatCurrency(n, base)}
            sub="bills + subscriptions"
          />
        </HeroBand>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming deadlines</CardTitle>
          <CardDescription>
            Manual bills you add here plus predicted subscription charges. Marking a recurring bill paid advances its due date.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading || spendingLoading ? (
            <div className="p-6"><Skeleton className="h-48 w-full" /></div>
          ) : upcoming.length === 0 ? (
            <div className="m-6 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nothing due in the next 60 days. Add bills with “add payment” above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Repeats</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[130px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((i) => {
                  const overdueRow = i.daysUntil < 0
                  return (
                    <TableRow key={i.id} className={overdueRow ? 'bg-down/5' : ''}>
                      <TableCell className="whitespace-nowrap text-xs">
                        <div>{i.dueDate}</div>
                        <div className={overdueRow ? 'text-down' : 'text-muted-foreground'}>
                          {overdueRow ? `${-i.daysUntil}d overdue` : i.daysUntil === 0 ? 'today' : `in ${i.daysUntil}d`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {i.name}
                          {i.autopay && (
                            <Badge variant="secondary" className="gap-1 text-[10px]"><Zap className="h-2.5 w-2.5" /> auto</Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {i.source === 'subscription' ? 'detected subscription' : i.planned?.notes ?? 'planned'}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{REPEAT_LABEL[i.repeat]}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(i.amount, i.currency)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Add to Google Calendar" asChild>
                            <a href={googleCalendarUrl(i)} target="_blank" rel="noopener noreferrer">
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                          {i.planned && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-up" title="Mark paid" onClick={() => markPaid(i.planned!)}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-down" title="Delete" onClick={() => remove(i.planned!)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tip: use <strong>export .ics</strong> to pull every deadline into Google or Apple Calendar in one go,
        or the <CalendarPlus className="inline h-3 w-3" /> button to add a single one.
      </p>

      {/* Add payment dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add planned payment</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Rent / school fees / insurance" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input type="number" step="any" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="1200" />
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
                <Label>First due date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Repeats</Label>
                <Select value={form.repeat} onValueChange={(v) => setForm((f) => ({ ...f, repeat: v as PaymentRepeat }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(REPEAT_LABEL) as PaymentRepeat[]).map((r) => (
                      <SelectItem key={r} value={r}>{REPEAT_LABEL[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="GIRO from POSB" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox" checked={form.autopay}
                onChange={(e) => setForm((f) => ({ ...f, autopay: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              Paid automatically (GIRO / card on file)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.amount}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageShell>
  )
}

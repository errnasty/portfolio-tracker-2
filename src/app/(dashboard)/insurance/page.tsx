'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { usePortfolio } from '@/context/PortfolioContext'
import { convertToBase } from '@/lib/calculations'
import { annualizedPremium, frequencyToRepeat, hasRecurringPremium } from '@/lib/insurance'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
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
import { Pencil, Plus, Trash2, ShieldCheck } from 'lucide-react'
import { useQuickAction } from '@/lib/quick-actions'
import type { Currency, InsurancePolicy, PolicyType, PremiumFrequency } from '@/types'
import { CURRENCY_CODES, POLICY_TYPES } from '@/types'

const POLICY_LABEL: Record<PolicyType, string> =
  Object.fromEntries(POLICY_TYPES.map((p) => [p.value, p.label])) as Record<PolicyType, string>

const FREQS: { value: PremiumFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'single', label: 'Single premium' },
  { value: 'none', label: 'No premium' },
]

interface PolicyForm {
  name: string
  insurer: string
  policy_type: PolicyType
  policy_number: string
  sum_assured: string
  currency: Currency
  premium_amount: string
  premium_frequency: PremiumFrequency
  next_premium_due: string
  cash_value: string
  end_date: string
  notes: string
  post_as_transaction: boolean
}

const EMPTY_FORM: PolicyForm = {
  name: '', insurer: '', policy_type: 'term', policy_number: '', sum_assured: '',
  currency: 'SGD', premium_amount: '', premium_frequency: 'yearly', next_premium_due: '',
  cash_value: '', end_date: '', notes: '', post_as_transaction: false,
}

export default function InsurancePage() {
  const { settings, fxRates, policies, policiesError, addPolicy, updatePolicy, deletePolicy } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<PolicyForm>(EMPTY_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const loading = !fxRates
  const toBase = (amt: number, cur: string) => (fxRates ? convertToBase(amt, cur, fxRates) : amt)

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setOpen(true) }
  useQuickAction('add-holding', openAdd) // reuse no dedicated action; harmless if never fired

  const openEdit = (p: InsurancePolicy) => {
    setForm({
      name: p.name, insurer: p.insurer ?? '', policy_type: p.policy_type,
      policy_number: p.policy_number ?? '',
      sum_assured: p.sum_assured != null ? String(p.sum_assured) : '',
      currency: (p.currency as Currency) ?? 'SGD',
      premium_amount: p.premium_amount != null ? String(p.premium_amount) : '',
      premium_frequency: p.premium_frequency,
      next_premium_due: p.next_premium_due ?? '',
      cash_value: p.cash_value != null ? String(p.cash_value) : '',
      end_date: p.end_date ?? '',
      notes: p.notes ?? '',
      post_as_transaction: false,
    })
    setEditId(p.id)
    setOpen(true)
  }

  const totals = useMemo(() => {
    let sumAssured = 0, annualPremium = 0, cashValue = 0
    for (const p of policies) {
      if (!p.is_active) continue
      if (p.sum_assured) sumAssured += toBase(Number(p.sum_assured), p.currency)
      annualPremium += toBase(annualizedPremium(p.premium_amount, p.premium_frequency), p.currency)
      if (p.cash_value) cashValue += toBase(Number(p.cash_value), p.currency)
    }
    return { sumAssured, annualPremium, cashValue }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policies, fxRates])

  const byType = useMemo(() => {
    const groups = new Map<PolicyType, InsurancePolicy[]>()
    for (const p of policies) {
      const arr = groups.get(p.policy_type) ?? []
      arr.push(p)
      groups.set(p.policy_type, arr)
    }
    return POLICY_TYPES.map((t) => ({ type: t.value, label: t.label, items: groups.get(t.value) ?? [] }))
      .filter((g) => g.items.length > 0)
  }, [policies])

  // Create/update a planned_payments row for a recurring premium, returning
  // its id (or null). Keeps the premium visible in Upcoming.
  const syncPlannedPayment = async (
    policy: InsurancePolicy, f: PolicyForm,
  ): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return policy.planned_payment_id
    const recurring = hasRecurringPremium(f.premium_amount ? parseFloat(f.premium_amount) : 0, f.premium_frequency)
    if (!recurring || !f.next_premium_due) {
      // No recurring premium: drop any previously-linked payment.
      if (policy.planned_payment_id) {
        await supabase.from('planned_payments').delete().eq('id', policy.planned_payment_id)
      }
      return null
    }
    const rowData = {
      user_id: user.id,
      name: `Premium — ${f.name}`,
      amount: parseFloat(f.premium_amount),
      currency: f.currency,
      due_date: f.next_premium_due,
      repeat: frequencyToRepeat(f.premium_frequency),
      autopay: false,
      post_as_transaction: f.post_as_transaction,
      flow: 'bill' as const,
      notes: `Insurance premium (${f.insurer || POLICY_LABEL[f.policy_type]})`,
    }
    if (policy.planned_payment_id) {
      await supabase.from('planned_payments').update(rowData).eq('id', policy.planned_payment_id)
      return policy.planned_payment_id
    }
    const { data } = await supabase.from('planned_payments').insert(rowData).select('id').single()
    return data?.id ?? null
  }

  const canSave = form.name.trim() && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        insurer: form.insurer.trim() || null,
        policy_type: form.policy_type,
        policy_number: form.policy_number.trim() || null,
        sum_assured: form.sum_assured ? parseFloat(form.sum_assured) : null,
        currency: form.currency,
        premium_amount: form.premium_amount ? parseFloat(form.premium_amount) : null,
        premium_frequency: form.premium_frequency,
        next_premium_due: form.next_premium_due || null,
        cash_value: form.cash_value ? parseFloat(form.cash_value) : null,
        cash_value_asof: form.cash_value ? new Date().toISOString().slice(0, 10) : null,
        start_date: null,
        end_date: form.end_date || null,
        notes: form.notes.trim() || null,
        is_active: true,
        planned_payment_id: null as string | null,
      }

      if (editId) {
        const existing = policies.find((p) => p.id === editId)!
        const ppId = await syncPlannedPayment(existing, form)
        await updatePolicy(editId, { ...payload, planned_payment_id: ppId })
      } else {
        const created = await addPolicy(payload)
        if (created) {
          const ppId = await syncPlannedPayment(created, form)
          if (ppId) await updatePolicy(created.id, { planned_payment_id: ppId })
        }
      }
      setOpen(false)
    } catch {
      // toasted in context
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const p = policies.find((x) => x.id === deleteId)
    setDeleteId(null)
    if (!p) return
    // Clean up the linked premium payment so it doesn't linger in Upcoming.
    if (p.planned_payment_id) {
      await supabase.from('planned_payments').delete().eq('id', p.planned_payment_id)
    }
    await deletePolicy(p.id)
    toast.success(`Deleted ${p.name}`)
  }

  const statusRight = (
    <span className="flex items-center gap-4">
      <span>policies <span className="text-foreground">{policies.length}</span></span>
      <button onClick={openAdd} className="press flex items-center gap-1 hover:text-foreground">
        <Plus className="h-3.5 w-3.5" /> add
      </button>
    </span>
  )

  return (
    <PageShell screen="Money" title="Insurance" statusRight={statusRight}
      footerHints={<span><span className="text-accent">▸</span> premiums show up on <span className="text-foreground">Payments</span>; cash value counts toward <span className="text-foreground">Net worth</span></span>}
    >
    <div className="space-y-4">
      <SubNav links={[...SUB_NAVS.accounts]} />

      {policiesError && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">{policiesError}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric big label={`Total sum assured · ${base}`} value={totals.sumAssured}
            format={(n) => formatCurrency(n, base)} />
          <HeroMetric label="Annual premiums" value={totals.annualPremium} format={(n) => formatCurrency(n, base)} />
          <HeroMetric label="Cash / surrender value" value={totals.cashValue} format={(n) => formatCurrency(n, base)} />
        </HeroBand>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : policies.length === 0 ? (
        <Card><CardContent className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
          <ShieldCheck className="h-8 w-8" />
          <p>No policies yet. Add life, health, or general insurance to see your full coverage.</p>
          <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add policy</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-5">
          {byType.map((g) => (
            <div key={g.type} className="space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{g.label}</div>
              <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
                {g.items.map((p) => {
                  const annual = annualizedPremium(p.premium_amount, p.premium_frequency)
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{p.name}</span>
                          {p.insurer && <span className="text-xs text-muted-foreground">· {p.insurer}</span>}
                          {!p.is_active && <Badge variant="outline" className="text-[10px]">inactive</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.sum_assured ? `${formatCurrency(Number(p.sum_assured), p.currency)} cover` : 'No cover set'}
                          {annual > 0 && ` · ${formatCurrency(annual, p.currency)}/yr premium`}
                          {p.cash_value ? ` · ${formatCurrency(Number(p.cash_value), p.currency)} cash value` : ''}
                          {p.end_date ? ` · expires ${p.end_date}` : ''}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-down hover:text-down" onClick={() => setDeleteId(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Edit policy' : 'Add policy'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Policy name *</Label>
              <Input placeholder="e.g. AIA Term Life" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Insurer</Label>
                <Input placeholder="e.g. AIA" value={form.insurer} onChange={(e) => setForm({ ...form, insurer: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.policy_type} onValueChange={(v) => setForm({ ...form, policy_type: v as PolicyType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{POLICY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sum assured</Label>
                <Input type="number" min="0" step="any" placeholder="e.g. 500000" value={form.sum_assured} onChange={(e) => setForm({ ...form, sum_assured: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCY_CODES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Premium amount</Label>
                <Input type="number" min="0" step="any" placeholder="e.g. 1200" value={form.premium_amount} onChange={(e) => setForm({ ...form, premium_amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={form.premium_frequency} onValueChange={(v) => setForm({ ...form, premium_frequency: v as PremiumFrequency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {hasRecurringPremium(form.premium_amount ? parseFloat(form.premium_amount) : 0, form.premium_frequency) && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Next premium due</Label>
                  <Input type="date" value={form.next_premium_due} onChange={(e) => setForm({ ...form, next_premium_due: e.target.value })} />
                </div>
                <label className="flex items-end gap-2 pb-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={form.post_as_transaction} onChange={(e) => setForm({ ...form, post_as_transaction: e.target.checked })} />
                  Auto-post as a bill when due
                </label>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cash / surrender value</Label>
                <Input type="number" min="0" step="any" placeholder="e.g. 8000" value={form.cash_value} onChange={(e) => setForm({ ...form, cash_value: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Expiry / maturity date</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Cash/surrender value counts toward your net worth. A recurring premium with a due date shows up on the Payments page automatically.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canSave}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete policy?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This removes the policy and its linked premium reminder. This can&apos;t be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageShell>
  )
}

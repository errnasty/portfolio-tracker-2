'use client'

import { useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { convertToBase } from '@/lib/calculations'
import { projectLoan } from '@/lib/loans'
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
import { Landmark, Pencil, Plus, Trash2, Vault } from 'lucide-react'
import type { Asset, AssetKind, Currency, CouponFrequency } from '@/types'
import { ASSET_KINDS, ASSET_KIND_META, CURRENCY_CODES, COUPON_FREQUENCIES } from '@/types'

function today() { return new Date().toISOString().slice(0, 10) }

// CPF has its own tab (/cpf); this page covers everything else.
const GROUP_ORDER = ['Deposits & bonds', 'Property & other', 'Loans'] as const

interface AssetForm {
  name: string
  kind: AssetKind
  balance: string
  currency: Currency
  interest_rate_pct: string
  maturity_date: string
  monthly_payment: string
  notes: string
  face_value: string
  coupon_frequency: CouponFrequency | ''
}

const EMPTY_FORM: AssetForm = {
  name: '', kind: 'fixed_deposit', balance: '', currency: 'SGD',
  interest_rate_pct: '', maturity_date: '', monthly_payment: '', notes: '',
  face_value: '', coupon_frequency: '',
}

export default function AssetsPage() {
  const {
    settings, fxRates, assets, assetsError, assetsBase, liabilitiesBase,
    addAsset, updateAsset, deleteAsset, loading,
  } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  // CPF (cpf_*) is managed on the dedicated CPF tab, not here.
  const active = useMemo(() => assets.filter((a) => a.is_active && !a.kind.startsWith('cpf_')), [assets])
  const grouped = useMemo(() => {
    const g = new Map<string, Asset[]>()
    for (const a of active) {
      const group = ASSET_KIND_META[a.kind]?.group ?? 'Property & other'
      g.set(group, [...(g.get(group) ?? []), a])
    }
    return g
  }, [active])

  const toBase = (amt: number, cur: string) => (fxRates ? convertToBase(amt, cur, fxRates) : amt)

  // ── Add / edit dialog ────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AssetForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const openAdd = () => { setEditId(null); setForm(EMPTY_FORM); setOpen(true) }
  const openEdit = (a: Asset) => {
    setEditId(a.id)
    setForm({
      name: a.name, kind: a.kind, balance: String(a.balance), currency: a.currency as Currency,
      interest_rate_pct: a.interest_rate_pct != null ? String(a.interest_rate_pct) : '',
      maturity_date: a.maturity_date ?? '',
      monthly_payment: a.monthly_payment != null ? String(a.monthly_payment) : '',
      notes: a.notes ?? '',
      face_value: a.face_value != null ? String(a.face_value) : '',
      coupon_frequency: a.coupon_frequency ?? '',
    })
    setOpen(true)
  }

  const handleSave = async () => {
    const bal = parseFloat(form.balance)
    if (!form.name.trim() || isNaN(bal) || bal < 0) return
    setSaving(true)
    try {
      const isBond = form.kind === 'bond'
      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        balance: bal,
        currency: form.currency,
        interest_rate_pct: form.interest_rate_pct ? parseFloat(form.interest_rate_pct) : null,
        maturity_date: form.maturity_date || null,
        monthly_payment: form.monthly_payment ? parseFloat(form.monthly_payment) : null,
        notes: form.notes.trim() || null,
        is_active: true,
        // Bond fields only meaningful for kind='bond'; cleared otherwise.
        face_value: isBond && form.face_value ? parseFloat(form.face_value) : null,
        coupon_frequency: isBond && form.coupon_frequency ? form.coupon_frequency : null,
      }
      if (editId) await updateAsset(editId, payload)
      else await addAsset(payload)
      setOpen(false)
    } catch {
      // toasted in context
    } finally {
      setSaving(false)
    }
  }

  const isLiabilityKind = ASSET_KIND_META[form.kind]?.liability ?? false
  const isBond = form.kind === 'bond'

  return (
    <PageShell
      screen="Money" title="Assets & debts"
      statusRight={<button onClick={openAdd} className="press flex items-center gap-1 hover:text-foreground"><Plus className="h-3.5 w-3.5" /> add</button>}
      footerHints={<span><span className="text-accent">▸</span> <span className="text-foreground">g a</span> accounts · <span className="text-foreground">g h</span> home</span>}
    >
    <div className="space-y-4">
      <SubNav links={[...SUB_NAVS.accounts]} />

      {assetsError && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">{assetsError}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            label="Other assets"
            value={assetsBase}
            format={(n) => formatCurrency(n, base)}
            sub="CPF, deposits, property — outside bank accounts & portfolio"
          />
          <HeroMetric
            label="Debts"
            value={liabilitiesBase}
            format={(n) => formatCurrency(n, base)}
            delta={liabilitiesBase > 0 ? [<span key="d" className="text-down">loans & mortgages</span>] : [<span key="d" className="text-up">debt-free</span>]}
          />
          <HeroMetric
            label="Net contribution"
            value={assetsBase - liabilitiesBase}
            format={(n) => `${n >= 0 ? '+' : ''}${formatCurrency(n, base)}`}
            sub="added to your net worth"
          />
        </HeroBand>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : active.length === 0 && !assetsError ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Vault className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Track the rest of your financial life — CPF balances, fixed deposits, T-bills,
              property, and any loans — so net worth is the whole picture.
            </p>
            <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add your first asset</Button>
          </CardContent>
        </Card>
      ) : (
        GROUP_ORDER.map((group) => {
          const rows = grouped.get(group)
          if (!rows || rows.length === 0) return null
          const groupTotal = rows.reduce((s, a) => s + toBase(Number(a.balance) || 0, a.currency), 0)
          const isLoanGroup = group === 'Loans'
          return (
            <Card key={group}>
              <CardHeader>
                <div className="flex items-baseline justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Landmark className="h-4 w-4" /> {group}
                  </CardTitle>
                  <span className={`tabular-nums text-sm font-semibold ${isLoanGroup ? 'text-down' : ''}`}>
                    {isLoanGroup ? '−' : ''}{formatCurrency(groupTotal, base)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {rows.map((a) => {
                  const meta = ASSET_KIND_META[a.kind]
                  const bal = Number(a.balance) || 0
                  const inBase = toBase(bal, a.currency)
                  const loan = meta?.liability && a.monthly_payment
                    ? projectLoan(bal, Number(a.interest_rate_pct) || 0, Number(a.monthly_payment), today())
                    : null
                  const maturityDays = a.maturity_date
                    ? Math.round((Date.parse(a.maturity_date) - Date.parse(today())) / 86_400_000)
                    : null
                  return (
                    <div key={a.id} className="group flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {a.name}
                          <Badge variant="secondary" className="text-[10px]">{meta?.label ?? a.kind}</Badge>
                          {maturityDays != null && maturityDays <= 60 && (
                            <Badge variant="secondary" className={`text-[10px] ${maturityDays < 0 ? 'text-down' : 'text-warn'}`}>
                              {maturityDays < 0 ? 'matured' : `matures in ${maturityDays}d`}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {a.interest_rate_pct != null && `${a.interest_rate_pct}% ${a.kind === 'bond' ? 'coupon' : 'p.a.'}`}
                          {a.kind === 'bond' && a.coupon_frequency && a.coupon_frequency !== 'zero' && ` (${COUPON_FREQUENCIES.find((c) => c.value === a.coupon_frequency)?.label.toLowerCase()})`}
                          {a.kind === 'bond' && a.face_value ? ` · ${formatCurrency(Number(a.face_value), a.currency)} par` : ''}
                          {a.maturity_date && ` · matures ${a.maturity_date}`}
                          {meta?.liability && a.monthly_payment ? (
                            loan
                              ? ` · ${formatCurrency(Number(a.monthly_payment), a.currency)}/mo → paid off ${loan.payoffDate} (${formatCurrency(loan.totalInterest, a.currency)} interest to go)`
                              : ' · payment doesn’t cover interest — it will never pay off'
                          ) : null}
                          {!meta?.liability && a.monthly_payment ? ` · +${formatCurrency(Number(a.monthly_payment), a.currency)}/mo contribution` : null}
                          {a.notes ? ` · ${a.notes}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className={`tabular-nums text-sm font-semibold ${meta?.liability ? 'text-down' : ''}`}>
                            {meta?.liability ? '−' : ''}{formatCurrency(bal, a.currency)}
                          </div>
                          {a.currency !== base && (
                            <div className="text-[10px] text-muted-foreground">≈ {formatCurrency(inBase, base)}</div>
                          )}
                        </div>
                        <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-down" onClick={() => deleteAsset(a.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })
      )}

      <p className="text-xs text-muted-foreground">
        Balances here are manual — update them when statements arrive (CPF quarterly, loans monthly).
        Maturing deposits show up on the <span className="text-foreground">Payments</span> page automatically.
      </p>

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'Edit' : 'Add'} asset or debt</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="CPF OA / 6-month FD / Car loan" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as AssetKind }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_KINDS.filter((k) => k.group !== 'CPF').map((k) => (
                      <SelectItem key={k.kind} value={k.kind}>{k.label}{k.liability ? ' (debt)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{isLiabilityKind ? 'Amount owed' : isBond ? 'Current value' : 'Balance'} *</Label>
                <Input type="number" step="any" min="0" value={form.balance} onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))} placeholder="25000" />
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
                <Label>{isBond ? 'Coupon rate % p.a.' : 'Interest rate % p.a.'}</Label>
                <Input type="number" step="any" value={form.interest_rate_pct} onChange={(e) => setForm((f) => ({ ...f, interest_rate_pct: e.target.value }))} placeholder={isLiabilityKind ? '2.8' : isBond ? '3.5' : '3.2'} />
              </div>
              <div className="space-y-2">
                <Label>Maturity date</Label>
                <Input type="date" value={form.maturity_date} onChange={(e) => setForm((f) => ({ ...f, maturity_date: e.target.value }))} />
              </div>
            </div>

            {/* Bond-specific: par value + coupon schedule. Maturity above
                feeds the Payments "Upcoming" timeline. */}
            {isBond && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Face / par value</Label>
                  <Input type="number" step="any" min="0" value={form.face_value} onChange={(e) => setForm((f) => ({ ...f, face_value: e.target.value }))} placeholder="10000" />
                  <p className="text-[10px] text-muted-foreground">Redeemed at maturity — may differ from current value.</p>
                </div>
                <div className="space-y-2">
                  <Label>Coupon frequency</Label>
                  <Select value={form.coupon_frequency || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, coupon_frequency: v === 'none' ? '' : v as CouponFrequency }))}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      {COUPON_FREQUENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {!isBond && (
              <div className="space-y-2">
                <Label>{isLiabilityKind ? 'Monthly installment' : 'Monthly contribution'}</Label>
                <Input type="number" step="any" min="0" value={form.monthly_payment} onChange={(e) => setForm((f) => ({ ...f, monthly_payment: e.target.value }))} placeholder="500" />
                {isLiabilityKind && (
                  <p className="text-[10px] text-muted-foreground">With a rate + installment, the payoff date and remaining interest are projected automatically.</p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="DBS 6-month promo rate" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.balance}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageShell>
  )
}

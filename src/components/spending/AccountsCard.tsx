'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Landmark, Plus, Pencil, Trash2, AlertTriangle, Wallet, CreditCard, Coins } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { convertToBase } from '@/lib/calculations'
import type { Account, AccountType, Currency, FxRates } from '@/types'

const CURRENCIES: Currency[] = ['SGD', 'USD', 'EUR']
const TYPES: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit', label: 'Credit card' },
  { value: 'wallet', label: 'E-wallet' },
]
const TYPE_ICON: Record<AccountType, React.ElementType> = {
  bank: Landmark, cash: Coins, credit: CreditCard, wallet: Wallet,
}

interface Props {
  accounts: Account[]
  netBase: number
  base: Currency
  fxRates: FxRates | null
  loadError?: string | null
  onAdd: (data: Omit<Account, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onUpdate: (id: string, data: Partial<Account>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function AccountsCard({ accounts, netBase, base, fxRates, loadError, onAdd, onUpdate, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('bank')
  const [institution, setInstitution] = useState('')
  const [currency, setCurrency] = useState<Currency>(base)
  const [balance, setBalance] = useState('')
  const [saving, setSaving] = useState(false)

  const openAdd = () => {
    setEditingId(null); setName(''); setType('bank'); setInstitution('POSB')
    setCurrency('SGD'); setBalance(''); setOpen(true)
  }
  const openEdit = (a: Account) => {
    setEditingId(a.id); setName(a.name); setType(a.type)
    setInstitution(a.institution ?? ''); setCurrency(a.currency as Currency)
    setBalance(String(a.current_balance)); setOpen(true)
  }

  const handleSave = async () => {
    const value = parseFloat(balance)
    if (!name.trim() || isNaN(value)) return
    setSaving(true)
    try {
      if (editingId) {
        await onUpdate(editingId, {
          name: name.trim(), type, institution: institution.trim() || null,
          currency, current_balance: value,
        })
      } else {
        await onAdd({
          name: name.trim(), type, institution: institution.trim() || null,
          currency, current_balance: value, is_active: true,
        })
      }
      setOpen(false)
    } catch {
      // error toasted in context; keep dialog open to retry
    } finally {
      setSaving(false)
    }
  }

  const sorted = [...accounts].sort((a, b) => Number(b.current_balance) - Number(a.current_balance))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark className="h-4 w-4" /> Accounts
            </CardTitle>
            <CardDescription>
              {sorted.length === 0
                ? 'Add bank, cash, credit & wallet accounts to track net worth'
                : `${sorted.length} account${sorted.length === 1 ? '' : 's'} · net ${formatCurrency(netBase, base)}`}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={openAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-medium">Accounts unavailable</div>
              <div className="text-xs text-amber-400/90">{loadError}</div>
              <div className="text-[11px] text-muted-foreground">
                Open Supabase &rarr; SQL editor &rarr; run
                <code className="mx-1 rounded bg-muted px-1">supabase-schema.sql</code>. Safe to re-run.
              </div>
            </div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No accounts yet. Add your POSB account to start tracking spending and net worth.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((a) => {
              const Icon = TYPE_ICON[a.type]
              const bal = Number(a.current_balance)
              const inBase = fxRates ? convertToBase(bal, a.currency, fxRates) : 0
              const isCredit = a.type === 'credit'
              return (
                <div key={a.id} className="rounded-md border border-border p-3 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <Icon className="h-3 w-3" /> {a.institution || a.type}
                      </div>
                      <div className="text-sm font-medium truncate">{a.name}</div>
                      <div className={`text-lg font-semibold tabular-nums ${isCredit && bal > 0 ? 'text-red-400' : ''}`}>
                        {isCredit && bal > 0 ? '-' : ''}{formatCurrency(bal, a.currency)}
                      </div>
                      {a.currency !== base && (
                        <div className="text-[10px] text-muted-foreground">
                          ≈ {isCredit && bal > 0 ? '-' : ''}{formatCurrency(inBase, base)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-400"
                        onClick={() => onDelete(a.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit account' : 'Add account'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="POSB Savings" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Institution</Label>
              <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="POSB / DBS" />
            </div>
            <div className="space-y-2">
              <Label>Balance ({currency}) *{type === 'credit' ? ' — amount owed' : ''}</Label>
              <Input
                type="number" step="any" placeholder="10000"
                value={balance} onChange={(e) => setBalance(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !balance}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

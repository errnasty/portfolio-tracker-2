'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Wallet, Plus, Pencil, Trash2, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { convertToBase } from '@/lib/calculations'
import type { CashBalance, Currency, FxRates } from '@/types'

const CURRENCIES: Currency[] = ['USD', 'SGD', 'EUR']

interface Props {
  cashBalances: CashBalance[]
  totalCashBase: number
  base: Currency
  fxRates: FxRates | null
  onUpsert: (currency: string, balance: number, notes?: string | null) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function CashBalancesCard({
  cashBalances, totalCashBase, base, fxRates, onUpsert, onDelete,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [currency, setCurrency] = useState<Currency>(base)
  const [balance, setBalance] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const openAdd = () => {
    setEditingId(null); setCurrency(base); setBalance(''); setNotes(''); setDialogOpen(true)
  }
  const openEdit = (c: CashBalance) => {
    setEditingId(c.id); setCurrency(c.currency as Currency); setBalance(String(c.balance))
    setNotes(c.notes ?? ''); setDialogOpen(true)
  }

  const handleSave = async () => {
    const value = parseFloat(balance)
    if (isNaN(value)) return
    setSaving(true)
    try {
      await onUpsert(currency, value, notes || null)
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const sorted = [...cashBalances].sort((a, b) => Number(b.balance) - Number(a.balance))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Cash position
            </CardTitle>
            <CardDescription>
              {sorted.length === 0
                ? 'No cash tracked yet — add a balance to include it in totals'
                : `${sorted.length} currenc${sorted.length === 1 ? 'y' : 'ies'} · ${formatCurrency(totalCashBase, base)} in ${base}`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {sorted.length > 0 && totalCashBase > 0 && (
              <Link href={`/rebalancer?cash=${Math.round(totalCashBase)}`}>
                <Button variant="outline" size="sm">
                  Rebalance <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
            <Button variant="outline" size="sm" onClick={openAdd}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Track uninvested cash to see your true total net worth and feed the rebalancer.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((c) => {
              const inBase = fxRates ? convertToBase(Number(c.balance), c.currency, fxRates) : 0
              const balanceNum = Number(c.balance)
              return (
                <div key={c.id} className="rounded-md border border-border p-3 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.currency}</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {formatCurrency(balanceNum, c.currency)}
                      </div>
                      {c.currency !== base && (
                        <div className="text-[10px] text-muted-foreground">
                          ≈ {formatCurrency(inBase, base)}
                        </div>
                      )}
                      {c.notes && (
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{c.notes}</div>
                      )}
                    </div>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-400"
                        onClick={() => onDelete(c.id)}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit cash balance' : 'Add cash balance'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <div className="space-y-2">
                <Label>Currency *</Label>
                <Select
                  value={currency}
                  onValueChange={(v) => setCurrency(v as Currency)}
                  disabled={!!editingId}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Balance ({currency}) *</Label>
                <Input
                  type="number" step="any" min="0" placeholder="10000"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. emergency fund, money market" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !balance}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

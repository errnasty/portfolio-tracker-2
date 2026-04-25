'use client'

import { useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { formatCurrency, formatPercent, formatShares, gainLossColor, gainLossBg } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Currency, Holding, HoldingFormData } from '@/types'

const CURRENCIES: Currency[] = ['USD', 'SGD', 'EUR']
const EMPTY_FORM: HoldingFormData = { ticker: '', name: '', shares: '', cost_basis_per_share: '', cost_basis_currency: 'USD' }

export default function HoldingsPage() {
  const { enriched, loading, addHolding, updateHolding, deleteHolding, settings } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<HoldingFormData>(EMPTY_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setOpen(true) }
  const openEdit = (h: Holding) => {
    setForm({
      ticker: h.ticker, name: h.name ?? '', shares: String(h.shares),
      cost_basis_per_share: String(h.cost_basis_per_share),
      cost_basis_currency: h.cost_basis_currency,
    })
    setEditId(h.id)
    setOpen(true)
  }

  const handleSave = async () => {
    if (!form.ticker || !form.shares || !form.cost_basis_per_share) return
    setSaving(true)
    const payload = {
      ticker: form.ticker.toUpperCase().trim(),
      name: form.name.trim() || null,
      shares: parseFloat(form.shares),
      cost_basis_per_share: parseFloat(form.cost_basis_per_share),
      cost_basis_currency: form.cost_basis_currency,
    }
    if (editId) {
      await updateHolding(editId, payload)
    } else {
      await addHolding(payload)
    }
    setSaving(false)
    setOpen(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await deleteHolding(deleteId)
    setDeleteId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Holdings</h1>
          <p className="text-muted-foreground">Manage your portfolio positions</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Holding
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : enriched.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
              <p>No holdings yet. Add your first position to get started.</p>
              <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add Holding</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker / Name</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Cost Basis</TableHead>
                  <TableHead className="text-right">Current Price</TableHead>
                  <TableHead className="text-right">Value ({base})</TableHead>
                  <TableHead className="text-right">Day</TableHead>
                  <TableHead className="text-right">Return</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...enriched].sort((a, b) => b.currentValueBase - a.currentValueBase).map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <div className="font-semibold">{h.ticker}</div>
                      <div className="text-xs text-muted-foreground">{h.name ?? '—'}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatShares(h.shares)}</TableCell>
                    <TableCell className="text-right text-sm">
                      <div className="font-mono">{formatCurrency(h.cost_basis_per_share, h.cost_basis_currency)}</div>
                      <div className="text-xs text-muted-foreground">{h.cost_basis_currency}</div>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <div className="font-mono">{formatCurrency(h.currentPrice, h.priceCurrency)}</div>
                      <div className="text-xs text-muted-foreground">{h.priceCurrency}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(h.currentValueBase, base)}
                    </TableCell>
                    <TableCell className={`text-right text-sm ${gainLossColor(h.dayChange)}`}>
                      {formatPercent(h.dayChangePct)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${gainLossBg(h.gainLoss)}`}>
                        {formatPercent(h.gainLossPct)}
                      </div>
                      <div className={`text-xs ${gainLossColor(h.gainLoss)}`}>
                        {formatCurrency(h.gainLoss, base)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(h)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300" onClick={() => setDeleteId(h.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Holding' : 'Add Holding'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ticker Symbol *</Label>
                <Input
                  placeholder="e.g. AAPL, D05.SI, AIR.PA"
                  value={form.ticker}
                  onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="e.g. Apple Inc."
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Shares *</Label>
              <Input
                type="number" min="0" step="any" placeholder="100"
                value={form.shares}
                onChange={(e) => setForm({ ...form, shares: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cost Basis per Share *</Label>
                <Input
                  type="number" min="0" step="any" placeholder="150.00"
                  value={form.cost_basis_per_share}
                  onChange={(e) => setForm({ ...form, cost_basis_per_share: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cost Basis Currency</Label>
                <Select value={form.cost_basis_currency} onValueChange={(v) => setForm({ ...form, cost_basis_currency: v as Currency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              International tickers: append exchange suffix (e.g. <strong>D05.SI</strong> for SGX, <strong>AIR.PA</strong> for Euronext Paris)
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.ticker || !form.shares || !form.cost_basis_per_share}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete holding?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove the position from your portfolio.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { usePortfolio } from '@/context/PortfolioContext'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Pencil, Trash2, Loader2, Upload, ArrowDownCircle, ArrowUpCircle, Coins, Split } from 'lucide-react'
import { TableScroll } from '@/components/ui/table-scroll'
import { deleteWithUndo } from '@/lib/toast-undo'
import { formatCurrency, formatShares } from '@/lib/utils'
import type { Currency, Transaction, TransactionFormData, TransactionType } from '@/types'

const CURRENCIES: Currency[] = ['USD', 'SGD', 'EUR']
const TYPES: TransactionType[] = ['buy', 'sell', 'dividend', 'split']

const EMPTY_FORM: TransactionFormData = {
  ticker: '',
  type: 'buy',
  date: new Date().toISOString().slice(0, 10),
  shares: '',
  price_per_share: '',
  amount: '',
  currency: 'USD',
  fees: '0',
  split_ratio: '',
  notes: '',
}

const TYPE_META: Record<TransactionType, { label: string; icon: typeof ArrowDownCircle; color: string }> = {
  buy: { label: 'Buy', icon: ArrowDownCircle, color: 'text-emerald-400' },
  sell: { label: 'Sell', icon: ArrowUpCircle, color: 'text-red-400' },
  dividend: { label: 'Dividend', icon: Coins, color: 'text-amber-400' },
  split: { label: 'Split', icon: Split, color: 'text-sky-400' },
}

export default function TransactionsPage() {
  const { transactions, loading, addTransaction, updateTransaction, deleteTransaction } = usePortfolio()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<TransactionFormData>(EMPTY_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [filterTicker, setFilterTicker] = useState('')
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all')

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filterTicker && !t.ticker.toLowerCase().includes(filterTicker.toLowerCase())) return false
      if (filterType !== 'all' && t.type !== filterType) return false
      return true
    })
  }, [transactions, filterTicker, filterType])

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setOpen(true) }
  const openEdit = (t: Transaction) => {
    setForm({
      ticker: t.ticker,
      type: t.type,
      date: t.date,
      shares: t.shares ? String(t.shares) : '',
      price_per_share: t.price_per_share ? String(t.price_per_share) : '',
      amount: t.amount ? String(t.amount) : '',
      currency: (t.currency as Currency) ?? 'USD',
      fees: String(t.fees ?? 0),
      split_ratio: t.split_ratio ? String(t.split_ratio) : '',
      notes: t.notes ?? '',
    })
    setEditId(t.id)
    setOpen(true)
  }

  const handleSave = async () => {
    if (!form.ticker.trim() || !form.date) return
    setSaving(true)
    try {
      const payload = {
        ticker: form.ticker.toUpperCase().trim(),
        type: form.type,
        date: form.date,
        shares: parseFloat(form.shares) || 0,
        price_per_share: parseFloat(form.price_per_share) || 0,
        amount: parseFloat(form.amount) || 0,
        currency: form.currency,
        fees: parseFloat(form.fees) || 0,
        split_ratio: form.type === 'split' && form.split_ratio ? parseFloat(form.split_ratio) : null,
        notes: form.notes || null,
      }
      if (editId) await updateTransaction(editId, payload)
      else await addTransaction(payload)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const row = transactions.find((t) => t.id === deleteId)
    setDeleteId(null)
    if (!row) return
    await deleteWithUndo({
      description: `Deleted ${row.type} transaction · ${row.ticker}`,
      remove: () => deleteTransaction(row.id),
      restore: () => addTransaction({
        ticker: row.ticker,
        type: row.type,
        date: row.date,
        shares: row.shares,
        price_per_share: row.price_per_share,
        amount: row.amount,
        currency: row.currency,
        fees: row.fees,
        split_ratio: row.split_ratio,
        notes: row.notes,
      }),
    })
  }

  const canSave = !!form.ticker.trim() && !!form.date && !saving

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Transactions</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Optional ledger of buys, sells, dividends and splits — independent of your holdings
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/import">
            <Button variant="outline" className="self-start sm:self-auto">
              <Upload className="mr-2 h-4 w-4" /> Import CSV
            </Button>
          </Link>
          <Button onClick={openAdd} className="self-start sm:self-auto">
            <Plus className="mr-2 h-4 w-4" /> Add Transaction
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Filter by ticker</Label>
          <Input
            value={filterTicker}
            onChange={(e) => setFilterTicker(e.target.value)}
            placeholder="e.g. AAPL"
            className="h-9 w-40 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={filterType} onValueChange={(v) => setFilterType(v as 'all' | TransactionType)}>
            <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground self-center">
          {filtered.length} of {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
              <p className="text-sm">{transactions.length === 0 ? 'No transactions yet.' : 'No transactions match your filters.'}</p>
              {transactions.length === 0 && (
                <div className="flex gap-2">
                  <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add Transaction</Button>
                  <Link href="/import"><Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Import CSV</Button></Link>
                </div>
              )}
            </div>
          ) : (
            <TableScroll stickyFirstCol>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const meta = TYPE_META[t.type]
                    const Icon = meta.icon
                    const cur = (t.currency as Currency) ?? 'USD'
                    const total = t.type === 'dividend'
                      ? t.amount
                      : t.shares * t.price_per_share
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs whitespace-nowrap">{t.date}</TableCell>
                        <TableCell><div className="font-semibold">{t.ticker}</div></TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 ${meta.color}`}>
                            <Icon className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">{meta.label}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {t.type === 'split'
                            ? `×${t.split_ratio ?? 1}`
                            : t.shares > 0 ? formatShares(t.shares) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {t.type !== 'dividend' && t.type !== 'split' && t.price_per_share > 0
                            ? formatCurrency(t.price_per_share, cur)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {total > 0 ? formatCurrency(total, cur) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {t.fees > 0 ? formatCurrency(t.fees, cur) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {t.notes ?? '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="text-red-400 hover:text-red-300"
                              onClick={() => setDeleteId(t.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableScroll>
          )}
        </CardContent>
      </Card>

      {/* Add/edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ticker *</Label>
                <Input
                  value={form.ticker}
                  onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                  placeholder="AAPL"
                />
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as TransactionType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>

            {form.type === 'buy' || form.type === 'sell' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Shares *</Label>
                    <Input
                      type="number" step="any" min="0"
                      value={form.shares}
                      onChange={(e) => setForm({ ...form, shares: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price per share *</Label>
                    <Input
                      type="number" step="any" min="0"
                      value={form.price_per_share}
                      onChange={(e) => setForm({ ...form, price_per_share: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Fees</Label>
                    <Input
                      type="number" step="any" min="0"
                      value={form.fees}
                      onChange={(e) => setForm({ ...form, fees: e.target.value })}
                    />
                  </div>
                </div>
              </>
            ) : form.type === 'dividend' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Cash received *</Label>
                  <Input
                    type="number" step="any" min="0"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v as Currency })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Split ratio (e.g. 2 for a 2-for-1) *</Label>
                <Input
                  type="number" step="any" min="0.01"
                  value={form.split_ratio}
                  onChange={(e) => setForm({ ...form, split_ratio: e.target.value })}
                  placeholder="2"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete transaction?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove the transaction. Your derived position will be recalculated.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

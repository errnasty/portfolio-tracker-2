'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Trash2, ArrowDownCircle, ArrowUpCircle, Wallet, Upload } from 'lucide-react'
import type { Currency } from '@/types'

const PIE_COLORS = [
  '#f97316', '#0ea5e9', '#ec4899', '#eab308', '#8b5cf6',
  '#22c55e', '#f43f5e', '#14b8a6', '#6366f1', '#94a3b8',
]

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

export default function SpendingPage() {
  const { settings, accounts } = usePortfolio()
  const {
    bankTransactions, categories, categoryById, statsForMonth, loading, error,
    addBankTransaction, updateBankTransaction, deleteBankTransaction, categorize,
  } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [month, setMonth] = useState(thisMonth())
  const [accountFilter, setAccountFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')

  const accountName = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.name])) as Record<string, string>,
    [accounts],
  )

  const stats = statsForMonth(month)

  const filtered = useMemo(() => bankTransactions.filter((t) => {
    if (!t.date.startsWith(month)) return false
    if (accountFilter !== 'all' && t.account_id !== accountFilter) return false
    if (catFilter === 'uncat' && t.category_id) return false
    if (catFilter !== 'all' && catFilter !== 'uncat' && t.category_id !== catFilter) return false
    return true
  }), [bankTransactions, month, accountFilter, catFilter])

  const pieData = stats.byCategory.slice(0, 9).map((c) => ({ name: c.name, value: parseFloat(c.amount.toFixed(2)) }))

  // ── Add dialog ──────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    account_id: '', date: thisMonth() + '-01', description: '', merchant: '',
    amount: '', currency: 'SGD' as Currency, category_id: '', kind: 'expense' as 'expense' | 'income', notes: '',
  })
  const [saving, setSaving] = useState(false)

  const openAdd = () => {
    setForm({
      account_id: accounts[0]?.id ?? '', date: new Date().toISOString().slice(0, 10),
      description: '', merchant: '', amount: '', currency: (accounts[0]?.currency as Currency) ?? 'SGD',
      category_id: '', kind: 'expense', notes: '',
    })
    setOpen(true)
  }

  const handleSave = async () => {
    const abs = Math.abs(parseFloat(form.amount))
    if (isNaN(abs) || !form.description.trim()) return
    const amount = form.kind === 'expense' ? -abs : abs
    // Auto-categorize when the user didn't pick a category (user rules + built-in).
    let category_id: string | null = form.category_id || null
    if (!category_id) category_id = categorize(form.description, form.merchant)
    setSaving(true)
    try {
      await addBankTransaction({
        account_id: form.account_id || null,
        date: form.date,
        description: form.description.trim(),
        merchant: form.merchant.trim() || null,
        amount,
        currency: form.currency,
        category_id,
        source: 'manual',
        external_id: null,
        notes: form.notes.trim() || null,
      })
      setOpen(false)
    } catch {
      // toasted in context
    } finally {
      setSaving(false)
    }
  }

  const setCategory = (id: string, value: string) => {
    updateBankTransaction(id, { category_id: value || null })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Spending</h1>
          <p className="text-sm md:text-base text-muted-foreground">Track where your money goes</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Link href="/import">
            <Button size="sm" variant="outline">
              <Upload className="mr-2 h-4 w-4" /> Import CSV
            </Button>
          </Link>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add transaction
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-400">
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Spent</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-7 w-24" /> : (
              <div className="text-lg md:text-2xl font-bold tabular-nums">{formatCurrency(stats.expense, base)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Income</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-7 w-24" /> : (
              <div className="text-lg md:text-2xl font-bold tabular-nums text-emerald-400">{formatCurrency(stats.income, base)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-7 w-24" /> : (
              <div className={`text-lg md:text-2xl font-bold tabular-nums ${stats.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(stats.net, base)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Month</CardTitle>
          </CardHeader>
          <CardContent>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Category breakdown */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">By category</CardTitle></CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No spending this month</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v) => [formatCurrency(Number(v), base), 'Spent']}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1">
                  {stats.byCategory.slice(0, 9).map((c, i) => (
                    <div key={c.category_id ?? 'uncat'} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        {c.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{formatCurrency(c.amount, base)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Transactions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Transactions</CardTitle>
              <div className="flex gap-2">
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    <SelectItem value="uncat">Uncategorized</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : filtered.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No transactions for this filter.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-9">Date</TableHead>
                    <TableHead className="h-9">Description</TableHead>
                    <TableHead className="h-9">Category</TableHead>
                    <TableHead className="h-9 text-right">Amount</TableHead>
                    <TableHead className="h-9 w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const isIncome = Number(t.amount) >= 0
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="py-2 text-xs whitespace-nowrap">{t.date}</TableCell>
                        <TableCell className="py-2">
                          <div className="text-sm truncate max-w-[220px]">{t.description}</div>
                          {t.account_id && accountName[t.account_id] && (
                            <div className="text-[10px] text-muted-foreground">{accountName[t.account_id]}</div>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <Select value={t.category_id ?? ''} onValueChange={(v) => setCategory(t.id, v)}>
                            <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                            <SelectContent>
                              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className={`py-2 text-right tabular-nums text-sm ${isIncome ? 'text-emerald-400' : ''}`}>
                          {isIncome ? '+' : ''}{formatCurrency(Number(t.amount), t.currency)}
                        </TableCell>
                        <TableCell className="py-2">
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-red-400"
                            onClick={() => deleteBankTransaction(t.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add transaction dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add transaction</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as 'expense' | 'income' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="NTUC FairPrice" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount ({form.currency}) *</Label>
                <Input type="number" step="any" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="25.50" />
              </div>
              <div className="space-y-2">
                <Label>Account</Label>
                <Select value={form.account_id} onValueChange={(v) => {
                  const acc = accounts.find((a) => a.id === v)
                  setForm((f) => ({ ...f, account_id: v, currency: (acc?.currency as Currency) ?? f.currency }))
                }}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Auto-detect" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.description.trim() || !form.amount}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

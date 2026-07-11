'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell } from '@/components/ui/page-shell'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AccountsCard } from '@/components/spending/AccountsCard'
import { ReviewQueueCard } from '@/components/spending/ReviewQueueCard'
import { Plus, Trash2, Upload } from 'lucide-react'
import type { Currency } from '@/types'

const PIE_COLORS = ['#b5732f', '#3f6fb0', '#b07a86', '#C6A96A', '#7a6f9a', '#2f8f5b', '#9a4a3f', '#3f8f86', '#7a6f9a', '#9a8f7a']

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}
function addMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  // Build in UTC: a local-midnight Date read back via toISOString() shifts to the
  // previous month for any UTC+ timezone (e.g. Singapore), corrupting the trend.
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

export default function SpendingPage() {
  const {
    settings, accounts, accountsNetBase, accountsError, fxRates,
    addAccount, updateAccount, deleteAccount,
  } = usePortfolio()
  const {
    bankTransactions, categories, categoryById, statsForMonth, loading, error,
    addBankTransaction, updateBankTransaction, deleteBankTransaction, categorize, resolveDescription,
  } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [month, setMonth] = useState(thisMonth())
  const [accountFilter, setAccountFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'date' | 'payee'>('date')

  const accountName = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.name])) as Record<string, string>,
    [accounts],
  )

  const stats = statsForMonth(month)

  const trend = useMemo(() => {
    const out: { ym: string; label: string; expense: number }[] = []
    let ym = month
    for (let i = 0; i < 6; i++) { out.unshift({ ym, label: ym.slice(5), expense: statsForMonth(ym).expense }); ym = addMonth(ym, -1) }
    return out
  }, [statsForMonth, month])

  const movers = useMemo(() => {
    const cur = statsForMonth(month)
    const prev = statsForMonth(addMonth(month, -1))
    const prevMap = new Map(prev.byCategory.map((c) => [c.category_id, c.amount]))
    return cur.byCategory.map((c) => {
      const p = prevMap.get(c.category_id) ?? 0
      const delta = c.amount - p
      return { name: c.name, delta, deltaPct: p > 0 ? (delta / p) * 100 : (c.amount > 0 ? 100 : 0), hasPrev: p > 0 }
    }).filter((m) => Math.abs(m.delta) > 0.5).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3)
  }, [statsForMonth, month])

  const filtered = useMemo(() => bankTransactions.filter((t) => {
    if (!t.date.startsWith(month)) return false
    if (accountFilter !== 'all' && t.account_id !== accountFilter) return false
    if (catFilter === 'uncat' && t.category_id) return false
    if (catFilter !== 'all' && catFilter !== 'uncat' && t.category_id !== catFilter) return false
    return true
  }), [bankTransactions, month, accountFilter, catFilter])

  const sorted = useMemo(() => {
    if (sortBy !== 'payee') return filtered
    return [...filtered].sort((a, b) => resolveDescription(a).localeCompare(resolveDescription(b)))
  }, [filtered, sortBy, resolveDescription])

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

  const savingsRate = stats.income > 0 ? (stats.net / stats.income) * 100 : 0
  const prevExpense = trend.length >= 2 ? trend[trend.length - 2].expense : 0
  const momDelta = stats.expense - prevExpense
  const momPct = prevExpense > 0 ? (momDelta / prevExpense) * 100 : 0

  const statusRight = (
    <span className="flex items-center gap-4">
      <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-6 w-[130px] border-0 bg-transparent px-0 text-[11px] text-foreground focus-visible:ring-0" />
      <Link href="/import" className="flex items-center gap-1 hover:text-foreground"><Upload className="h-3.5 w-3.5" /> import</Link>
      <button onClick={openAdd} className="press flex items-center gap-1 hover:text-foreground"><Plus className="h-3.5 w-3.5" /> add</button>
    </span>
  )

  const footerHints = (
    <>
      <span><span className="text-accent">▸</span> <span className="text-foreground">g h</span> home · <span className="text-foreground">g b</span> budgets · <span className="text-foreground">g o</span> holdings</span>
    </>
  )

  return (
    <PageShell screen="Money" title="Spending" statusRight={statusRight} footerHints={footerHints}>
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          {error}
        </div>
      )}

      {/* Hero */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            vtName="hero-spent"
            label={`Spent · ${month}`}
            value={stats.expense}
            format={(n) => formatCurrency(n, base)}
            delta={prevExpense > 0 ? [
              <span key="m"><span className="text-muted-foreground">vs last month </span><span className={momDelta <= 0 ? 'text-up' : 'text-down'}>{momDelta >= 0 ? '+' : ''}{momPct.toFixed(0)}%</span></span>,
            ] : undefined}
          />
          <HeroMetric
            label="Income"
            value={stats.income}
            format={(n) => formatCurrency(n, base)}
            sub="this month"
          />
          <HeroMetric
            label="Net saved"
            value={stats.net}
            format={(n) => `${n >= 0 ? '+' : ''}${formatCurrency(n, base)}`}
            delta={[<span key="r" className={stats.net >= 0 ? 'text-up' : 'text-down'}>{savingsRate.toFixed(0)}% savings rate</span>]}
          />
        </HeroBand>
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
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'date' | 'payee')}>
                  <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Sort: Date</SelectItem>
                    <SelectItem value="payee">Sort: Payee</SelectItem>
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
                  {sorted.map((t) => {
                    const isIncome = Number(t.amount) >= 0
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="py-2 text-xs whitespace-nowrap">{t.date}</TableCell>
                        <TableCell className="py-2">
                          <div className="text-sm truncate max-w-[220px]">{resolveDescription(t)}</div>
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
                        <TableCell className={`py-2 text-right tabular-nums text-sm ${isIncome ? 'text-up' : ''}`}>
                          {isIncome ? '+' : ''}{formatCurrency(Number(t.amount), t.currency)}
                        </TableCell>
                        <TableCell className="py-2">
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-down"
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

      <ReviewQueueCard />

      {/* Month-over-month trends */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trends · last 6 months</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  formatter={(v) => [formatCurrency(Number(v), base), 'Spent']}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }}
                />
                <Bar dataKey="expense" radius={[2, 2, 0, 0]}>
                  {trend.map((t, i) => <Cell key={i} fill={t.ym === month ? '#3f6fb0' : 'hsl(var(--muted))'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Biggest movers vs last month</div>
              {movers.length === 0 ? (
                <div className="text-xs text-muted-foreground">Not enough history yet.</div>
              ) : (
                <div className="space-y-1.5">
                  {movers.map((m) => {
                    const up = m.delta >= 0
                    return (
                      <div key={m.name} className="flex items-center justify-between text-xs">
                        <span className="truncate">{m.name}</span>
                        <span className={`tabular-nums whitespace-nowrap ${up ? 'text-down' : 'text-up'}`}>
                          {up ? '▲' : '▼'} {m.hasPrev ? `${m.deltaPct >= 0 ? '+' : ''}${m.deltaPct.toFixed(0)}%` : 'new'} · {formatCurrency(Math.abs(m.delta), base)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AccountsCard
        accounts={accounts} netBase={accountsNetBase} base={base} fxRates={fxRates}
        loadError={accountsError} onAdd={addAccount} onUpdate={updateAccount} onDelete={deleteAccount}
      />

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
    </PageShell>
  )
}

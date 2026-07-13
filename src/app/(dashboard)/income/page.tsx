'use client'

import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageShell } from '@/components/ui/page-shell'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TitheCard } from '@/components/income/TitheCard'
import { Plus, Trash2 } from 'lucide-react'
import { useQuickAction } from '@/lib/quick-actions'
import type { Currency } from '@/types'

// Strongest brand hues first (validated); the labeled list below the donut
// carries identity, so color is never the only encoding.
const PIE_COLORS = ['#2f8f5b', '#3f6fb0', '#b5732f', '#7a6f9a', '#b07a86', '#3f8f86', '#9a4a3f', '#9a8f7a']

function thisMonth() { return new Date().toISOString().slice(0, 7) }
function addMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

export default function IncomePage() {
  const { settings, accounts } = usePortfolio()
  const {
    bankTransactions, categories, statsForMonth, loading, error,
    addBankTransaction, updateBankTransaction, deleteBankTransaction, resolveDescription,
  } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [month, setMonth] = useState(thisMonth())
  const stats = statsForMonth(month)
  const prev = statsForMonth(addMonth(month, -1))

  const incomeCats = useMemo(() => categories.filter((c) => c.kind === 'income'), [categories])
  const transferIds = useMemo(
    () => new Set(categories.filter((c) => c.kind === 'transfer').map((c) => c.id)),
    [categories],
  )

  const avg3 = useMemo(() => {
    let sum = 0
    for (let i = 1; i <= 3; i++) sum += statsForMonth(addMonth(month, -i)).income
    return sum / 3
  }, [statsForMonth, month])

  const ytd = useMemo(() => {
    const year = month.slice(0, 4)
    let sum = 0
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`
      if (ym > month) break
      sum += statsForMonth(ym).income
    }
    return sum
  }, [statsForMonth, month])

  // Income rows for the selected month (transfers excluded).
  const rows = useMemo(() => bankTransactions.filter((t) =>
    t.date.startsWith(month) && Number(t.amount) > 0 &&
    !(t.category_id && transferIds.has(t.category_id)),
  ), [bankTransactions, month, transferIds])

  const pieData = stats.incomeByCategory.slice(0, 8).map((c) => ({ name: c.name, value: parseFloat(c.amount.toFixed(2)) }))

  const momDelta = stats.income - prev.income
  const momPct = prev.income > 0 ? (momDelta / prev.income) * 100 : 0

  // ── Add income dialog ─────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    account_id: '', date: '', description: '', amount: '',
    currency: 'SGD' as Currency, category_id: '',
  })
  const [saving, setSaving] = useState(false)

  const openAdd = () => {
    const salaryId = incomeCats.find((c) => c.name === 'Salary')?.id ?? incomeCats[0]?.id ?? ''
    setForm({
      account_id: accounts[0]?.id ?? '',
      date: new Date().toISOString().slice(0, 10),
      description: '', amount: '',
      currency: (accounts[0]?.currency as Currency) ?? 'SGD',
      category_id: salaryId,
    })
    setOpen(true)
  }

  const handleSave = async () => {
    const abs = Math.abs(parseFloat(form.amount))
    if (isNaN(abs) || !form.description.trim()) return
    setSaving(true)
    try {
      await addBankTransaction({
        account_id: form.account_id || null,
        date: form.date,
        description: form.description.trim(),
        merchant: null,
        amount: abs,
        currency: form.currency,
        category_id: form.category_id || null,
        source: 'manual',
        external_id: null,
        notes: null,
      })
      setOpen(false)
    } catch {
      // toasted in context
    } finally {
      setSaving(false)
    }
  }

  useQuickAction('add-income', openAdd)

  const statusRight = (
    <span className="flex items-center gap-4">
      <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-6 w-[130px] border-0 bg-transparent px-0 text-[11px] text-foreground focus-visible:ring-0" />
      <button onClick={openAdd} className="press flex items-center gap-1 hover:text-foreground"><Plus className="h-3.5 w-3.5" /> add income</button>
    </span>
  )

  return (
    <PageShell
      screen="Money" title="Income" statusRight={statusRight}
      footerHints={<span><span className="text-accent">▸</span> <span className="text-foreground">g s</span> spending · <span className="text-foreground">g b</span> budgets</span>}
    >
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            label={`Income · ${month}`}
            value={stats.income}
            format={(n) => formatCurrency(n, base)}
            delta={prev.income > 0 ? [
              <span key="m"><span className="text-muted-foreground">vs last month </span><span className={momDelta >= 0 ? 'text-up' : 'text-down'}>{momDelta >= 0 ? '+' : ''}{momPct.toFixed(0)}%</span></span>,
            ] : undefined}
          />
          <HeroMetric label="Avg · last 3 months" value={avg3} format={(n) => formatCurrency(n, base)} sub="per month" />
          <HeroMetric label={`${month.slice(0, 4)} to date`} value={ytd} format={(n) => formatCurrency(n, base)} sub="calendar year" />
        </HeroBand>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Income by category */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">By source</CardTitle>
            <CardDescription>Salary, people, interest — categorize rows to split this up</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No income this month</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="hsl(var(--card))" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v) => [formatCurrency(Number(v), base), 'Received']}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1">
                  {stats.incomeByCategory.slice(0, 8).map((c, i) => (
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

        {/* Income transactions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Income received</CardTitle>
            <CardDescription>
              Money arrives automatically via bank-email forwarding and CSV imports — or add salary and one-offs manually.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : rows.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No income recorded for {month}. Use “add income” above, or forward your bank credit alerts.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-9">Date</TableHead>
                    <TableHead className="h-9">Description</TableHead>
                    <TableHead className="h-9">Source</TableHead>
                    <TableHead className="h-9 text-right">Amount</TableHead>
                    <TableHead className="h-9 w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="py-2 text-xs whitespace-nowrap">{t.date}</TableCell>
                      <TableCell className="py-2">
                        <div className="text-sm truncate max-w-[240px]">{resolveDescription(t)}</div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Select value={t.category_id ?? ''} onValueChange={(v) => updateBankTransaction(t.id, { category_id: v || null })}>
                          <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                          <SelectContent>
                            {incomeCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-sm text-up">
                        +{formatCurrency(Number(t.amount), t.currency)}
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
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <TitheCard />

      {/* Add income dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add income</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Description *</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="July salary" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount ({form.currency}) *</Label>
                <Input type="number" step="any" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="3500" />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-2">
                <Label>Source</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pick source" /></SelectTrigger>
                  <SelectContent>
                    {incomeCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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

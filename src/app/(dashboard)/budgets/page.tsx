'use client'

import { useMemo, useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { formatCurrency, cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageShell } from '@/components/ui/page-shell'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { History, Target } from 'lucide-react'
import type { Currency } from '@/types'

// Income/spending pair validated against the light surface (dataviz checks);
// the net line uses ink so it never competes with the bars.
const INCOME_COLOR = '#2f8f5b'
const EXPENSE_COLOR = '#b5732f'

function thisMonth() { return new Date().toISOString().slice(0, 7) }
function addMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}
function lastMonths(n: number): string[] {
  const out: string[] = []
  let ym = thisMonth()
  for (let i = 0; i < n; i++) { out.push(ym); ym = addMonth(ym, -1) }
  return out
}
// Inclusive ascending list of months from..to (bounded to 36).
function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  let ym = from
  for (let i = 0; ym <= to && i < 36; i++) { out.push(ym); ym = addMonth(ym, 1) }
  return out
}

export default function BudgetsPage() {
  const { settings } = usePortfolio()
  const { categories, budgets, upsertBudget, deleteBudget, statsForMonth, loading } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency
  const [month] = useState(thisMonth())

  const expenseCats = categories.filter((c) => c.kind === 'expense')
  const budgetByCat = useMemo(() => new Map(budgets.map((b) => [b.category_id, Number(b.amount)])), [budgets])

  const spentThisMonth = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of statsForMonth(month).byCategory) if (c.category_id) m.set(c.category_id, c.amount)
    return m
  }, [statsForMonth, month])

  const avgByCat = useMemo(() => {
    const months = lastMonths(3)
    const totals = new Map<string, number>()
    for (const ym of months) {
      for (const c of statsForMonth(ym).byCategory) {
        if (c.category_id) totals.set(c.category_id, (totals.get(c.category_id) ?? 0) + c.amount)
      }
    }
    const avg = new Map<string, number>()
    for (const [k, v] of totals) avg.set(k, v / months.length)
    return avg
  }, [statsForMonth])

  const totalBudget = expenseCats.reduce((s, c) => s + (budgetByCat.get(c.id) ?? 0), 0)
  const totalSpent = expenseCats.reduce((s, c) => s + (spentThisMonth.get(c.id) ?? 0), 0)
  const remaining = totalBudget - totalSpent

  const usedPct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0

  return (
    <PageShell
      screen="Money" title="Budgets"
      statusRight={<span>{month} · {expenseCats.length} categories</span>}
      footerHints={<span><span className="text-accent">▸</span> <span className="text-foreground">g s</span> spending · <span className="text-foreground">g h</span> home</span>}
    >
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            label="Spent this month"
            value={totalSpent}
            format={(n) => formatCurrency(n, base)}
            sub={totalBudget > 0 ? <>of {formatCurrency(totalBudget, base)} budget</> : 'no budgets set'}
          >
            <div className="mt-3 h-1.5 overflow-hidden rounded-[1px] bg-[var(--hair)]">
              <div className={usedPct >= 100 ? 'h-full bg-down' : 'h-full bg-cool'} style={{ width: `${usedPct}%` }} />
            </div>
          </HeroMetric>
          <HeroMetric
            label="Remaining"
            value={remaining}
            format={(n) => formatCurrency(n, base)}
            delta={[<span key="r" className={remaining >= 0 ? 'text-up' : 'text-down'}>{remaining >= 0 ? 'on track' : 'over budget'}</span>]}
          />
          <HeroMetric
            label="Total budget"
            value={totalBudget}
            format={(n) => formatCurrency(n, base)}
            sub="monthly limit"
          />
        </HeroBand>
      </div>

      <HistoryCard base={base} totalBudget={totalBudget} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> Category budgets</CardTitle>
          <CardDescription>Type a monthly limit; leave blank to remove. Bar shows this month vs limit; avg is the last 3 months.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-3">
              {expenseCats.map((c) => (
                <BudgetRow
                  key={c.id}
                  name={c.name}
                  base={base}
                  limit={budgetByCat.get(c.id) ?? null}
                  spent={spentThisMonth.get(c.id) ?? 0}
                  avg={avgByCat.get(c.id) ?? 0}
                  onSave={(amt) => amt === null ? deleteBudget(c.id) : upsertBudget(c.id, amt)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </PageShell>
  )
}

type RangePreset = '3m' | '6m' | '12m' | 'custom'

// Feature: budget/spending/savings over a chosen stretch of months —
// past 3/6/12 or any custom from→to range.
function HistoryCard({ base, totalBudget }: { base: Currency; totalBudget: number }) {
  const { statsForMonth } = useSpending()
  const [preset, setPreset] = useState<RangePreset>('6m')
  const [customFrom, setCustomFrom] = useState(addMonth(thisMonth(), -5))
  const [customTo, setCustomTo] = useState(thisMonth())

  const months = useMemo(() => {
    if (preset === 'custom') {
      if (!customFrom || !customTo || customFrom > customTo) return []
      return monthRange(customFrom, customTo)
    }
    const n = preset === '3m' ? 3 : preset === '6m' ? 6 : 12
    return lastMonths(n).reverse()
  }, [preset, customFrom, customTo])

  const rows = useMemo(() => months.map((ym) => {
    const s = statsForMonth(ym)
    return { ym, label: ym.slice(2), income: s.income, expense: s.expense, net: s.net }
  }), [months, statsForMonth])

  const totals = useMemo(() => {
    const income = rows.reduce((s, r) => s + r.income, 0)
    const expense = rows.reduce((s, r) => s + r.expense, 0)
    const n = rows.length || 1
    return { income, expense, net: income - expense, avgIncome: income / n, avgExpense: expense / n, avgNet: (income - expense) / n }
  }, [rows])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> History</CardTitle>
            <CardDescription>Income, spending and savings across months — pick a preset or a custom range</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['3m', '6m', '12m', 'custom'] as RangePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={cn('rounded-full border px-3 py-1 text-xs transition-colors',
                  preset === p ? 'border-accent bg-[var(--accent-soft)] text-accent font-medium' : 'border-border text-muted-foreground hover:text-foreground')}
              >
                {p === 'custom' ? 'Custom' : `Last ${p.replace('m', '')} months`}
              </button>
            ))}
            {preset === 'custom' && (
              <span className="flex items-center gap-1">
                <Input type="month" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 w-[130px] text-xs" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="month" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 w-[130px] text-xs" />
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Pick a valid range (from ≤ to).
          </div>
        ) : (
          <>
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} /> Income</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: EXPENSE_COLOR }} /> Spending</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-foreground" /> Net saved</span>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} width={48}
                  tickFormatter={(v) => formatCurrency(Number(v), base, true).replace(/\.\d+$/, '')} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  formatter={(v, name) => [formatCurrency(Number(v), base), String(name)]}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Bar dataKey="expense" name="Spending" fill={EXPENSE_COLOR} radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Line dataKey="net" name="Net saved" stroke="hsl(var(--foreground))" strokeWidth={2} dot={{ r: 2.5 }} />
              </ComposedChart>
            </ResponsiveContainer>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9">Month</TableHead>
                  <TableHead className="h-9 text-right">Income</TableHead>
                  <TableHead className="h-9 text-right">Spending</TableHead>
                  <TableHead className="h-9 text-right">Net saved</TableHead>
                  {totalBudget > 0 && <TableHead className="h-9 text-right">vs budget</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const overBudget = totalBudget > 0 ? r.expense - totalBudget : 0
                  return (
                    <TableRow key={r.ym}>
                      <TableCell className="py-2 text-xs">{r.ym}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-sm">{formatCurrency(r.income, base)}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-sm">{formatCurrency(r.expense, base)}</TableCell>
                      <TableCell className={`py-2 text-right tabular-nums text-sm ${r.net >= 0 ? 'text-up' : 'text-down'}`}>
                        {r.net >= 0 ? '+' : ''}{formatCurrency(r.net, base)}
                      </TableCell>
                      {totalBudget > 0 && (
                        <TableCell className={`py-2 text-right tabular-nums text-xs ${overBudget > 0 ? 'text-down' : 'text-up'}`}>
                          {overBudget > 0 ? `over by ${formatCurrency(overBudget, base)}` : `under by ${formatCurrency(-overBudget, base)}`}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
                <TableRow className="border-t-2">
                  <TableCell className="py-2 text-xs font-medium">Total · avg/mo</TableCell>
                  <TableCell className="py-2 text-right tabular-nums text-sm font-medium">
                    {formatCurrency(totals.income, base)}
                    <div className="text-[10px] font-normal text-muted-foreground">{formatCurrency(totals.avgIncome, base)}</div>
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums text-sm font-medium">
                    {formatCurrency(totals.expense, base)}
                    <div className="text-[10px] font-normal text-muted-foreground">{formatCurrency(totals.avgExpense, base)}</div>
                  </TableCell>
                  <TableCell className={`py-2 text-right tabular-nums text-sm font-medium ${totals.net >= 0 ? 'text-up' : 'text-down'}`}>
                    {totals.net >= 0 ? '+' : ''}{formatCurrency(totals.net, base)}
                    <div className="text-[10px] font-normal text-muted-foreground">{formatCurrency(totals.avgNet, base)}</div>
                  </TableCell>
                  {totalBudget > 0 && <TableCell />}
                </TableRow>
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function BudgetRow({
  name, base, limit, spent, avg, onSave,
}: {
  name: string; base: Currency; limit: number | null; spent: number; avg: number
  onSave: (amount: number | null) => void
}) {
  const [value, setValue] = useState(limit != null ? String(limit) : '')

  const commit = () => {
    const trimmed = value.trim()
    if (trimmed === '') { if (limit != null) onSave(null); return }
    const n = parseFloat(trimmed)
    if (!isNaN(n) && n !== limit) onSave(n)
  }

  const pct = limit && limit > 0 ? (spent / limit) * 100 : 0
  const barColor = !limit ? 'bg-muted-foreground/30'
    : pct > 100 ? 'bg-down' : pct > 80 ? 'bg-warn' : 'bg-up'
  const status = !limit ? null
    : pct > 100 ? <span className="text-down">Over by {formatCurrency(spent - limit, base)}</span>
    : pct > 80 ? <span className="text-warn">Near limit</span>
    : <span className="text-up">On track</span>

  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 items-center rounded-md border border-border p-3">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{name}</span>
          <span className="tabular-nums text-muted-foreground">
            {formatCurrency(spent, base)}{limit ? ` / ${formatCurrency(limit, base)}` : ''}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--hair)] overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>avg {formatCurrency(avg, base)}/mo</span>
          {status}
        </div>
      </div>
      <Input
        type="number" step="any" min="0" placeholder="limit"
        className="h-9 w-24 text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </div>
  )
}

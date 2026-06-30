'use client'

import { useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Target } from 'lucide-react'
import type { Currency } from '@/types'

function thisMonth() { return new Date().toISOString().slice(0, 7) }
function lastMonths(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() - 1) }
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Budgets</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Set a monthly limit per category. Spending tracks against it automatically.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total budget</CardTitle></CardHeader>
          <CardContent><div className="text-lg md:text-2xl font-bold tabular-nums">{formatCurrency(totalBudget, base)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Spent this month</CardTitle></CardHeader>
          <CardContent><div className="text-lg md:text-2xl font-bold tabular-nums">{formatCurrency(totalSpent, base)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Remaining</CardTitle></CardHeader>
          <CardContent><div className={`text-lg md:text-2xl font-bold tabular-nums ${remaining >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(remaining, base)}</div></CardContent></Card>
      </div>

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
    : pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'
  const status = !limit ? null
    : pct > 100 ? <span className="text-red-400">Over by {formatCurrency(spent - limit, base)}</span>
    : pct > 80 ? <span className="text-amber-400">Near limit</span>
    : <span className="text-emerald-400">On track</span>

  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 items-center rounded-md border border-border p-3">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{name}</span>
          <span className="tabular-nums text-muted-foreground">
            {formatCurrency(spent, base)}{limit ? ` / ${formatCurrency(limit, base)}` : ''}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
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

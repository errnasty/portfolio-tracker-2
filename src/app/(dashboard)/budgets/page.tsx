'use client'

import { useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageShell } from '@/components/ui/page-shell'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
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

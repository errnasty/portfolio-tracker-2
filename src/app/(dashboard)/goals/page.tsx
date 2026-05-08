'use client'

import { useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Target, TrendingUp } from 'lucide-react'
import { deleteWithUndo } from '@/lib/toast-undo'
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import {
  monteCarlo, monthsBetween,
  requiredMonthlyDeterministic, requiredMonthlyForSuccess,
} from '@/lib/projection'
import type { Goal, Currency } from '@/types'
import { CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react'

interface GoalForm {
  name: string
  target_amount: string
  target_date: string
  monthly_contribution: string
  expected_return_pct: string
  expected_volatility_pct: string
}

const EMPTY_FORM: GoalForm = {
  name: '',
  target_amount: '1000000',
  target_date: '',
  monthly_contribution: '1000',
  expected_return_pct: '7',
  expected_volatility_pct: '15',
}

export default function GoalsPage() {
  const { goals, stats, settings, loading, addGoal, updateGoal, deleteGoal } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency
  const startingValue = stats?.totalValue ?? 0

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<GoalForm>(EMPTY_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const openAdd = () => {
    const tenYearsOut = new Date()
    tenYearsOut.setFullYear(tenYearsOut.getFullYear() + 10)
    setForm({ ...EMPTY_FORM, target_date: tenYearsOut.toISOString().slice(0, 10) })
    setEditId(null)
    setOpen(true)
  }

  const openEdit = (g: Goal) => {
    setForm({
      name: g.name,
      target_amount: String(g.target_amount),
      target_date: g.target_date,
      monthly_contribution: String(g.monthly_contribution),
      expected_return_pct: String(g.expected_return_pct),
      expected_volatility_pct: String(g.expected_volatility_pct),
    })
    setEditId(g.id)
    setOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.target_date) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        target_amount: parseFloat(form.target_amount) || 0,
        target_date: form.target_date,
        monthly_contribution: parseFloat(form.monthly_contribution) || 0,
        expected_return_pct: parseFloat(form.expected_return_pct) || 0,
        expected_volatility_pct: parseFloat(form.expected_volatility_pct) || 0,
      }
      if (editId) await updateGoal(editId, payload)
      else await addGoal(payload)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Goals</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Will I make it? Monte Carlo projections from your current portfolio
          </p>
        </div>
        <Button onClick={openAdd} className="self-start sm:self-auto">
          <Plus className="mr-2 h-4 w-4" /> Add Goal
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Target className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No goals yet — set your first target to project a path.</p>
            <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add your first goal</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              startingValue={startingValue}
              base={base}
              onEdit={() => openEdit(g)}
              onDelete={() => setDeleteId(g.id)}
            />
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Goal' : 'New Goal'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Retirement, House down payment, …" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Target amount ({base}) *</Label>
                <Input type="number" min="0" step="any" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Target date *</Label>
                <Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Monthly contribution ({base})</Label>
              <Input type="number" min="0" step="any" value={form.monthly_contribution} onChange={(e) => setForm({ ...form, monthly_contribution: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Expected annual return %</Label>
                <Input type="number" step="0.1" value={form.expected_return_pct} onChange={(e) => setForm({ ...form, expected_return_pct: e.target.value })} />
                <p className="text-[10px] text-muted-foreground">7% ≈ long-run global equities. Adjust for your asset mix.</p>
              </div>
              <div className="space-y-2">
                <Label>Expected volatility %</Label>
                <Input type="number" step="0.1" value={form.expected_volatility_pct} onChange={(e) => setForm({ ...form, expected_volatility_pct: e.target.value })} />
                <p className="text-[10px] text-muted-foreground">15% ≈ broad equity index. Lower for bond-heavy mixes.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.target_date}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete goal?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This permanently removes the goal.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (!deleteId) return
              const row = goals.find((g) => g.id === deleteId)
              setDeleteId(null)
              if (!row) return
              await deleteWithUndo({
                description: `Deleted goal "${row.name}"`,
                remove: () => deleteGoal(row.id),
                restore: () => addGoal({
                  name: row.name,
                  target_amount: row.target_amount,
                  target_date: row.target_date,
                  monthly_contribution: row.monthly_contribution,
                  expected_return_pct: row.expected_return_pct,
                  expected_volatility_pct: row.expected_volatility_pct,
                }),
              })
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GoalCard({
  goal, startingValue, base, onEdit, onDelete,
}: {
  goal: Goal
  startingValue: number
  base: Currency
  onEdit: () => void
  onDelete: () => void
}) {
  const months = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const m = monthsBetween(today, goal.target_date)
    return Math.max(1, m)
  }, [goal.target_date])

  const result = useMemo(() => {
    return monteCarlo({
      startingValue,
      monthlyContribution: goal.monthly_contribution,
      expectedAnnualReturnPct: goal.expected_return_pct,
      expectedAnnualVolPct: goal.expected_volatility_pct,
      months,
      paths: 800,
      seed: 42,
    }, goal.target_amount)
  }, [startingValue, goal, months])

  // Status classification — used for the prominent banner up top
  const status: 'ahead' | 'on_track' | 'behind' | 'critical' =
    result.successRate >= 0.85 ? 'ahead'
    : result.successRate >= 0.50 ? 'on_track'
    : result.successRate >= 0.25 ? 'behind'
    : 'critical'

  // Progress bar: how far the *current* portfolio value is to the target
  const progressPct = goal.target_amount > 0
    ? Math.min(100, (startingValue / goal.target_amount) * 100)
    : 0

  // Required monthly contribution at two levels:
  //  - deterministic (≈ 50% probability): closed-form annuity solve
  //  - 80% probability: numerical Monte Carlo bisection
  const requiredFor50 = useMemo(
    () => requiredMonthlyDeterministic(
      startingValue, months, goal.expected_return_pct, goal.target_amount,
    ),
    [startingValue, months, goal.expected_return_pct, goal.target_amount],
  )
  const requiredFor80 = useMemo(
    () => requiredMonthlyForSuccess(
      startingValue, months,
      goal.expected_return_pct, goal.expected_volatility_pct,
      goal.target_amount,
      0.80,
    ),
    [startingValue, months, goal.expected_return_pct, goal.expected_volatility_pct, goal.target_amount],
  )
  // Gap between what user contributes today and what's needed for 50%
  const monthlyGap = Math.max(0, requiredFor50 - goal.monthly_contribution)

  // Sample chart data — only show every Nth point if very long horizon
  const chartData = useMemo(() => {
    const stride = Math.max(1, Math.floor(result.series.length / 60))
    return result.series.filter((_, i) => i % stride === 0 || i === result.series.length - 1)
  }, [result])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> {goal.name}
            </CardTitle>
            <CardDescription>
              {formatCurrency(goal.target_amount, base)} by {goal.target_date}
              {' · '}{months} month{months === 1 ? '' : 's'} to go
              {' · '}{formatCurrency(goal.monthly_contribution, base)}/mo at {goal.expected_return_pct}% / {goal.expected_volatility_pct}%
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="text-red-400" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status banner — most prominent element */}
        <StatusBanner
          status={status}
          successRate={result.successRate}
          medianFinal={result.finalP50}
          target={goal.target_amount}
          monthlyGap={monthlyGap}
          base={base}
        />

        {/* Progress bar — current value vs target */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">
              Current progress
            </span>
            <span className="tabular-nums">
              <strong>{formatCurrency(startingValue, base)}</strong>
              {' / '}
              <span className="text-muted-foreground">{formatCurrency(goal.target_amount, base)}</span>
              {' · '}
              <span className="text-muted-foreground">{progressPct.toFixed(1)}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                status === 'ahead' ? 'bg-emerald-500'
                : status === 'on_track' ? 'bg-sky-500'
                : status === 'behind' ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Projected outcome at target date */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Projected portfolio at {goal.target_date}
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Stat
              label="Median outcome"
              value={formatCurrency(result.finalP50, base)}
              valueColor={result.finalP50 >= goal.target_amount ? 'text-emerald-400' : 'text-amber-400'}
              hint={result.finalP50 >= goal.target_amount
                ? `+${formatCurrency(result.finalP50 - goal.target_amount, base)} above target`
                : `−${formatCurrency(goal.target_amount - result.finalP50, base)} below target`}
            />
            <Stat
              label="Pessimistic (5th %)"
              value={formatCurrency(result.finalP5, base)}
              hint="Bad-luck path"
            />
            <Stat
              label="Optimistic (95th %)"
              value={formatCurrency(result.finalP95, base)}
              hint="Good-luck path"
            />
            <Stat
              label="Success probability"
              value={`${(result.successRate * 100).toFixed(0)}%`}
              valueColor={
                result.successRate >= 0.85 ? 'text-emerald-400'
                : result.successRate >= 0.5 ? 'text-sky-400'
                : result.successRate >= 0.25 ? 'text-amber-400' : 'text-red-400'
              }
              hint={`Hits ${formatCurrency(goal.target_amount, base)}+ across paths`}
            />
          </div>
        </div>

        {/* Required monthly contribution — always visible */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Monthly contribution needed
          </div>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
            <Stat
              label="You contribute"
              value={`${formatCurrency(goal.monthly_contribution, base)}/mo`}
            />
            <Stat
              label="For 50% chance"
              value={requiredFor50 > 0 ? `${formatCurrency(requiredFor50, base)}/mo` : 'Already there'}
              valueColor={
                requiredFor50 === 0 ? 'text-emerald-400'
                : monthlyGap === 0 ? 'text-emerald-400'
                : monthlyGap < goal.monthly_contribution * 0.5 ? 'text-amber-400'
                : 'text-red-400'
              }
              hint={
                requiredFor50 === 0
                  ? 'Trajectory already covers it'
                  : monthlyGap > 0
                    ? `Add ${formatCurrency(monthlyGap, base)}/mo`
                    : `Surplus ${formatCurrency(goal.monthly_contribution - requiredFor50, base)}/mo`
              }
            />
            <Stat
              label="For 80% chance"
              value={requiredFor80 > 0 ? `${formatCurrency(requiredFor80, base)}/mo` : 'Already there'}
              valueColor={requiredFor80 === 0 ? 'text-emerald-400' : 'text-foreground'}
              hint={requiredFor80 === 0
                ? 'Trajectory covers it with high confidence'
                : `${formatCurrency(Math.max(0, requiredFor80 - goal.monthly_contribution), base)}/mo more for stronger odds`}
            />
          </div>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatCurrency(v as number, base, true)} />
            <Tooltip
              formatter={(v) => formatCurrency(v as number, base)}
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {/* P5–P95 outer band */}
            <Area type="monotone" dataKey="p95" stackId={undefined} stroke="none" fill="#22c55e" fillOpacity={0.08} name="95th %" />
            <Area type="monotone" dataKey="p5"  stackId={undefined} stroke="none" fill="hsl(var(--card))" fillOpacity={1} legendType="none" />
            {/* P25–P75 inner band */}
            <Area type="monotone" dataKey="p75" stroke="none" fill="#22c55e" fillOpacity={0.18} name="75th %" />
            <Area type="monotone" dataKey="p25" stroke="none" fill="hsl(var(--card))" fillOpacity={1} legendType="none" />
            <Line type="monotone" dataKey="p50" stroke="#22c55e" strokeWidth={2} dot={false} name="Median" />
            <Line type="monotone" dataKey="expected" stroke="#a3a3a3" strokeDasharray="4 4" strokeWidth={1.5} dot={false} name="Deterministic" />
            <ReferenceLine y={goal.target_amount} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Target', position: 'right', fill: '#f43f5e', fontSize: 10 }} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-muted-foreground">
          Monte Carlo simulation, 800 paths. Bands show 5–95th and 25–75th percentile outcomes.
          Returns drawn from a lognormal distribution — assumes constant mean/vol and ignores fees, taxes, and rebalancing.
        </p>
      </CardContent>
    </Card>
  )
}

function Stat({
  label, value, valueColor, hint,
}: {
  label: string
  value: string
  valueColor?: string
  hint?: string
}) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${valueColor ?? ''}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  )
}

function StatusBanner({
  status, successRate, medianFinal, target, monthlyGap, base,
}: {
  status: 'ahead' | 'on_track' | 'behind' | 'critical'
  successRate: number
  medianFinal: number
  target: number
  monthlyGap: number
  base: Currency
}) {
  const config = {
    ahead: {
      icon: Sparkles,
      label: 'AHEAD OF TARGET',
      classes: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
      message: `You're tracking strongly — ${(successRate * 100).toFixed(0)}% of paths land at or above ${formatCurrency(target, base)}. Median outcome ${formatCurrency(medianFinal, base)}.`,
    },
    on_track: {
      icon: CheckCircle2,
      label: 'ON TRACK',
      classes: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
      message: `${(successRate * 100).toFixed(0)}% chance of hitting target. Median outcome ${formatCurrency(medianFinal, base)} vs ${formatCurrency(target, base)} target.`,
    },
    behind: {
      icon: AlertTriangle,
      label: 'BEHIND',
      classes: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
      message: `Only ${(successRate * 100).toFixed(0)}% chance at current pace. Median ${formatCurrency(medianFinal, base)}, target ${formatCurrency(target, base)}.${monthlyGap > 0 ? ` Add ~${formatCurrency(monthlyGap, base)}/mo to get to a coin-flip.` : ''}`,
    },
    critical: {
      icon: AlertTriangle,
      label: 'OFF TRACK',
      classes: 'border-red-500/40 bg-red-500/10 text-red-400',
      message: `Only ${(successRate * 100).toFixed(0)}% of paths hit target. Median outcome ${formatCurrency(medianFinal, base)} — significantly below ${formatCurrency(target, base)}.${monthlyGap > 0 ? ` Need ~${formatCurrency(monthlyGap, base)}/mo more, or revisit the target/horizon.` : ''}`,
    },
  }[status]
  const Icon = config.icon
  return (
    <div className={`rounded-md border p-4 ${config.classes}`}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-xs font-bold uppercase tracking-wider">{config.label}</div>
          <div className="mt-1 text-sm leading-relaxed">{config.message}</div>
        </div>
      </div>
    </div>
  )
}

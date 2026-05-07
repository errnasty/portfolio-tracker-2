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
import { monteCarlo, monthsBetween } from '@/lib/projection'
import type { Goal, Currency } from '@/types'

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

  const onTrack = result.successRate >= 0.5
  const successColor = result.successRate >= 0.85 ? 'text-emerald-400' : result.successRate >= 0.6 ? 'text-sky-400' : result.successRate >= 0.35 ? 'text-amber-400' : 'text-red-400'

  // Required monthly to hit target with 50% probability — solve for contribution
  // such that deterministic compound = target. Quick analytic solution.
  const requiredMonthly = useMemo(() => {
    const r = goal.expected_return_pct / 100 / 12
    const grown = startingValue * Math.pow(1 + r, months)
    const gap = goal.target_amount - grown
    if (gap <= 0) return 0
    if (r === 0) return gap / months
    const annuityFactor = (Math.pow(1 + r, months) - 1) / r
    return gap / annuityFactor
  }, [startingValue, goal, months])

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
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Stat label="Success probability" value={`${(result.successRate * 100).toFixed(0)}%`} valueColor={successColor} />
          <Stat label="Expected (median)" value={formatCurrency(result.finalP50, base)} />
          <Stat label="Pessimistic (5th %)" value={formatCurrency(result.finalP5, base)} />
          <Stat label="Optimistic (95th %)" value={formatCurrency(result.finalP95, base)} />
        </div>

        <div className={`rounded-md p-3 text-sm ${onTrack ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
          <div className="flex items-center gap-2 font-medium">
            <TrendingUp className="h-4 w-4" />
            {onTrack
              ? `On track — median path lands ~${formatCurrency(result.finalP50, base)}, above target.`
              : `Behind target — median path lands ~${formatCurrency(result.finalP50, base)}.`}
          </div>
          {!onTrack && requiredMonthly > goal.monthly_contribution && (
            <div className="mt-1 text-xs">
              Need ~{formatCurrency(requiredMonthly, base)}/mo (vs current {formatCurrency(goal.monthly_contribution, base)}) for a 50% expected hit.
            </div>
          )}
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

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${valueColor ?? ''}`}>{value}</div>
    </div>
  )
}

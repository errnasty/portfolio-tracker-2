'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { convertToBase } from '@/lib/calculations'
import { computeTithe } from '@/lib/tithe'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { HandHeart, Plus, Trash2 } from 'lucide-react'
import type { Currency, TitheClearance } from '@/types'

function today() { return new Date().toISOString().slice(0, 10) }

// The tithing pool: accrues a % of all income; Giving-category spending and
// manual clearances (cash offerings etc.) count against it.
export function TitheCard() {
  const { settings, updateSettings, fxRates } = usePortfolio()
  const { bankTransactions, categories } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const enabled = settings?.tithe_enabled ?? false
  const rate = Number(settings?.tithe_rate ?? 10)
  const start = settings?.tithe_start ?? null

  const [clearances, setClearances] = useState<TitheClearance[]>([])
  const [tableMissing, setTableMissing] = useState(false)

  const refreshClearances = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('tithe_clearances').select('*').eq('user_id', user.id).order('date', { ascending: false })
    if (error) {
      if (error.code === '42P01' || /relation .* does not exist|schema cache/i.test(error.message)) setTableMissing(true)
      return
    }
    setClearances(data ?? [])
  }, [])

  useEffect(() => { refreshClearances() }, [refreshClearances])

  const result = useMemo(() => {
    const transferIds = new Set(categories.filter((c) => c.kind === 'transfer').map((c) => c.id))
    const givingIds = new Set(categories.filter((c) => c.name === 'Giving').map((c) => c.id))
    const txns = bankTransactions.map((t) => ({
      date: t.date,
      amount: fxRates ? convertToBase(Number(t.amount) || 0, t.currency, fxRates) : Number(t.amount) || 0,
      category_id: t.category_id,
    }))
    return computeTithe({
      txns,
      transferCategoryIds: transferIds,
      givingCategoryIds: givingIds,
      ratePct: rate,
      startDate: start,
      clearances: clearances.map((c) => ({ date: c.date, amount: Number(c.amount) })),
    })
  }, [bankTransactions, categories, fxRates, rate, start, clearances])

  // ── Settings edit ─────────────────────────────────────────────────────
  const [rateInput, setRateInput] = useState(String(rate))
  const [startInput, setStartInput] = useState(start ?? '')
  useEffect(() => { setRateInput(String(rate)); setStartInput(start ?? '') }, [rate, start])

  const saveSettings = async (on: boolean) => {
    const r = parseFloat(rateInput)
    try {
      await updateSettings({
        tithe_enabled: on,
        tithe_rate: isNaN(r) || r <= 0 ? 10 : r,
        tithe_start: startInput || null,
      })
      if (on) toast.success('Tithing pool enabled')
    } catch (e) {
      toast.error(`Save failed: ${String(e)}`)
    }
  }

  // ── Record a clearance ────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [clearAmount, setClearAmount] = useState('')
  const [clearDate, setClearDate] = useState(today())
  const [clearNotes, setClearNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const addClearance = async () => {
    const amt = parseFloat(clearAmount)
    if (isNaN(amt) || amt <= 0) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { error } = await supabase.from('tithe_clearances').insert({
        user_id: user.id, date: clearDate, amount: amt, notes: clearNotes.trim() || null,
      })
      if (error) { toast.error(`Save failed: ${error.message}`); return }
      setOpen(false)
      setClearAmount(''); setClearNotes('')
      await refreshClearances()
    } finally {
      setSaving(false)
    }
  }

  const deleteClearance = async (id: string) => {
    const { error } = await supabase.from('tithe_clearances').delete().eq('id', id)
    if (error) { toast.error(`Delete failed: ${error.message}`); return }
    await refreshClearances()
  }

  if (tableMissing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><HandHeart className="h-4 w-4" /> Tithing</CardTitle>
          <CardDescription>
            The <code className="font-mono text-xs">tithe_clearances</code> table is missing — run{' '}
            <code className="font-mono text-xs">supabase/migrations/002_finance_features.sql</code> in your Supabase SQL editor.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><HandHeart className="h-4 w-4" /> Tithing</CardTitle>
          <CardDescription>
            Automatically set aside a share of all income into a pool, and clear it as you give.
            Giving-category transactions count automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Rate (% of income)</Label>
            <Input type="number" step="any" min="0" className="w-28" value={rateInput} onChange={(e) => setRateInput(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Count income from</Label>
            <Input type="date" className="w-40" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
          </div>
          <Button onClick={() => saveSettings(true)}>Enable tithing pool</Button>
        </CardContent>
      </Card>
    )
  }

  const covered = result.givenViaGiving + result.clearedManually
  const pct = result.accrued > 0 ? Math.min(100, (covered / result.accrued) * 100) : (covered > 0 ? 100 : 0)
  const recentMonths = result.byMonth.slice(-6).reverse()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><HandHeart className="h-4 w-4" /> Tithing pool</CardTitle>
            <CardDescription>
              {rate}% of income{start ? ` since ${start}` : ''} · Giving transactions clear it automatically
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Record tithe given
            </Button>
            <Button variant="ghost" size="sm" onClick={() => saveSettings(false)}>Disable</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">To tithe</div>
            <div className={`text-xl font-semibold tabular-nums ${result.owed > 0 ? 'text-warn' : 'text-up'}`}>
              {result.owed > 0 ? formatCurrency(result.owed, base) : result.owed < 0 ? `${formatCurrency(-result.owed, base)} ahead` : 'All clear'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Accrued ({rate}%)</div>
            <div className="text-xl font-semibold tabular-nums">{formatCurrency(result.accrued, base)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Given (Giving)</div>
            <div className="text-xl font-semibold tabular-nums">{formatCurrency(result.givenViaGiving, base)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Cleared manually</div>
            <div className="text-xl font-semibold tabular-nums">{formatCurrency(result.clearedManually, base)}</div>
          </div>
        </div>

        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--hair)]">
            <div className="h-full rounded-full bg-up" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {formatCurrency(covered, base)} of {formatCurrency(result.accrued, base)} tithed
          </div>
        </div>

        {recentMonths.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Recent months</div>
            {recentMonths.map((m) => (
              <div key={m.ym} className="flex items-center justify-between text-xs">
                <span>{m.ym}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(m.accrued, base)} accrued · {formatCurrency(m.given, base)} given
                </span>
              </div>
            ))}
          </div>
        )}

        {clearances.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Manual clearances</div>
            {clearances.slice(0, 5).map((c) => (
              <div key={c.id} className="group flex items-center justify-between text-xs">
                <span>{c.date}{c.notes ? ` · ${c.notes}` : ''}</span>
                <span className="flex items-center gap-1 tabular-nums">
                  {formatCurrency(Number(c.amount), base)}
                  <button
                    onClick={() => deleteClearance(c.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-down"
                    aria-label="Delete clearance"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Rate %</Label>
            <Input type="number" step="any" min="0" className="h-8 w-24 text-sm" value={rateInput} onChange={(e) => setRateInput(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Count income from</Label>
            <Input type="date" className="h-8 w-40 text-sm" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" onClick={() => saveSettings(true)}>Update</Button>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record tithe given</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-xs text-muted-foreground">
              For tithes given outside your tracked accounts (e.g. cash). Bank transactions
              categorized as <strong>Giving</strong> already count — don&apos;t record those twice.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount ({base}) *</Label>
                <Input type="number" step="any" min="0" value={clearAmount} onChange={(e) => setClearAmount(e.target.value)} placeholder="100" />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={clearDate} onChange={(e) => setClearDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={clearNotes} onChange={(e) => setClearNotes(e.target.value)} placeholder="Cash offering" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={addClearance} disabled={saving || !clearAmount}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

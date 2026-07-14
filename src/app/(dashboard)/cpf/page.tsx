'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { convertToBase } from '@/lib/calculations'
import { computeCpf, ageInYear, cpfBand, CPF_CONFIG, type SalaryBasis } from '@/lib/cpf'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageShell } from '@/components/ui/page-shell'
import { SubNav } from '@/components/ui/sub-nav'
import { SUB_NAVS } from '@/lib/nav-registry'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PiggyBank, Wallet2, HeartPulse, ShieldPlus } from 'lucide-react'
import type { AssetKind, Currency, CpfContribution } from '@/types'

const CPF_KINDS: { kind: AssetKind; label: string; icon: React.ElementType }[] = [
  { kind: 'cpf_oa', label: 'Ordinary Account', icon: Wallet2 },
  { kind: 'cpf_sa', label: 'Special Account', icon: ShieldPlus },
  { kind: 'cpf_ma', label: 'MediSave', icon: HeartPulse },
]

function today() { return new Date().toISOString().slice(0, 10) }
function thisYear() { return new Date().getFullYear() }

export default function CpfPage() {
  const { settings, updateSettings, assets, assetsError, addAsset, updateAsset, fxRates } = usePortfolio()
  const { categories, bankTransactions } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const enabled = settings?.cpf_enabled ?? false
  const birthYear = settings?.cpf_birth_year ?? null
  const basis = (settings?.cpf_salary_basis ?? 'take_home') as SalaryBasis
  const cpfStart = settings?.cpf_start ?? null

  const cpfAssets = useMemo(
    () => Object.fromEntries(assets.filter((a) => a.kind.startsWith('cpf_')).map((a) => [a.kind, a])),
    [assets],
  )
  const totalCpf = CPF_KINDS.reduce((s, k) => s + Number(cpfAssets[k.kind]?.balance ?? 0), 0)

  const [contributions, setContributions] = useState<CpfContribution[]>([])
  const [tableMissing, setTableMissing] = useState(false)

  const refreshContribs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('cpf_contributions').select('*').eq('user_id', user.id).order('date', { ascending: false })
    if (error) {
      if (error.code === '42P01' || /relation .* does not exist|schema cache/i.test(error.message)) setTableMissing(true)
      return
    }
    setTableMissing(false)
    setContributions(data ?? [])
  }, [])
  useEffect(() => { refreshContribs() }, [refreshContribs])

  const ytdContrib = useMemo(() => {
    const yr = String(thisYear())
    return contributions.filter((c) => c.date.startsWith(yr))
      .reduce((s, c) => s + Number(c.oa) + Number(c.sa) + Number(c.ma), 0)
  }, [contributions])

  // Estimated CPF from the most recent Salary income (a preview of what the
  // auto-poster books each month).
  const estimate = useMemo(() => {
    if (!birthYear) return null
    const salaryIds = new Set(categories.filter((c) => c.name === 'Salary').map((c) => c.id))
    const latest = bankTransactions
      .filter((t) => t.category_id && salaryIds.has(t.category_id) && Number(t.amount) > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    if (!latest) return null
    return { ...computeCpf({ recordedSalary: Number(latest.amount), basis, age: ageInYear(birthYear, latest.date) }), from: latest }
  }, [birthYear, categories, bankTransactions, basis])

  // ── Settings form ───────────────────────────────────────────────────────
  const [yearInput, setYearInput] = useState(birthYear ? String(birthYear) : '')
  const [basisInput, setBasisInput] = useState<SalaryBasis>(basis)
  useEffect(() => { setYearInput(birthYear ? String(birthYear) : ''); setBasisInput(basis) }, [birthYear, basis])

  const saveSettings = async (on: boolean) => {
    const yr = parseInt(yearInput, 10)
    if (on && (isNaN(yr) || yr < 1940 || yr > thisYear())) { toast.error('Enter a valid birth year'); return }
    try {
      await updateSettings({
        cpf_enabled: on,
        cpf_birth_year: isNaN(yr) ? null : yr,
        cpf_salary_basis: basisInput,
        // Start auto-contributing from today the first time it's switched on.
        cpf_start: on ? (cpfStart ?? today()) : cpfStart,
      })
      if (on) toast.success('CPF auto-contribution enabled — salary you record from now adds to CPF')
    } catch (e) {
      toast.error(`Save failed: ${String(e)}`)
    }
  }

  // ── Manual balance edit (opening balances / corrections) ─────────────────
  const setBalance = async (kind: AssetKind, label: string, value: string) => {
    const v = parseFloat(value)
    if (isNaN(v) || v < 0) return
    const existing = cpfAssets[kind]
    try {
      if (existing) await updateAsset(existing.id, { balance: v })
      else await addAsset({ name: `CPF ${label}`, kind, balance: v, currency: 'SGD', interest_rate_pct: null, maturity_date: null, monthly_payment: null, notes: null, is_active: true })
      toast.success(`${label} set to ${formatCurrency(v, 'SGD')}`)
    } catch { /* toasted in context */ }
  }

  const age = birthYear ? ageInYear(birthYear, today()) : null
  const band = age != null ? cpfBand(age) : null
  const totalCpfBase = fxRates ? convertToBase(totalCpf, 'SGD', fxRates) : totalCpf

  return (
    <PageShell
      screen="Money" title="CPF"
      statusRight={<span>{enabled ? `auto · ${basis === 'take_home' ? '80% take-home' : 'gross'}` : 'manual'}</span>}
      footerHints={<span><span className="text-accent">▸</span> <span className="text-foreground">g a</span> accounts · <span className="text-foreground">g i</span> income</span>}
    >
    <div className="space-y-4">
      <SubNav links={[...SUB_NAVS.accounts]} />

      {assetsError && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">{assetsError}</div>
      )}
      {tableMissing && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          The <code className="font-mono text-xs">cpf_contributions</code> table is missing — run{' '}
          <code className="font-mono text-xs">supabase/migrations/007_cpf.sql</code> in your Supabase SQL editor to enable auto-contributions.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            label="Total CPF"
            value={totalCpf}
            format={(n) => formatCurrency(n, 'SGD')}
            sub={base !== 'SGD' ? `≈ ${formatCurrency(totalCpfBase, base)}` : 'OA + SA + MediSave'}
          />
          <HeroMetric label={`Contributed in ${thisYear()}`} value={ytdContrib} format={(n) => formatCurrency(n, 'SGD')} sub="employee + employer" />
          <HeroMetric
            label="Per salary (est.)"
            value={estimate?.total ?? 0}
            format={(n) => formatCurrency(n, 'SGD')}
            sub={estimate ? `on ${formatCurrency(estimate.gross, 'SGD')} gross` : 'record a salary first'}
          />
        </HeroBand>
      </div>

      {/* Account balances */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><PiggyBank className="h-4 w-4" /> Balances</CardTitle>
          <CardDescription>
            Auto-contributions top these up from your salary. Edit to set your current CPF balances or correct.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {CPF_KINDS.map((k) => (
              <BalanceCard
                key={k.kind}
                icon={k.icon}
                label={k.label}
                value={Number(cpfAssets[k.kind]?.balance ?? 0)}
                allocationPct={band ? (k.kind === 'cpf_oa' ? band.oa : k.kind === 'cpf_sa' ? band.sa : band.ma) * 100 : null}
                onSave={(v) => setBalance(k.kind, k.label, v)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Auto-contribution settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatic contributions</CardTitle>
          <CardDescription>
            You receive 80% of your salary (the 20% employee CPF is already deducted). When enabled, every{' '}
            <strong>Salary</strong> income you record adds the full 37% —{' '}
            {(CPF_CONFIG.employeeRate * 100).toFixed(0)}% employee + {(CPF_CONFIG.employerRate * 100).toFixed(0)}% employer —
            of your gross wage into OA / SA / MediSave, split by your age band, capped at the{' '}
            {formatCurrency(CPF_CONFIG.owCeilingMonthly, 'SGD')} monthly wage ceiling.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Birth year</Label>
              <Input type="number" className="w-28" value={yearInput} onChange={(e) => setYearInput(e.target.value)} placeholder="1996" />
            </div>
            <div className="space-y-2">
              <Label>Recorded salary is</Label>
              <Select value={basisInput} onValueChange={(v) => setBasisInput(v as SalaryBasis)}>
                <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="take_home">Take-home (80%, after CPF)</SelectItem>
                  <SelectItem value="gross">Gross (before CPF)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {enabled ? (
              <>
                <Button variant="outline" onClick={() => saveSettings(true)}>Update</Button>
                <Button variant="ghost" onClick={() => saveSettings(false)}>Disable</Button>
              </>
            ) : (
              <Button onClick={() => saveSettings(true)}>Enable auto-contribution</Button>
            )}
          </div>

          {enabled && age != null && band && (
            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
              At age {age} your allocation is OA {(band.oa * 100).toFixed(1)}% · SA {(band.sa * 100).toFixed(1)}% · MediSave {(band.ma * 100).toFixed(1)}% of wage.
              Auto-contributions apply to salary dated on/after {cpfStart ?? today()}.
              {estimate && (
                <> Your last salary of {formatCurrency(Number(estimate.from.amount), 'SGD')} ({basis === 'take_home' ? 'take-home' : 'gross'}) →
                  {' '}{formatCurrency(estimate.gross, 'SGD')} gross → CPF {formatCurrency(estimate.total, 'SGD')}
                  {' '}(OA {formatCurrency(estimate.oa, 'SGD')}, SA {formatCurrency(estimate.sa, 'SGD')}, MA {formatCurrency(estimate.ma, 'SGD')}).</>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contribution history */}
      {contributions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contribution history</CardTitle>
            <CardDescription>Booked automatically from your salary</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Gross wage</TableHead>
                  <TableHead className="text-right">Employee</TableHead>
                  <TableHead className="text-right">Employer</TableHead>
                  <TableHead className="text-right">OA / SA / MA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contributions.slice(0, 24).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="py-2 text-xs whitespace-nowrap">{c.date}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums text-sm">{formatCurrency(Number(c.gross), 'SGD')}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums text-sm">{formatCurrency(Number(c.employee), 'SGD')}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums text-sm">{formatCurrency(Number(c.employer), 'SGD')}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums text-xs text-muted-foreground">
                      {formatCurrency(Number(c.oa), 'SGD')} / {formatCurrency(Number(c.sa), 'SGD')} / {formatCurrency(Number(c.ma), 'SGD')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        CPF rates are for private-sector employees aged 55 and below. Figures are estimates for personal tracking —
        your official CPF statement is authoritative.
      </p>
    </div>
    </PageShell>
  )
}

function BalanceCard({ icon: Icon, label, value, allocationPct, onSave }: {
  icon: React.ElementType; label: string; value: number; allocationPct: number | null; onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
        {allocationPct != null && <span className="ml-auto normal-case tracking-normal">{allocationPct.toFixed(1)}% of wage</span>}
      </div>
      {editing ? (
        <div className="mt-1 flex items-center gap-1">
          <Input type="number" step="any" min="0" className="h-8 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <Button size="sm" className="h-8" onClick={() => { onSave(draft); setEditing(false) }}>Save</Button>
        </div>
      ) : (
        <button className="mt-1 block text-left" onClick={() => setEditing(true)} title="Click to edit">
          <span className="text-xl font-semibold tabular-nums">{formatCurrency(value, 'SGD')}</span>
        </button>
      )}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import {
  estimateTax, RESIDENT_BRACKETS, taxOnChargeableIncome,
  SRS_RELIEF_CAP_SG, SRS_RELIEF_CAP_FOREIGNER, CPF_CASH_TOPUP_OWN_CAP,
} from '@/lib/income-tax'

const SGD = (n: number) => formatCurrency(n, 'SGD')

function num(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// Singapore resident income-tax estimator. Everything is client-side and
// assumption-driven — it's a planning tool, not a filed return.
export default function TaxPage() {
  const [income, setIncome] = useState('100000')
  const [reliefs, setReliefs] = useState('0')
  const [srs, setSrs] = useState('0')
  const [cpf, setCpf] = useState('0')
  const [foreigner, setForeigner] = useState(false)

  const assessableIncome = num(income)
  const srsCap = foreigner ? SRS_RELIEF_CAP_FOREIGNER : SRS_RELIEF_CAP_SG

  const est = useMemo(() => estimateTax({
    assessableIncome,
    reliefs: num(reliefs),
    srsTopUp: num(srs),
    cpfCashTopUp: num(cpf),
    isForeigner: foreigner,
  }), [assessableIncome, reliefs, srs, cpf, foreigner])

  // Per-bracket contribution to the final bill, for the breakdown table.
  const bracketRows = useMemo(() => {
    const ci = est.chargeableIncome
    return RESIDENT_BRACKETS.map((b, i) => {
      const nextFloor = RESIDENT_BRACKETS[i + 1]?.floor ?? Infinity
      const inBand = Math.max(0, Math.min(ci, nextFloor) - b.floor)
      return { ...b, nextFloor, inBand, tax: inBand * b.rate }
    }).filter((r) => r.inBand > 0)
  }, [est.chargeableIncome])

  const maxSrsSave = taxOnChargeableIncome(Math.max(0, est.chargeableIncome + num(srs)))
    - taxOnChargeableIncome(Math.max(0, est.chargeableIncome + num(srs) - srsCap))

  return (
    <PageShell
      screen="Plan" title="Tax estimator"
      statusRight={<span>YA2024+ resident rates</span>}
      footerHints={<span><span className="text-accent">▸</span> planning estimate · not a filed return</span>}
    >
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your year</CardTitle>
            <CardDescription>
              Enter assessable income (after allowable employment expenses) and any reliefs you
              already claim. All figures in SGD.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assessable income" hint="Salary, trade & other taxable income">
                <Input inputMode="numeric" value={income} onChange={(e) => setIncome(e.target.value)} />
              </Field>
              <Field label="Reliefs already claimed" hint="Earned income, NSman, parenthood, etc.">
                <Input inputMode="numeric" value={reliefs} onChange={(e) => setReliefs(e.target.value)} />
              </Field>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Residency for SRS cap:</span>
              <div className="flex overflow-hidden rounded-full border border-border">
                {([['Citizen / PR', false], ['Foreigner', true]] as const).map(([label, val]) => (
                  <button
                    key={label}
                    onClick={() => setForeigner(val)}
                    className={cn('px-3 py-1 text-xs transition-colors',
                      foreigner === val ? 'bg-[var(--accent-soft)] text-accent font-medium' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What if I top up?</CardTitle>
            <CardDescription>
              SRS and CPF cash top-ups to your own retirement savings are tax-deductible — see the
              impact instantly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Slider
              label="SRS contribution" value={num(srs)} max={srsCap}
              onChange={(v) => setSrs(String(v))} help={`Cap ${SGD(srsCap)}`}
            />
            <Slider
              label="CPF cash top-up (own SA/RA)" value={num(cpf)} max={CPF_CASH_TOPUP_OWN_CAP}
              onChange={(v) => setCpf(String(v))} help={`Cap ${SGD(CPF_CASH_TOPUP_OWN_CAP)}`}
            />
            {est.taxSaved > 0 && (
              <div className="rounded-lg border border-[var(--up)] bg-[var(--up-soft)] px-4 py-3 text-sm">
                These top-ups cut your tax by{' '}
                <span className="font-semibold text-up">{SGD(est.taxSaved)}</span> this year.
              </div>
            )}
            {est.taxSaved === 0 && num(srs) === 0 && maxSrsSave > 0 && (
              <p className="text-xs text-muted-foreground">
                Maxing your SRS ({SGD(srsCap)}) would save about {SGD(maxSrsSave)} at your current marginal rate.
              </p>
            )}
            {est.reliefsCapped && (
              <p className="text-xs text-warn">
                Heads up: total personal reliefs are capped at {SGD(80_000)}, so not all of the above reduces your tax.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Chargeable income" value={SGD(est.chargeableIncome)} />
          <Stat label="Estimated tax" value={SGD(est.tax)} accent />
          <Stat label="Effective rate" value={`${(est.effectiveRate * 100).toFixed(2)}%`} />
          <Stat label="Marginal rate" value={`${(est.marginalRate * 100).toFixed(1)}%`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How it&apos;s taxed</CardTitle>
            <CardDescription>Progressive brackets applied to your chargeable income</CardDescription>
          </CardHeader>
          <CardContent>
            {bracketRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No tax due — chargeable income is within the {SGD(20_000)} tax-free band.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-1.5 font-medium">Band</th>
                      <th className="py-1.5 font-medium text-right">Rate</th>
                      <th className="py-1.5 font-medium text-right">Taxed here</th>
                      <th className="py-1.5 font-medium text-right">Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bracketRows.map((r) => (
                      <tr key={r.floor} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 tabular-nums">
                          {SGD(r.floor)}{r.nextFloor === Infinity ? '+' : ` – ${SGD(r.nextFloor)}`}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{(r.rate * 100).toFixed(1)}%</td>
                        <td className="py-1.5 text-right tabular-nums">{SGD(r.inBand)}</td>
                        <td className="py-1.5 text-right tabular-nums">{SGD(r.tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground">
          Estimate only, using YA2024-onward resident rates. Excludes rebates and reliefs Aureus
          doesn&apos;t know about. Confirm with IRAS before filing.
        </p>
      </div>
    </PageShell>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

function Slider({ label, value, max, onChange, help }: {
  label: string; value: number; max: number; onChange: (v: number) => void; help?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="tabular-nums text-sm text-accent">{SGD(Math.min(value, max))}</span>
      </div>
      <input
        type="range" min={0} max={max} step={100}
        value={Math.min(value, max)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--accent))]"
        aria-label={label}
      />
      {help && <div className="text-[11px] text-muted-foreground">{help}</div>}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-3', accent ? 'border-accent bg-[var(--accent-soft)]' : 'border-border bg-card')}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-lg font-semibold tabular-nums', accent && 'text-accent')}>{value}</div>
    </div>
  )
}

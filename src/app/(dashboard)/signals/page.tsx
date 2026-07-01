'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { PageShell } from '@/components/ui/page-shell'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertOctagon, AlertTriangle, Info as InfoIcon, TrendingDown,
  Bell, RefreshCw, RotateCcw, ChevronDown,
} from 'lucide-react'
import {
  SIGNAL_DEFINITIONS, evaluateSignals, SEVERITY_ORDER,
  type FiredSignal, type SignalSeverity,
} from '@/lib/valuation-signals'
import type { ValuationMetrics } from '@/app/api/valuation/route'

const SEVERITY_STYLES: Record<SignalSeverity, { icon: typeof InfoIcon; classes: string; label: string }> = {
  critical:    { icon: AlertOctagon,  classes: 'border-red-500/40 bg-red-500/10 text-red-400',          label: 'Critical' },
  warning:     { icon: AlertTriangle, classes: 'border-amber-500/40 bg-amber-500/10 text-amber-400',    label: 'Warning' },
  info:        { icon: InfoIcon,      classes: 'border-sky-500/40 bg-sky-500/10 text-sky-400',          label: 'Info' },
  opportunity: { icon: TrendingDown,  classes: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400', label: 'Opportunity' },
}

const STORAGE_KEY = 'valuation-signal-thresholds'

export default function SignalsPage() {
  const { enriched, loading: portfolioLoading } = usePortfolio()
  const [metrics, setMetrics] = useState<Record<string, ValuationMetrics>>({})
  const [loading, setLoading] = useState(false)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [thresholds, setThresholds] = useState<Record<string, number>>({})
  const [openExplanation, setOpenExplanation] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  // Load persisted thresholds
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setThresholds(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds))
  }, [thresholds])

  const fetchMetrics = () => {
    if (enriched.length === 0) return
    setLoading(true)
    fetch('/api/valuation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: enriched.map((h) => h.ticker) }),
    })
      .then((r) => r.json())
      .then((data) => {
        setMetrics(data.metrics ?? {})
        setRefreshedAt(new Date())
      })
      .catch((e) => console.error('Valuation fetch failed:', e))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (enriched.length === 0) return
    fetchMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched.length])

  // Evaluate all signals across all tickers
  const fired = useMemo(() => {
    const all: FiredSignal[] = []
    for (const t of Object.keys(metrics)) {
      const m = metrics[t]
      if (!m) continue
      const triggered = evaluateSignals(m, thresholds)
      all.push(...triggered)
    }
    return all.sort((a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    )
  }, [metrics, thresholds])

  const counts = useMemo(() => {
    return {
      critical: fired.filter((f) => f.severity === 'critical').length,
      warning: fired.filter((f) => f.severity === 'warning').length,
      info: fired.filter((f) => f.severity === 'info').length,
      opportunity: fired.filter((f) => f.severity === 'opportunity').length,
    }
  }, [fired])

  if (!portfolioLoading && enriched.length === 0) {
    return (
      <PageShell screen="SIGNALS">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Add holdings to monitor valuation signals.
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  return (
    <PageShell
      screen="SIGNALS"
      statusRight={(
        <span className="flex items-center gap-3">
          {refreshedAt && <span>updated {refreshedAt.toLocaleTimeString()}</span>}
          <button onClick={fetchMetrics} disabled={loading} className="press flex items-center gap-1 hover:text-foreground disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> refresh
          </button>
        </span>
      )}
      footerHints={<span><span className="text-primary">▸</span> <span className="text-foreground">g o</span> holdings · <span className="text-foreground">g h</span> home</span>}
    >
    <div className="space-y-4">
      {/* Counts strip */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <CountChip severity="critical" count={counts.critical} />
        <CountChip severity="warning" count={counts.warning} />
        <CountChip severity="opportunity" count={counts.opportunity} />
        <CountChip severity="info" count={counts.info} />
      </div>

      {/* Fired signals */}
      {loading && fired.length === 0 ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : fired.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <InfoIcon className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-sm font-medium">No active signals</p>
            <p className="text-xs text-muted-foreground">
              None of your holdings are crossing the configured valuation, momentum or drawdown thresholds.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {fired.map((s, i) => {
            const isOpen = openExplanation === `${s.ticker}:${s.signalId}`
            return (
              <FiredSignalCard
                key={`${s.ticker}-${s.signalId}-${i}`}
                signal={s}
                open={isOpen}
                onToggle={() => setOpenExplanation(isOpen ? null : `${s.ticker}:${s.signalId}`)}
              />
            )
          })}
        </div>
      )}

      {/* Threshold customisation */}
      <Card>
        <CardHeader>
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="flex w-full items-start justify-between gap-3 text-left"
          >
            <div>
              <CardTitle className="text-base">Customize signal thresholds</CardTitle>
              <CardDescription>
                Override the default trigger levels per detector. Settings persist in your browser.
              </CardDescription>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform mt-1 ${showAll ? 'rotate-180' : ''}`} />
          </button>
        </CardHeader>
        {showAll && (
          <CardContent className="space-y-3">
            {SIGNAL_DEFINITIONS.map((def) => {
              const style = SEVERITY_STYLES[def.severity]
              const current = thresholds[def.id] ?? def.defaultThreshold
              return (
                <div key={def.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.classes}`}>
                        {style.label}
                      </span>
                      <span className="text-sm font-medium">{def.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{def.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] text-muted-foreground">
                      Trigger when {def.direction === 'gt' ? '>' : '<'}
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={current}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (!isNaN(v)) setThresholds({ ...thresholds, [def.id]: v })
                      }}
                      className="h-8 w-20 text-xs"
                    />
                    {current !== def.defaultThreshold && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...thresholds }
                          delete next[def.id]
                          setThresholds(next)
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        title={`Reset to default ${def.defaultThreshold}`}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        )}
      </Card>

      {/* Per-ticker raw metrics table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Raw metrics</CardTitle>
          <CardDescription>The numbers behind each signal — useful for manual review.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Ticker</th>
                  <th className="px-4 py-2 font-medium text-right">P/E</th>
                  <th className="px-4 py-2 font-medium text-right">Fwd P/E</th>
                  <th className="px-4 py-2 font-medium text-right">P/B</th>
                  <th className="px-4 py-2 font-medium text-right">Yield</th>
                  <th className="px-4 py-2 font-medium text-right">RSI(14)</th>
                  <th className="px-4 py-2 font-medium text-right">vs SMA200</th>
                  <th className="px-4 py-2 font-medium text-right">From high</th>
                  <th className="px-4 py-2 font-medium text-right">1y change</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((h) => {
                  const m = metrics[h.ticker]
                  if (!m) return (
                    <tr key={h.ticker} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-medium">{h.ticker}</td>
                      <td colSpan={8} className="px-4 py-2.5 text-xs text-muted-foreground text-right">
                        {loading ? 'Loading…' : 'No data'}
                      </td>
                    </tr>
                  )
                  const vsSma = m.sma200 && m.sma200 > 0 ? ((m.price - m.sma200) / m.sma200) * 100 : undefined
                  return (
                    <tr key={h.ticker} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-medium">{h.ticker}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{m.trailingPE ? `${m.trailingPE.toFixed(1)}x` : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{m.forwardPE ? `${m.forwardPE.toFixed(1)}x` : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{m.priceToBook ? `${m.priceToBook.toFixed(1)}x` : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{m.dividendYield ? `${(m.dividendYield * 100).toFixed(2)}%` : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{m.rsi14 ? m.rsi14.toFixed(0) : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{vsSma !== undefined ? `${vsSma >= 0 ? '+' : ''}${vsSma.toFixed(1)}%` : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-400">{m.drawdownFromHigh !== undefined ? `${(m.drawdownFromHigh * 100).toFixed(1)}%` : '—'}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${m.yearChange !== undefined && m.yearChange < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {m.yearChange !== undefined ? `${m.yearChange >= 0 ? '+' : ''}${(m.yearChange * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
    </PageShell>
  )
}

function CountChip({ severity, count }: { severity: SignalSeverity; count: number }) {
  const style = SEVERITY_STYLES[severity]
  const Icon = style.icon
  return (
    <div className={`rounded-md border px-3 py-2 ${style.classes}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <div className="text-[10px] uppercase tracking-wide">{style.label}</div>
      </div>
      <div className="text-2xl font-bold tabular-nums leading-tight">{count}</div>
    </div>
  )
}

function FiredSignalCard({
  signal, open, onToggle,
}: {
  signal: FiredSignal
  open: boolean
  onToggle: () => void
}) {
  const style = SEVERITY_STYLES[signal.severity]
  const Icon = style.icon
  return (
    <Card className={`border ${style.classes.split(' ').find((c) => c.startsWith('border-'))}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/30"
      >
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${style.classes.split(' ').find((c) => c.startsWith('text-'))}`} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold">{signal.ticker}</span>
            <span className="text-sm">{signal.label}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Current: <span className="font-medium tabular-nums">{signal.formatted}</span>
            {' · Threshold: '}<span className="tabular-nums">{signal.threshold}</span>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform mt-1 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 text-sm">
          <p className="text-foreground/90 leading-relaxed">{signal.rationale}</p>
        </div>
      )}
    </Card>
  )
}

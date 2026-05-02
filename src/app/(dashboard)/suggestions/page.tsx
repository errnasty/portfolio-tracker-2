'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Lightbulb, AlertOctagon, AlertTriangle, Info as InfoIcon, CheckCircle2 } from 'lucide-react'
import { SuggestionCard } from '@/components/suggestions/SuggestionCard'
import { PreferencesPanel } from '@/components/suggestions/PreferencesPanel'
import {
  generateSuggestions,
  DEFAULT_PREFERENCES,
  type SuggestionPreferences,
  type SuggestionSeverity,
} from '@/lib/suggestions'
import { buildPlannerEnriched, type PlannedPosition } from '@/lib/planner'
import type { TickerAnalytics } from '@/app/api/analytics/route'
import type { Currency, EnrichedHolding, PriceQuote } from '@/types'

const PREFS_STORAGE_KEY = 'suggestions-prefs-v1'
const PLANNER_STORAGE_KEY = 'planner-state-v1'

interface PersistedPlanner {
  positions: PlannedPosition[]
  totalValue: number
}

function loadPrefs(): SuggestionPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_PREFERENCES, ...parsed }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function loadPlanner(): PersistedPlanner | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(PLANNER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.positions)) return null
    return parsed
  } catch {
    return null
  }
}

export default function SuggestionsPage() {
  const {
    enriched: currentEnriched,
    settings,
    fxRates,
    prices: currentPrices,
    loading: portfolioLoading,
  } = usePortfolio()
  const baseCurrency: Currency = (settings?.base_currency as Currency) ?? 'USD'

  const [prefs, setPrefs] = useState<SuggestionPreferences>(DEFAULT_PREFERENCES)
  const [source, setSource] = useState<'current' | 'planned'>('current')
  const [hydrated, setHydrated] = useState(false)
  const [planner, setPlanner] = useState<PersistedPlanner | null>(null)
  const [analytics, setAnalytics] = useState<Record<string, TickerAnalytics>>({})
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [plannerPrices, setPlannerPrices] = useState<Record<string, PriceQuote>>({})
  const [loadingPrices, setLoadingPrices] = useState(false)

  // Hydrate from localStorage
  useEffect(() => {
    setPrefs(loadPrefs())
    setPlanner(loadPlanner())
    setHydrated(true)
  }, [])

  // Persist prefs
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
  }, [prefs, hydrated])

  // Build the enriched portfolio for the current source
  const mergedPrices = useMemo(
    () => ({ ...plannerPrices, ...currentPrices }),
    [plannerPrices, currentPrices],
  )

  const plannerEnriched = useMemo(() => {
    if (!planner || !fxRates) return [] as EnrichedHolding[]
    return buildPlannerEnriched(planner.positions, planner.totalValue, mergedPrices, fxRates, baseCurrency)
  }, [planner, mergedPrices, fxRates, baseCurrency])

  const sourceEnriched = source === 'current' ? currentEnriched : plannerEnriched

  // Tickers we need analytics + prices for
  const allTickers = useMemo(() => {
    const set = new Set<string>()
    for (const h of currentEnriched) set.add(h.ticker)
    for (const p of planner?.positions ?? []) {
      if (p.ticker.trim()) set.add(p.ticker.trim().toUpperCase())
    }
    return Array.from(set)
  }, [currentEnriched, planner])

  const plannerOnlyTickers = useMemo(() => {
    const set = new Set(currentEnriched.map((h) => h.ticker))
    return (planner?.positions ?? [])
      .map((p) => p.ticker.trim().toUpperCase())
      .filter((t) => t && !set.has(t) && !plannerPrices[t])
  }, [currentEnriched, planner, plannerPrices])

  // Fetch missing prices for planner-only tickers
  useEffect(() => {
    if (plannerOnlyTickers.length === 0) return
    setLoadingPrices(true)
    fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: plannerOnlyTickers }),
    })
      .then((r) => r.json())
      .then((data) => setPlannerPrices((prev) => ({ ...prev, ...(data.quotes ?? {}) })))
      .catch((e) => console.error('Suggestions prices fetch failed:', e))
      .finally(() => setLoadingPrices(false))
  }, [plannerOnlyTickers.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch analytics for any uncovered tickers
  useEffect(() => {
    if (allTickers.length === 0) return
    const missing = allTickers.filter((t) => !analytics[t])
    if (missing.length === 0) return
    setLoadingAnalytics(true)
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: missing }),
    })
      .then((r) => r.json())
      .then((data) => setAnalytics((prev) => ({ ...prev, ...(data.analytics ?? {}) })))
      .catch((e) => console.error('Suggestions analytics fetch failed:', e))
      .finally(() => setLoadingAnalytics(false))
  }, [allTickers.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Generate suggestions
  const result = useMemo(
    () => generateSuggestions(sourceEnriched, analytics, baseCurrency, prefs),
    [sourceEnriched, analytics, baseCurrency, prefs],
  )

  const hasPlanner = (planner?.positions?.length ?? 0) > 0 && (planner?.totalValue ?? 0) > 0
  const hasCurrent = currentEnriched.length > 0
  const initialLoading = portfolioLoading || (loadingAnalytics && Object.keys(analytics).length === 0)

  // If user lands on /suggestions but has no current portfolio, default to planned
  useEffect(() => {
    if (!hydrated) return
    if (source === 'current' && !hasCurrent && hasPlanner) setSource('planned')
  }, [hydrated, hasCurrent, hasPlanner, source])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Suggestions</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Detailed, dynamic recommendations for improving your portfolio.
        </p>
      </div>

      <PreferencesPanel
        prefs={prefs}
        onChange={setPrefs}
        source={source}
        onSourceChange={setSource}
        hasPlanner={hasPlanner}
        hasCurrent={hasCurrent}
      />

      {sourceEnriched.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {source === 'current'
              ? 'Add holdings to see suggestions for your real portfolio.'
              : 'Build a portfolio in the Planner page to see suggestions for it.'}
          </CardContent>
        </Card>
      ) : initialLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <ScoreCard result={result} source={source} />

          {(loadingPrices || loadingAnalytics) && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              {loadingPrices ? 'Fetching prices…' : 'Refreshing ETF composition data…'}
            </div>
          )}

          <SuggestionsList result={result} />
        </>
      )}
    </div>
  )
}

function ScoreCard({
  result,
  source,
}: {
  result: ReturnType<typeof generateSuggestions>
  source: 'current' | 'planned'
}) {
  const scoreColor =
    result.score >= 85 ? 'text-emerald-400' :
    result.score >= 70 ? 'text-sky-400' :
    result.score >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Lightbulb className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">
              Portfolio score — {source === 'current' ? 'Current' : 'Planned'}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Heuristic 0–100 score based on detected issues. Lower the issues, raise the score.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid items-end gap-4 sm:grid-cols-[auto_1fr_auto]">
          <div>
            <div className={`text-5xl font-bold tabular-nums ${scoreColor}`}>
              {Math.round(result.score)}
            </div>
            <div className={`text-sm font-medium ${scoreColor}`}>{result.scoreLabel}</div>
          </div>

          {/* Score bar */}
          <div className="space-y-1">
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  result.score >= 85 ? 'bg-emerald-500' :
                  result.score >= 70 ? 'bg-sky-500' :
                  result.score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${result.score}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Poor</span><span>Fair</span><span>Good</span><span>Excellent</span>
            </div>
          </div>

          {/* Counts */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3 text-center">
            <CountChip icon={AlertOctagon} label="Critical" count={result.counts.critical} color="text-red-400 bg-red-500/10" />
            <CountChip icon={AlertTriangle} label="Warning" count={result.counts.warning} color="text-amber-400 bg-amber-500/10" />
            <CountChip icon={InfoIcon} label="Info" count={result.counts.info} color="text-sky-400 bg-sky-500/10" />
            <CountChip icon={CheckCircle2} label="Healthy" count={result.counts.positive} color="text-emerald-400 bg-emerald-500/10" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CountChip({
  icon: Icon, label, count, color,
}: {
  icon: typeof InfoIcon
  label: string
  count: number
  color: string
}) {
  return (
    <div className={`rounded-md px-2 py-1.5 ${color}`}>
      <Icon className="mx-auto h-4 w-4" />
      <div className="mt-0.5 text-lg font-semibold tabular-nums leading-none">{count}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
    </div>
  )
}

function SuggestionsList({ result }: { result: ReturnType<typeof generateSuggestions> }) {
  if (result.suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
          <p className="text-sm font-medium">No suggestions in your selected focus areas</p>
          <p className="text-xs text-muted-foreground">
            Either everything looks healthy here, or try selecting more focus areas above.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Group by severity for the headers
  const grouped: Record<SuggestionSeverity, typeof result.suggestions> = {
    critical: [], warning: [], info: [], positive: [],
  }
  for (const s of result.suggestions) grouped[s.severity].push(s)

  const sectionLabels: Record<SuggestionSeverity, string> = {
    critical: 'Critical — address these first',
    warning: 'Warnings — worth a review',
    info: 'Info & opportunities',
    positive: 'What\'s working well',
  }

  const order: SuggestionSeverity[] = ['critical', 'warning', 'info', 'positive']

  return (
    <div className="space-y-6">
      {order.map((sev) => {
        const items = grouped[sev]
        if (items.length === 0) return null
        return (
          <div key={sev} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {sectionLabels[sev]} <span className="text-muted-foreground/60">({items.length})</span>
            </h2>
            <div className="space-y-2">
              {items.map((s) => <SuggestionCard key={s.id} suggestion={s} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

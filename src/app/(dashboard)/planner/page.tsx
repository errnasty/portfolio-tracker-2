'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell } from '@/components/ui/page-shell'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BreakdownChart } from '@/components/analytics/BreakdownChart'
import { ConcentrationCard } from '@/components/analytics/ConcentrationCard'
import { LookThroughStocksCard } from '@/components/analytics/LookThroughStocksCard'
import { PlannerEditor } from '@/components/planner/PlannerEditor'
import { ComparisonBars, ConcentrationComparison } from '@/components/planner/PlannerComparison'
import { PlannerBacktest } from '@/components/planner/PlannerBacktest'
import { FiForecastTab } from '@/components/planner/FiForecastTab'
import {
  geographicBreakdown,
  sectorBreakdown,
  currencyBreakdown,
  assetTypeBreakdown,
  concentrationMetrics,
  lookThroughStocks,
} from '@/lib/analytics'
import {
  buildPlannerEnriched,
  compareBreakdowns,
  compareConcentration,
  defaultPlannerTotalValue,
} from '@/lib/planner'
import type { PlannedPosition } from '@/lib/planner'
import type { TickerAnalytics } from '@/app/api/analytics/route'
import type { Currency, PriceQuote } from '@/types'
import { formatCurrency } from '@/lib/utils'

const STORAGE_KEY = 'planner-state-v1'

interface PersistedState {
  positions: PlannedPosition[]
  totalValue: number
}

function loadPersisted(): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.positions)) return null
    return parsed
  } catch {
    return null
  }
}

export default function PlannerPage() {
  const {
    enriched: currentEnriched,
    stats,
    settings,
    fxRates,
    prices: currentPrices,
    loading: portfolioLoading,
    netWorthBase,
  } = usePortfolio()
  const { statsForMonth } = useSpending()
  const baseCurrency: Currency = (settings?.base_currency as Currency) ?? 'USD'

  const [positions, setPositions] = useState<PlannedPosition[]>([])
  const [totalValue, setTotalValue] = useState(0)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage once on the client; otherwise default total to
  // the existing portfolio value.
  useEffect(() => {
    const persisted = loadPersisted()
    if (persisted) {
      setPositions(persisted.positions)
      setTotalValue(persisted.totalValue)
    }
    setHydrated(true)
  }, [])

  // Once we know the existing portfolio value and the user hasn't set a total
  // yet, seed it.
  useEffect(() => {
    if (!hydrated) return
    if (totalValue > 0) return
    if (portfolioLoading) return
    setTotalValue(defaultPlannerTotalValue(stats?.totalValue ?? 0, baseCurrency))
  }, [hydrated, portfolioLoading, stats?.totalValue, baseCurrency, totalValue])

  // Persist
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ positions, totalValue }))
  }, [positions, totalValue, hydrated])

  // ── Fetch prices + analytics for any tickers in the planner that aren't ──
  // ── already loaded from the user's real portfolio.                       ──
  const [plannerPrices, setPlannerPrices] = useState<Record<string, PriceQuote>>({})
  const [analytics, setAnalytics] = useState<Record<string, TickerAnalytics>>({})
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const allTickers = useMemo(() => {
    const set = new Set<string>()
    for (const h of currentEnriched) set.add(h.ticker)
    for (const p of positions) {
      if (p.ticker.trim()) set.add(p.ticker.trim().toUpperCase())
    }
    return Array.from(set)
  }, [currentEnriched, positions])

  const plannerTickers = useMemo(
    () => positions.map((p) => p.ticker.trim().toUpperCase()).filter(Boolean),
    [positions],
  )

  // Debounced fetch on planner ticker changes.
  useEffect(() => {
    if (plannerTickers.length === 0) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const missingPriceTickers = plannerTickers.filter(
        (t) => !currentPrices[t] && !plannerPrices[t],
      )
      if (missingPriceTickers.length > 0) {
        setLoadingPrices(true)
        fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers: missingPriceTickers }),
        })
          .then((r) => r.json())
          .then((data) => {
            setPlannerPrices((prev) => ({ ...prev, ...(data.quotes ?? {}) }))
          })
          .catch((e) => console.error('Planner prices fetch failed:', e))
          .finally(() => setLoadingPrices(false))
      }
    }, 600)
    return () => clearTimeout(debounceRef.current)
  }, [plannerTickers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Analytics fetch — covers both current + planner tickers so the comparison
  // breakdowns share consistent data. Only fetches tickers we don't yet have.
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
      .catch((e) => console.error('Planner analytics fetch failed:', e))
      .finally(() => setLoadingAnalytics(false))
  }, [allTickers]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build planner-side enriched holdings ─────────────────────────────────
  const mergedPrices = useMemo(
    () => ({ ...plannerPrices, ...currentPrices }),
    [plannerPrices, currentPrices],
  )

  const plannerEnriched = useMemo(
    () => buildPlannerEnriched(positions, totalValue, mergedPrices, fxRates, baseCurrency),
    [positions, totalValue, mergedPrices, fxRates, baseCurrency],
  )

  const handleCopyFromCurrent = () => {
    if (currentEnriched.length === 0) return
    const totalCurrentValue = currentEnriched.reduce((s, h) => s + h.currentValueBase, 0)
    if (totalCurrentValue <= 0) return
    const newPositions: PlannedPosition[] = currentEnriched.map((h) => ({
      id: Math.random().toString(36).slice(2, 10),
      ticker: h.ticker,
      name: h.name ?? '',
      pct: parseFloat(((h.currentValueBase / totalCurrentValue) * 100).toFixed(2)),
    }))
    setPositions(newPositions)
    if (totalValue <= 0) setTotalValue(Math.round(totalCurrentValue))
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const plannerGeo = useMemo(() => geographicBreakdown(plannerEnriched, analytics), [plannerEnriched, analytics])
  const plannerSectors = useMemo(() => sectorBreakdown(plannerEnriched, analytics), [plannerEnriched, analytics])
  const plannerCurrencies = useMemo(() => currencyBreakdown(plannerEnriched, analytics), [plannerEnriched, analytics])
  const plannerAssets = useMemo(() => assetTypeBreakdown(plannerEnriched, analytics), [plannerEnriched, analytics])
  const plannerConcentration = useMemo(() => concentrationMetrics(plannerEnriched), [plannerEnriched])
  const plannerLookThrough = useMemo(() => lookThroughStocks(plannerEnriched, analytics), [plannerEnriched, analytics])

  const currentGeo = useMemo(() => geographicBreakdown(currentEnriched, analytics), [currentEnriched, analytics])
  const currentSectors = useMemo(() => sectorBreakdown(currentEnriched, analytics), [currentEnriched, analytics])
  const currentCurrencies = useMemo(() => currencyBreakdown(currentEnriched, analytics), [currentEnriched, analytics])
  const currentAssets = useMemo(() => assetTypeBreakdown(currentEnriched, analytics), [currentEnriched, analytics])
  const currentConcentration = useMemo(() => concentrationMetrics(currentEnriched), [currentEnriched])

  const cmpGeo = useMemo(() => compareBreakdowns(currentGeo, plannerGeo), [currentGeo, plannerGeo])
  const cmpSectors = useMemo(() => compareBreakdowns(currentSectors, plannerSectors), [currentSectors, plannerSectors])
  const cmpCurrencies = useMemo(() => compareBreakdowns(currentCurrencies, plannerCurrencies), [currentCurrencies, plannerCurrencies])
  const cmpAssets = useMemo(() => compareBreakdowns(currentAssets, plannerAssets), [currentAssets, plannerAssets])
  const cmpConcentration = useMemo(
    () => compareConcentration(currentConcentration, plannerConcentration),
    [currentConcentration, plannerConcentration],
  )

  const hasPlannerData = plannerEnriched.length > 0 && totalValue > 0
  const missingPriceCount = plannerTickers.filter((t) => !mergedPrices[t]).length
  const totalPct = positions.reduce((s, p) => s + (p.pct || 0), 0)
  const currentTotal = stats?.totalValue ?? 0
  const vsCurrent = totalValue - currentTotal

  const statusRight = (
    <span className="flex items-center gap-4">
      <span>positions <span className="text-foreground">{positions.length}</span></span>
      <span>alloc <span className={Math.abs(totalPct - 100) > 0.05 ? 'text-warn' : 'text-foreground'}>{totalPct.toFixed(0)}%</span></span>
    </span>
  )

  const footerHints = (
    <>
      <span><span className="text-[var(--accent)]">▸</span> <span className="text-foreground">g o</span> holdings · <span className="text-foreground">g r</span> rebalancer · <span className="text-foreground">g h</span> home</span>
    </>
  )

  return (
    <PageShell screen="Plan" title="Planner" statusRight={statusRight} footerHints={footerHints}>
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            vtName="hero-planned"
            label={`Planned portfolio · ${baseCurrency}`}
            value={totalValue}
            format={(n) => formatCurrency(n, baseCurrency)}
            delta={currentTotal > 0 ? [
              <span key="d"><span className="text-muted-foreground">vs current </span><span className={vsCurrent >= 0 ? 'text-up' : 'text-down'}>{vsCurrent >= 0 ? '+' : ''}{formatCurrency(vsCurrent, baseCurrency)}</span></span>,
            ] : undefined}
          />
          <HeroMetric
            label="Positions"
            value={positions.length}
            format={(n) => `${Math.round(n)}`}
            sub="planned holdings"
          />
          <HeroMetric
            label="Allocation"
            value={totalPct}
            format={(n) => `${n.toFixed(0)}%`}
            sub={Math.abs(totalPct - 100) > 0.05 ? 'not normalized' : 'of 100%'}
          />
        </HeroBand>
      </div>

      <PlannerEditor
        positions={positions}
        totalValue={totalValue}
        baseCurrency={baseCurrency}
        onPositionsChange={setPositions}
        onTotalValueChange={setTotalValue}
        onCopyFromCurrent={handleCopyFromCurrent}
        canCopyFromCurrent={currentEnriched.length > 0}
      />

      <Tabs defaultValue="fi" className="w-full">
        <TabsList>
          <TabsTrigger value="fi">Financial Independence</TabsTrigger>
          <TabsTrigger value="composition">Composition</TabsTrigger>
          <TabsTrigger value="comparison">vs Current</TabsTrigger>
          <TabsTrigger value="lookthrough">Look-through</TabsTrigger>
          <TabsTrigger value="backtest">Backtest</TabsTrigger>
        </TabsList>

        <TabsContent value="fi" className="space-y-4 pt-4">
          <FiForecastTab
            netWorthBase={netWorthBase}
            baseCurrency={baseCurrency}
            enriched={currentEnriched}
            statsForMonth={statsForMonth}
          />
        </TabsContent>

        <TabsContent value="composition" className="space-y-4 pt-4">
          {!hasPlannerData ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Add at least one position with a non-zero allocation to see analytics.
              </CardContent>
            </Card>
          ) : (
            <>
              {(loadingPrices || loadingAnalytics) && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  {loadingPrices ? 'Fetching prices…' : 'Fetching ETF composition (may take a moment)…'}
                </div>
              )}
              {missingPriceCount > 0 && !loadingPrices && (
                <div className="rounded-md border border-amber-400/30 bg-warn/5 px-3 py-2 text-xs text-warn">
                  {missingPriceCount} ticker{missingPriceCount === 1 ? '' : 's'} missing price data — implied share counts unavailable for those.
                </div>
              )}
              {Math.abs(totalPct - 100) > 0.05 && (
                <div className="rounded-md border border-amber-400/30 bg-warn/5 px-3 py-2 text-xs text-warn">
                  Allocations sum to {totalPct.toFixed(2)}% — analytics treat the planned weights as-is.
                  Click <em>Normalize</em> to scale them to 100%.
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Stats for the planned portfolio
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Planned total</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {formatCurrency(totalValue, baseCurrency)}
                  </div>
                </div>
              </div>

              <ConcentrationCard metrics={plannerConcentration} totalHoldings={plannerEnriched.length} />

              {loadingAnalytics && Object.keys(analytics).length === 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Skeleton className="h-80" />
                  <Skeleton className="h-80" />
                  <Skeleton className="h-80" />
                  <Skeleton className="h-80" />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <BreakdownChart
                    title="Geographic Allocation (look-through)"
                    description="ETFs decomposed by underlying countries"
                    data={plannerGeo}
                    baseCurrency={baseCurrency}
                  />
                  <BreakdownChart
                    title="Sector Allocation (look-through)"
                    description="ETFs decomposed by sector weightings"
                    data={plannerSectors}
                    baseCurrency={baseCurrency}
                  />
                  <BreakdownChart
                    title="Currency Exposure (look-through)"
                    description="Underlying currency derived from country mix"
                    data={plannerCurrencies}
                    baseCurrency={baseCurrency}
                  />
                  <BreakdownChart
                    title="Asset Type"
                    description="Stocks vs ETFs vs other instruments"
                    data={plannerAssets}
                    baseCurrency={baseCurrency}
                  />
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4 pt-4">
          {!hasPlannerData || currentEnriched.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                You don&apos;t have any real holdings yet — add some on the Holdings page to enable comparison.
              </CardContent>
            </Card>
          ) : (
            <>
              <ComparisonSummary
                currentTotal={stats?.totalValue ?? 0}
                plannedTotal={totalValue}
                baseCurrency={baseCurrency}
              />
              <ConcentrationComparison rows={cmpConcentration} />
              <div className="grid gap-4 md:grid-cols-2">
                <ComparisonBars
                  title="Geographic — Current vs Planned"
                  description="Look-through country exposure shifts"
                  rows={cmpGeo}
                  baseCurrency={baseCurrency}
                />
                <ComparisonBars
                  title="Sector — Current vs Planned"
                  description="Look-through sector exposure shifts"
                  rows={cmpSectors}
                  baseCurrency={baseCurrency}
                />
                <ComparisonBars
                  title="Currency — Current vs Planned"
                  description="Underlying-currency exposure shifts"
                  rows={cmpCurrencies}
                  baseCurrency={baseCurrency}
                />
                <ComparisonBars
                  title="Asset Type — Current vs Planned"
                  rows={cmpAssets}
                  baseCurrency={baseCurrency}
                />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="backtest" className="space-y-4 pt-4">
          {!hasPlannerData ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Add at least one position with a non-zero allocation to see analytics.
              </CardContent>
            </Card>
          ) : (
            <PlannerBacktest
              positions={positions}
              currentEnriched={currentEnriched}
              startingValue={totalValue > 0 ? totalValue : undefined}
              baseCurrency={baseCurrency}
            />
          )}
        </TabsContent>

        <TabsContent value="lookthrough" className="space-y-4 pt-4">
          {!hasPlannerData ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Add at least one position with a non-zero allocation to see analytics.
              </CardContent>
            </Card>
          ) : (
            <>
              <LookThroughStocksCard
                stocks={plannerLookThrough.stocks}
                coveragePct={plannerLookThrough.coveragePct}
                baseCurrency={baseCurrency}
              />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Planned Positions</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Direct rows of the planner with implied share counts at current prices
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Ticker</th>
                          <th className="px-4 py-2 font-medium">Type</th>
                          <th className="px-4 py-2 font-medium text-right">Allocation</th>
                          <th className="px-4 py-2 font-medium text-right">Value</th>
                          <th className="px-4 py-2 font-medium text-right">Implied shares</th>
                          <th className="px-4 py-2 font-medium text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plannerEnriched.map((h) => {
                          const a = analytics[h.ticker]
                          const type = a?.quoteType === 'EQUITY' ? 'Stock'
                            : a?.quoteType === 'ETF' ? 'ETF'
                              : a?.quoteType === 'MUTUALFUND' ? 'Fund'
                                : '—'
                          return (
                            <tr key={h.id} className="border-b border-border/50 last:border-0">
                              <td className="px-4 py-2.5">
                                <div className="font-medium">{h.ticker}</div>
                                <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                                  {h.name ?? a?.longName ?? ''}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">{type}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">{h.allocationPct.toFixed(2)}%</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {formatCurrency(h.currentValueBase, baseCurrency)}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                                {h.currentPrice > 0 ? h.shares.toFixed(4) : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                                {h.currentPrice > 0
                                  ? formatCurrency(h.currentPrice, h.priceCurrency)
                                  : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </PageShell>
  )
}

function ComparisonSummary({
  currentTotal,
  plannedTotal,
  baseCurrency,
}: {
  currentTotal: number
  plannedTotal: number
  baseCurrency: Currency
}) {
  return (
    <Card>
      <CardContent className="grid gap-4 py-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted-foreground">Current portfolio</div>
          <div className="text-xl font-semibold tabular-nums">
            {formatCurrency(currentTotal, baseCurrency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Planned portfolio</div>
          <div className="text-xl font-semibold tabular-nums">
            {formatCurrency(plannedTotal, baseCurrency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Difference</div>
          <div className="text-xl font-semibold tabular-nums">
            {plannedTotal - currentTotal >= 0 ? '+' : ''}
            {formatCurrency(plannedTotal - currentTotal, baseCurrency)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

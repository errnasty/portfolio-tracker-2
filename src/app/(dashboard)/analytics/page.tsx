'use client'

import { useEffect, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BreakdownChart } from '@/components/analytics/BreakdownChart'
import { ConcentrationCard } from '@/components/analytics/ConcentrationCard'
import {
  geographicBreakdown,
  sectorBreakdown,
  currencyBreakdown,
  assetTypeBreakdown,
  concentrationMetrics,
  topHoldingsList,
} from '@/lib/analytics'
import type { TickerAnalytics } from '@/app/api/analytics/route'
import type { Currency } from '@/types'
import { formatCurrency, formatPercent, gainLossColor } from '@/lib/utils'

export default function AnalyticsPage() {
  const { enriched, stats, settings, loading: portfolioLoading } = usePortfolio()
  const [analytics, setAnalytics] = useState<Record<string, TickerAnalytics>>({})
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)

  const baseCurrency: Currency = (settings?.base_currency as Currency) ?? 'USD'

  useEffect(() => {
    if (enriched.length === 0) return
    const tickers = enriched.map((h) => h.ticker)
    setLoadingAnalytics(true)
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    })
      .then((r) => r.json())
      .then((data) => setAnalytics(data.analytics ?? {}))
      .catch((err) => console.error('Analytics fetch failed:', err))
      .finally(() => setLoadingAnalytics(false))
  }, [enriched.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = portfolioLoading || loadingAnalytics

  if (!portfolioLoading && enriched.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Add some holdings to see portfolio analytics.
          </CardContent>
        </Card>
      </div>
    )
  }

  const geo = geographicBreakdown(enriched, analytics)
  const sectors = sectorBreakdown(enriched, analytics)
  const currencies = currencyBreakdown(enriched)
  const assetTypes = assetTypeBreakdown(enriched, analytics)
  const concentration = concentrationMetrics(enriched)
  const topHoldings = topHoldingsList(enriched, 10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Deep dive into your portfolio composition and risk exposure.
          </p>
        </div>
        {stats && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total value</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatCurrency(stats.totalValue, baseCurrency)}
            </div>
          </div>
        )}
      </div>

      {loading && Object.keys(analytics).length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : (
        <>
          <ConcentrationCard
            metrics={concentration}
            totalHoldings={enriched.length}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <BreakdownChart
              title="Geographic Allocation"
              description="By country/region — ETFs use category, stocks use country of origin"
              data={geo}
              baseCurrency={baseCurrency}
            />
            <BreakdownChart
              title="Sector Allocation"
              description="ETF sector weightings are distributed proportionally"
              data={sectors}
              baseCurrency={baseCurrency}
            />
            <BreakdownChart
              title="Currency Exposure"
              description="By trading currency of each holding"
              data={currencies}
              baseCurrency={baseCurrency}
            />
            <BreakdownChart
              title="Asset Type"
              description="Stocks vs ETFs vs other instruments"
              data={assetTypes}
              baseCurrency={baseCurrency}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 10 Positions</CardTitle>
              <p className="text-xs text-muted-foreground">
                Largest holdings by current market value
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Ticker</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Sector / Category</th>
                      <th className="pb-2 font-medium text-right">Value</th>
                      <th className="pb-2 font-medium text-right">Allocation</th>
                      <th className="pb-2 font-medium text-right">Gain/Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topHoldings.map((h) => {
                      const a = analytics[h.ticker]
                      const type = a?.quoteType === 'EQUITY'
                        ? 'Stock'
                        : a?.quoteType === 'ETF' ? 'ETF'
                          : a?.quoteType === 'MUTUALFUND' ? 'Fund'
                            : '—'
                      const sectorOrCat = a?.sector ?? a?.category ?? '—'
                      return (
                        <tr key={h.id} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5">
                            <div className="font-medium">{h.ticker}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {h.name ?? a?.longName ?? ''}
                            </div>
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground">{type}</td>
                          <td className="py-2.5 text-xs text-muted-foreground">{sectorOrCat}</td>
                          <td className="py-2.5 text-right tabular-nums">
                            {formatCurrency(h.currentValueBase, baseCurrency)}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">
                            {h.allocationPct.toFixed(1)}%
                          </td>
                          <td className={`py-2.5 text-right tabular-nums ${gainLossColor(h.gainLoss)}`}>
                            {formatPercent(h.gainLossPct)}
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
    </div>
  )
}

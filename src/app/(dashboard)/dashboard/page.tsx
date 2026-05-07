'use client'

import { usePortfolio } from '@/context/PortfolioContext'
import { formatCurrency, formatPercent, gainLossColor } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, DollarSign, BarChart2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AllocationChart } from '@/components/dashboard/AllocationChart'
import { HoldingsSummaryTable } from '@/components/dashboard/HoldingsSummaryTable'
import { RebalanceBandsWidget } from '@/components/dashboard/RebalanceBandsWidget'
import { PortfolioSummaryWidget } from '@/components/dashboard/PortfolioSummaryWidget'
import { CashBalancesCard } from '@/components/dashboard/CashBalancesCard'
import { deleteWithUndo } from '@/lib/toast-undo'
import type { Currency } from '@/types'

function StatCard({
  title, value, sub, subColor, icon: Icon, loading,
}: {
  title: string; value: string; sub: string; subColor: string; icon: React.ElementType; loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : (
          <>
            <div className="text-lg md:text-2xl font-bold tabular-nums truncate">{value}</div>
            <p className={`text-xs ${subColor} truncate`}>{sub}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const {
    stats, enriched, loading, refreshPrices, settings, targets,
    cashBalances, totalCashBase, cashBalancesError, fxRates,
    upsertCashBalance, deleteCashBalance,
  } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-sm md:text-base text-muted-foreground">Your portfolio overview</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshPrices} disabled={loading} className="self-start sm:self-auto">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh prices
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Value"
          value={stats ? formatCurrency(stats.totalValue, base) : '—'}
          sub={stats
            ? stats.cashValue > 0
              ? `${formatCurrency(stats.holdingsValue, base)} held + ${formatCurrency(stats.cashValue, base)} cash`
              : `Cost: ${formatCurrency(stats.totalCost, base)}`
            : 'No holdings yet'}
          subColor="text-muted-foreground"
          icon={DollarSign}
          loading={loading}
        />
        <StatCard
          title="Total Return"
          value={stats ? formatCurrency(stats.totalGainLoss, base) : '—'}
          sub={stats ? formatPercent(stats.totalGainLossPct) : ''}
          subColor={stats ? gainLossColor(stats.totalGainLoss) : ''}
          icon={stats && stats.totalGainLoss >= 0 ? TrendingUp : TrendingDown}
          loading={loading}
        />
        <StatCard
          title="Day Change"
          value={stats ? formatCurrency(stats.totalDayChange, base) : '—'}
          sub={stats ? formatPercent(stats.totalDayChangePct) : ''}
          subColor={stats ? gainLossColor(stats.totalDayChange) : ''}
          icon={BarChart2}
          loading={loading}
        />
        <StatCard
          title="Positions"
          value={enriched.length.toString()}
          sub="across all markets"
          subColor="text-muted-foreground"
          icon={BarChart2}
          loading={loading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AllocationChart enriched={enriched} loading={loading} cashValue={totalCashBase} />
        </div>
        <div className="lg:col-span-2">
          <HoldingsSummaryTable enriched={enriched} loading={loading} base={base} />
        </div>
      </div>

      {!loading && (
        <CashBalancesCard
          cashBalances={cashBalances}
          totalCashBase={totalCashBase}
          base={base}
          fxRates={fxRates}
          loadError={cashBalancesError}
          onUpsert={upsertCashBalance}
          onDelete={async (id) => {
            const row = cashBalances.find((c) => c.id === id)
            if (!row) return
            await deleteWithUndo({
              description: `Deleted ${row.currency} cash`,
              remove: () => deleteCashBalance(id),
              restore: () => upsertCashBalance(row.currency, Number(row.balance), row.notes),
            })
          }}
        />
      )}

      {!loading && enriched.length > 0 && (
        <PortfolioSummaryWidget enriched={enriched} stats={stats} baseCurrency={base} />
      )}

      {!loading && enriched.length > 0 && (
        <RebalanceBandsWidget enriched={enriched} targets={targets} base={base} />
      )}
    </div>
  )
}

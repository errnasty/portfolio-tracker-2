'use client'

import Link from 'next/link'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { formatCurrency, formatPercent, gainLossColor } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Wallet, TrendingUp, TrendingDown, PiggyBank, ArrowDownCircle, ArrowRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AllocationChart } from '@/components/dashboard/AllocationChart'
import { HoldingsSummaryTable } from '@/components/dashboard/HoldingsSummaryTable'
import { RebalanceBandsWidget } from '@/components/dashboard/RebalanceBandsWidget'
import { PortfolioSummaryWidget } from '@/components/dashboard/PortfolioSummaryWidget'
import { AccountsCard } from '@/components/spending/AccountsCard'
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
    accounts, totalCashBase, accountsNetBase, netWorthBase, accountsError, fxRates,
    addAccount, updateAccount, deleteAccount,
  } = usePortfolio()
  const { spendingStats, bankTransactions, categoryById, loading: spendingLoading } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const investments = stats?.totalValue ?? 0
  const recent = bankTransactions.slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Home</h1>
          <p className="text-sm md:text-base text-muted-foreground">Your money at a glance</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshPrices} disabled={loading} className="self-start sm:self-auto">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh prices
        </Button>
      </div>

      {/* Net worth + cash flow */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Net Worth"
          value={formatCurrency(netWorthBase, base)}
          sub={`${formatCurrency(accountsNetBase, base)} accounts + ${formatCurrency(stats?.holdingsValue ?? 0, base)} invested`}
          subColor="text-muted-foreground"
          icon={PiggyBank}
          loading={loading}
        />
        <StatCard
          title="Investments"
          value={formatCurrency(investments, base)}
          sub={stats ? `${formatPercent(stats.totalGainLossPct)} all-time` : 'No holdings yet'}
          subColor={stats ? gainLossColor(stats.totalGainLoss) : 'text-muted-foreground'}
          icon={stats && stats.totalGainLoss >= 0 ? TrendingUp : TrendingDown}
          loading={loading}
        />
        <StatCard
          title="Spent This Month"
          value={formatCurrency(spendingStats.expense, base)}
          sub={`${spendingStats.byCategory.length} categor${spendingStats.byCategory.length === 1 ? 'y' : 'ies'}`}
          subColor="text-muted-foreground"
          icon={ArrowDownCircle}
          loading={spendingLoading}
        />
        <StatCard
          title="Net This Month"
          value={formatCurrency(spendingStats.net, base)}
          sub={`${formatCurrency(spendingStats.income, base)} in`}
          subColor={gainLossColor(spendingStats.net)}
          icon={Wallet}
          loading={spendingLoading}
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

      {/* Recent spending */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4" /> Recent spending
              </CardTitle>
              <CardDescription>Latest transactions across your accounts</CardDescription>
            </div>
            <Link href="/spending">
              <Button variant="outline" size="sm">
                View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No spending tracked yet. Add a transaction or import your POSB statement from{' '}
              <Link href="/import" className="underline">Import</Link>.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((t) => {
                const cat = t.category_id ? categoryById[t.category_id] : null
                const isIncome = Number(t.amount) >= 0
                return (
                  <div key={t.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{t.description}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {t.date}{cat ? ` · ${cat.name}` : ' · Uncategorized'}
                      </div>
                    </div>
                    <div className={`text-sm font-medium tabular-nums shrink-0 ${isIncome ? 'text-emerald-400' : ''}`}>
                      {isIncome ? '+' : ''}{formatCurrency(Number(t.amount), t.currency)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && (
        <AccountsCard
          accounts={accounts}
          netBase={accountsNetBase}
          base={base}
          fxRates={fxRates}
          loadError={accountsError}
          onAdd={addAccount}
          onUpdate={updateAccount}
          onDelete={deleteAccount}
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

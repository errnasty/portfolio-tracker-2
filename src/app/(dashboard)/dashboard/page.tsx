'use client'

import Link from 'next/link'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { formatCurrency, formatPercent, gainLossColor } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Wallet, TrendingUp, TrendingDown, PiggyBank, ArrowDownCircle, ArrowRight,
  RefreshCw, Repeat, Scissors, Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AllocationChart } from '@/components/dashboard/AllocationChart'
import { HoldingsSummaryTable } from '@/components/dashboard/HoldingsSummaryTable'
import { RebalanceBandsWidget } from '@/components/dashboard/RebalanceBandsWidget'
import { PortfolioSummaryWidget } from '@/components/dashboard/PortfolioSummaryWidget'
import { AccountsCard } from '@/components/spending/AccountsCard'
import type { Currency } from '@/types'

const CAT_COLORS = ['#f97316', '#0ea5e9', '#ec4899', '#eab308', '#8b5cf6', '#22c55e', '#14b8a6', '#94a3b8']

function StatCard({
  title, value, sub, subColor, icon: Icon, loading, href,
}: {
  title: string; value: string; sub: string; subColor: string; icon: React.ElementType; loading: boolean; href?: string
}) {
  const body = (
    <Card className={href ? 'transition-colors hover:bg-accent/40' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2"><Skeleton className="h-7 w-32" /><Skeleton className="h-4 w-20" /></div>
        ) : (
          <>
            <div className="text-lg md:text-2xl font-bold tabular-nums truncate">{value}</div>
            <p className={`text-xs ${subColor} truncate`}>{sub}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

export default function DashboardPage() {
  const {
    stats, enriched, loading, refreshPrices, settings, targets,
    accounts, totalCashBase, accountsNetBase, netWorthBase, accountsError, fxRates,
    addAccount, updateAccount, deleteAccount,
  } = usePortfolio()
  const {
    spendingStats, bankTransactions, categoryById, subscriptionSummary, loading: spendingLoading,
  } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const holdingsValue = stats?.holdingsValue ?? 0
  const investments = stats?.totalValue ?? 0
  const recent = bankTransactions.slice(0, 6)
  const topCats = spendingStats.byCategory.slice(0, 6)
  const subs = subscriptionSummary

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Home</h1>
          <p className="text-sm md:text-base text-muted-foreground">Net worth, spending and investments in one place</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Link href="/import"><Button variant="outline" size="sm"><Upload className="mr-2 h-4 w-4" /> Import</Button></Link>
          <Button variant="outline" size="sm" onClick={refreshPrices} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh prices
          </Button>
        </div>
      </div>

      {/* Net worth hero */}
      <Card className="bg-gradient-to-br from-primary/10 via-card to-card">
        <CardContent className="py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PiggyBank className="h-4 w-4" /> Net worth
              </div>
              {loading ? (
                <Skeleton className="mt-2 h-10 w-56" />
              ) : (
                <div className="mt-1 text-3xl md:text-4xl font-bold tabular-nums">{formatCurrency(netWorthBase, base)}</div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <HeroChip label="Invested" value={formatCurrency(holdingsValue, base)} />
              <HeroChip label="Accounts" value={formatCurrency(accountsNetBase, base)} />
              <HeroChip
                label="This month"
                value={formatCurrency(spendingStats.net, base)}
                color={spendingStats.net >= 0 ? 'text-emerald-400' : 'text-red-400'}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Investments" value={formatCurrency(investments, base)}
          sub={stats ? `${formatPercent(stats.totalGainLossPct)} all-time` : 'No holdings yet'}
          subColor={stats ? gainLossColor(stats.totalGainLoss) : 'text-muted-foreground'}
          icon={stats && stats.totalGainLoss >= 0 ? TrendingUp : TrendingDown}
          loading={loading} href="/holdings"
        />
        <StatCard
          title="Spent This Month" value={formatCurrency(spendingStats.expense, base)}
          sub={`${formatCurrency(spendingStats.income, base)} in`} subColor="text-muted-foreground"
          icon={ArrowDownCircle} loading={spendingLoading} href="/spending"
        />
        <StatCard
          title="Subscriptions" value={`${formatCurrency(subs.activeMonthly, base)}/mo`}
          sub={subs.potentialMonthly > 0 ? `${formatCurrency(subs.potentialMonthly, base)}/mo to cut` : 'all reviewed'}
          subColor={subs.potentialMonthly > 0 ? 'text-amber-400' : 'text-muted-foreground'}
          icon={Repeat} loading={spendingLoading} href="/subscriptions"
        />
        <StatCard
          title="Net This Month" value={formatCurrency(spendingStats.net, base)}
          sub="income − spending" subColor={gainLossColor(spendingStats.net)}
          icon={Wallet} loading={spendingLoading}
        />
      </div>

      {/* Portfolio allocation + holdings */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AllocationChart enriched={enriched} loading={loading} cashValue={totalCashBase} />
        </div>
        <div className="lg:col-span-2">
          <HoldingsSummaryTable enriched={enriched} loading={loading} base={base} />
        </div>
      </div>

      {/* Spending breakdown + subscriptions savings */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Spending this month</CardTitle>
                <CardDescription>Top categories</CardDescription>
              </div>
              <Link href="/spending"><Button variant="outline" size="sm">Details <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></Link>
            </div>
          </CardHeader>
          <CardContent>
            {topCats.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No spending tracked this month.
              </div>
            ) : (
              <div className="space-y-2.5">
                {topCats.map((c, i) => {
                  const pct = spendingStats.expense > 0 ? (c.amount / spendingStats.expense) * 100 : 0
                  return (
                    <div key={c.category_id ?? 'uncat'} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} />
                          {c.name}
                        </span>
                        <span className="tabular-nums">{formatCurrency(c.amount, base)} · {pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><Scissors className="h-4 w-4" /> Cut subscriptions</CardTitle>
                <CardDescription>Recurring charges you can trim</CardDescription>
              </div>
              <Link href="/subscriptions"><Button variant="outline" size="sm">Review <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <HeroChip label="Active / mo" value={formatCurrency(subs.activeMonthly, base)} />
              <HeroChip label="Could save / yr" value={formatCurrency(subs.potentialMonthly * 12, base)} color="text-amber-400" />
              <HeroChip label="Saved / yr" value={formatCurrency(subs.cancelledMonthly * 12, base)} color="text-emerald-400" />
            </div>
            <p className="text-xs text-muted-foreground">
              {subs.potentialMonthly > 0
                ? `Flagging your "could cancel" subs would save ${formatCurrency(subs.potentialMonthly * 12, base)} a year.`
                : 'Mark recurring charges you don’t need to start tracking savings.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent spending */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><ArrowDownCircle className="h-4 w-4" /> Recent spending</CardTitle>
              <CardDescription>Latest transactions across your accounts</CardDescription>
            </div>
            <Link href="/spending"><Button variant="outline" size="sm">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></Link>
          </div>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No spending yet. Add a transaction or import your POSB statement from <Link href="/import" className="underline">Import</Link>.
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
                      <div className="text-[11px] text-muted-foreground">{t.date}{cat ? ` · ${cat.name}` : ' · Uncategorized'}</div>
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
          accounts={accounts} netBase={accountsNetBase} base={base} fxRates={fxRates}
          loadError={accountsError} onAdd={addAccount} onUpdate={updateAccount} onDelete={deleteAccount}
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

function HeroChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${color ?? ''}`}>{value}</div>
    </div>
  )
}

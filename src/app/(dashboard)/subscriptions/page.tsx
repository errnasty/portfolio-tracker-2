'use client'

import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RefreshCcw, Scissors, PiggyBank, CheckCircle2 } from 'lucide-react'
import type { Currency, SubscriptionState } from '@/types'

const STATUS_LABEL: Record<SubscriptionState, string> = {
  active: 'Active',
  could_cancel: 'Could cancel',
  cancelled: 'Cancelled',
}

export default function SubscriptionsPage() {
  const { settings } = usePortfolio()
  const { subscriptions, subscriptionSummary, setSubscriptionStatus, categoryById, loading } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency
  const s = subscriptionSummary

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Subscriptions</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Recurring charges detected from your spending. Mark what to cut and watch the savings add up.
        </p>
      </div>

      {/* Savings summary */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={RefreshCcw} title="Active / month" value={formatCurrency(s.activeMonthly, base)}
          sub={`${formatCurrency(s.activeMonthly * 12, base)} / year`} loading={loading} />
        <SummaryCard icon={Scissors} title="Could save / month" value={formatCurrency(s.potentialMonthly, base)}
          sub={`${formatCurrency(s.potentialMonthly * 12, base)} / year`} tone="text-amber-400" loading={loading} />
        <SummaryCard icon={CheckCircle2} title="Cancelled / month" value={formatCurrency(s.cancelledMonthly, base)}
          sub={`${formatCurrency(s.cancelledMonthly * 12, base)} / year saved`} tone="text-emerald-400" loading={loading} />
        <SummaryCard icon={PiggyBank} title="Total potential / year"
          value={formatCurrency((s.potentialMonthly + s.cancelledMonthly) * 12, base)}
          sub="if you cut the flagged ones" tone="text-emerald-400" loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detected subscriptions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6"><Skeleton className="h-48 w-full" /></div>
          ) : subscriptions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border m-6 p-8 text-center text-sm text-muted-foreground">
              No recurring charges detected yet. Import a few months of statements so patterns can emerge.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Yearly</TableHead>
                  <TableHead>Last charged</TableHead>
                  <TableHead className="w-[150px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => {
                  const cat = sub.categoryId ? categoryById[sub.categoryId]?.name : null
                  const cancelled = sub.status === 'cancelled'
                  const couldCancel = sub.status === 'could_cancel'
                  return (
                    <TableRow key={sub.key} className={cancelled ? 'opacity-50' : couldCancel ? 'bg-amber-500/5' : ''}>
                      <TableCell>
                        <div className={`font-medium ${cancelled ? 'line-through' : ''}`}>{sub.label}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {sub.occurrences}× over {sub.months} month{sub.months === 1 ? '' : 's'}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{cat ?? 'Uncategorized'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(sub.monthlyAmount, base)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(sub.annualAmount, base)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{sub.lastDate}</TableCell>
                      <TableCell>
                        <Select
                          value={sub.status}
                          onValueChange={(v) => setSubscriptionStatus(sub.key, v as SubscriptionState, { label: sub.label, monthlyAmount: sub.monthlyAmount })}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(['active', 'could_cancel', 'cancelled'] as SubscriptionState[]).map((st) => (
                              <SelectItem key={st} value={st}>{STATUS_LABEL[st]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tip: mark something <strong className="text-amber-400">Could cancel</strong> while you decide, then{' '}
        <strong className="text-emerald-400">Cancelled</strong> once you&apos;ve actually cancelled it — your yearly savings update automatically.
      </p>
    </div>
  )
}

function SummaryCard({
  icon: Icon, title, value, sub, tone, loading,
}: {
  icon: React.ElementType; title: string; value: string; sub: string; tone?: string; loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-7 w-24" /> : (
          <>
            <div className={`text-lg md:text-2xl font-bold tabular-nums ${tone ?? ''}`}>{value}</div>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

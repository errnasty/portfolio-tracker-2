'use client'

import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { convertToBase } from '@/lib/calculations'
import { forecastCashflow, trailingDailySpend, type ScheduledFlow } from '@/lib/cashflow'
import { nextOnOrAfter } from '@/lib/payments'
import { formatCurrency } from '@/lib/utils'
import { SectionLabel } from '@/components/ui/section-label'
import type { Currency, PlannedPayment } from '@/types'

// Where will my bank balance land at month end? Current balances, minus the
// trailing 30-day daily burn, plus scheduled salary/bills on their dates.
export function CashflowCard({ planned }: { planned: PlannedPayment[] }) {
  const { settings, fxRates, accountsNetBase } = usePortfolio()
  const { bankTransactions, categories, subscriptions } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const forecast = useMemo(() => {
    if (!fxRates) return null
    const today = new Date().toISOString().slice(0, 10)
    const endOfMonth = today.slice(0, 8) + String(new Date(
      Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0,
    ).getDate()).padStart(2, '0')

    const transferIds = new Set(categories.filter((c) => c.kind === 'transfer').map((c) => c.id))
    const dailySpend = trailingDailySpend(
      bankTransactions
        .filter((t) => !(t.category_id && transferIds.has(t.category_id)))
        .map((t) => ({ date: t.date, amountBase: convertToBase(Number(t.amount) || 0, t.currency, fxRates) })),
      today,
    )

    const scheduled: ScheduledFlow[] = []
    for (const p of planned) {
      if (p.paid_at) continue
      const due = nextOnOrAfter(p.due_date, today, p.repeat)
      if (due > endOfMonth) continue
      const amt = convertToBase(Math.abs(Number(p.amount) || 0), String(p.currency), fxRates)
      scheduled.push({ date: due < today ? today : due, amount: p.flow === 'income' ? amt : -amt })
    }
    for (const s of subscriptions) {
      if (s.status === 'cancelled') continue
      const due = nextOnOrAfter(s.lastDate, today, 'monthly')
      if (due > endOfMonth) continue
      scheduled.push({ date: due, amount: -s.monthlyAmount })
    }

    return forecastCashflow({ today, startBalance: accountsNetBase, dailySpend, scheduled })
  }, [fxRates, planned, subscriptions, bankTransactions, categories, accountsNetBase])

  if (!forecast || forecast.series.length < 2) return null
  const eomNegative = forecast.endOfMonth < 0

  return (
    <div className="lift overflow-hidden rounded-lg border border-border bg-card md:col-span-2">
      <SectionLabel tone="cool" right="to month end" href="/payments">CASHFLOW_FORECAST</SectionLabel>
      <div className="p-3.5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Projected end of month
            <span className="ml-2 text-[10px]">
              −{formatCurrency(forecast.dailySpend, base)}/day pace
              {forecast.scheduledNet !== 0 && ` · ${forecast.scheduledNet > 0 ? '+' : ''}${formatCurrency(forecast.scheduledNet, base)} scheduled`}
            </span>
          </span>
          <span className={`text-lg font-semibold tabular-nums ${eomNegative ? 'text-down' : 'text-up'}`}>
            {formatCurrency(forecast.endOfMonth, base)}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <AreaChart data={forecast.series} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="cfFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3f8f86" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#3f8f86" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))"
              tickFormatter={(d) => String(d).slice(8)} axisLine={false} tickLine={false} interval={5} />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              formatter={(v) => [formatCurrency(Number(v), base), 'Projected balance']}
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 4, fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
            <Area type="stepAfter" dataKey="value" stroke="#3f8f86" strokeWidth={1.6} fill="url(#cfFill)" isAnimationActive={false} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Bank accounts only · burn = last 30 days of spending · jumps are scheduled salary, bills, and predicted subscriptions.
        </p>
      </div>
    </div>
  )
}

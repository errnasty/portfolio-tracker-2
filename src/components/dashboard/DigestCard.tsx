'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { buildDigest } from '@/lib/digest'
import { formatCurrency } from '@/lib/utils'
import { SectionLabel } from '@/components/ui/section-label'
import { TLink } from '@/components/motion/TLink'
import { X } from 'lucide-react'
import type { Currency } from '@/types'

function lastMonth(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
}
function monthBefore(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)
}

// Month-in-review, shown for the first days of a new month (dismissable).
export function DigestCard() {
  const { settings, netWorthHistory } = usePortfolio()
  const { statsForMonth, budgets } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const month = lastMonth()
  const dismissKey = `digest_dismissed_${month}`
  // Start hidden and reveal after mount — avoids SSR/localStorage hydration drift.
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try { setDismissed(window.localStorage.getItem(dismissKey) === '1') } catch { /* stay hidden */ }
  }, [dismissKey])

  const digest = useMemo(() => {
    const stats = statsForMonth(month)
    if (stats.income + stats.expense < 1) return null   // nothing happened
    const inMonth = netWorthHistory.filter((s) => s.date.startsWith(month))
    const beforeMonth = netWorthHistory.filter((s) => s.date < `${month}-01`)
    return buildDigest({
      month,
      stats,
      prevStats: statsForMonth(monthBefore(month)),
      totalBudget: budgets.reduce((s, b) => s + Number(b.amount), 0),
      netWorthStart: beforeMonth.length ? Number(beforeMonth[beforeMonth.length - 1].net_worth)
        : inMonth.length ? Number(inMonth[0].net_worth) : null,
      netWorthEnd: inMonth.length ? Number(inMonth[inMonth.length - 1].net_worth) : null,
      formatBase: (n) => formatCurrency(n, base),
    })
  }, [statsForMonth, month, budgets, netWorthHistory, base])

  // Only during the first 10 days of the month — after that it's old news.
  if (dismissed || !digest || new Date().getDate() > 10) return null

  const dismiss = () => {
    try { window.localStorage.setItem(dismissKey, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div className="overflow-hidden rounded-lg border border-accent/40 bg-card">
      <SectionLabel right={
        <button onClick={dismiss} aria-label="Dismiss digest" className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      }>
        {`${monthName.toUpperCase()} · IN REVIEW`}
      </SectionLabel>
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto]">
        <p className="text-sm leading-relaxed">{digest.narrative}</p>
        <div className="flex gap-5 md:gap-6">
          <DigestStat label="Saved" value={`${digest.net >= 0 ? '+' : ''}${formatCurrency(digest.net, base)}`} tone={digest.net >= 0 ? 'text-up' : 'text-down'} />
          <DigestStat label="Savings rate" value={`${digest.savingsRate.toFixed(0)}%`} />
          {digest.budgetDelta != null && (
            <DigestStat
              label="vs budget"
              value={`${digest.budgetDelta <= 0 ? '−' : '+'}${formatCurrency(Math.abs(digest.budgetDelta), base)}`}
              tone={digest.budgetDelta <= 0 ? 'text-up' : 'text-down'}
            />
          )}
        </div>
      </div>
      <div className="border-t border-border px-4 py-2 text-[11px]">
        <TLink href="/budgets" className="text-muted-foreground underline hover:text-foreground">full history →</TLink>
      </div>
    </div>
  )
}

function DigestStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
    </div>
  )
}

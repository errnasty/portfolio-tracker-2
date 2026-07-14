import type { UpcomingItem } from '@/lib/payments'

// "Needs your attention" inbox: turns the whole financial picture into a
// short, prioritized list of actions. Pure — the dashboard supplies data and
// a to-base converter; this ranks and phrases.

export interface AttentionItem {
  sev: 'high' | 'med'
  tag: string
  title: string
  sub: string
  href: string
  cta: string
}

export interface AttentionInput {
  today: string                // YYYY-MM-DD
  upcoming: UpcomingItem[]     // buildUpcoming output (bills + subs + maturities)
  ious: { person: string; direction: 'owed_to_me' | 'i_owe'; amount: number; currency: string; date: string; settled: boolean }[]
  accounts: { name: string; type: string; current_balance: number; currency: string }[]
  budgetPace?: { spentMTD: number; totalBudget: number; dayOfMonth: number; daysInMonth: number }
  toBase: (amount: number, currency: string) => number
  formatBase: (amount: number) => string
}

const STALE_IOU_DAYS = 60

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const { today, upcoming, ious, accounts, budgetPace, toBase, formatBase } = input
  const items: AttentionItem[] = []

  // Overdue bills (planned payments only — subscriptions charge themselves).
  const overdue = upcoming.filter((u) => u.source === 'planned' && u.daysUntil < 0)
  if (overdue.length > 0) {
    const total = overdue.reduce((s, u) => s + toBase(u.amount, u.currency), 0)
    items.push({
      sev: 'high', tag: 'BILLS', href: '/payments', cta: 'PAY',
      title: `${overdue.length} bill${overdue.length === 1 ? '' : 's'} overdue · ${formatBase(total)}`,
      sub: overdue.slice(0, 3).map((u) => u.name).join(' · '),
    })
  }

  // Bills due within 7 days (not overdue, not autopay).
  const dueSoon = upcoming.filter((u) => u.source === 'planned' && !u.autopay && u.daysUntil >= 0 && u.daysUntil <= 7)
  if (dueSoon.length > 0) {
    const total = dueSoon.reduce((s, u) => s + toBase(u.amount, u.currency), 0)
    items.push({
      sev: 'med', tag: 'DUE SOON', href: '/payments', cta: 'REVIEW',
      title: `${dueSoon.length} due within 7 days · ${formatBase(total)}`,
      sub: dueSoon.slice(0, 3).map((u) => `${u.name} (${u.dueDate})`).join(' · '),
    })
  }

  // Deposits maturing within 14 days — reinvestment decision.
  const maturing = upcoming.filter((u) => u.source === 'maturity' && u.daysUntil <= 14)
  if (maturing.length > 0) {
    items.push({
      sev: 'med', tag: 'MATURING', href: '/payments', cta: 'DECIDE',
      title: maturing[0].name + (maturing.length > 1 ? ` · +${maturing.length - 1} more` : ''),
      sub: `${formatBase(maturing.reduce((s, u) => s + toBase(u.amount, u.currency), 0))} needs a reinvestment decision.`,
    })
  }

  // A non-credit account has gone negative — likely a missed entry.
  const negative = accounts.filter((a) => a.type !== 'credit' && Number(a.current_balance) < 0)
  if (negative.length > 0) {
    items.push({
      sev: 'high', tag: 'BALANCE', href: '/accounts', cta: 'RECONCILE',
      title: `${negative[0].name} is negative`,
      sub: 'Probably a missed transaction — use "Set actual balance" to true it up.',
    })
  }

  // Money owed to you going stale.
  const stale = ious.filter((i) =>
    !i.settled && i.direction === 'owed_to_me' && daysBetween(i.date, today) > STALE_IOU_DAYS)
  if (stale.length > 0) {
    const total = stale.reduce((s, i) => s + toBase(Number(i.amount) || 0, i.currency), 0)
    const people = [...new Set(stale.map((i) => i.person))]
    items.push({
      sev: 'med', tag: 'IOU', href: '/people', cta: 'NUDGE',
      title: `${formatBase(total)} owed to you for over ${STALE_IOU_DAYS} days`,
      sub: people.slice(0, 3).join(' · '),
    })
  }

  // Spending ahead of budget pace (>15% over pro-rata, once the month has legs).
  if (budgetPace && budgetPace.totalBudget > 0 && budgetPace.dayOfMonth >= 5) {
    const expected = budgetPace.totalBudget * (budgetPace.dayOfMonth / budgetPace.daysInMonth)
    if (expected > 0 && budgetPace.spentMTD > expected * 1.15) {
      const aheadPct = ((budgetPace.spentMTD / expected) - 1) * 100
      items.push({
        sev: 'med', tag: 'PACE', href: '/budgets', cta: 'REVIEW',
        title: `Spending ${aheadPct.toFixed(0)}% ahead of budget pace`,
        sub: `${formatBase(budgetPace.spentMTD)} by day ${budgetPace.dayOfMonth}; on pace for ${formatBase((budgetPace.spentMTD / budgetPace.dayOfMonth) * budgetPace.daysInMonth)} vs ${formatBase(budgetPace.totalBudget)} budget.`,
      })
    }
  }

  return items
}

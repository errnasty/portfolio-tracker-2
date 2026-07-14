import type { SpendingStats } from '@/types'

// Month-end digest: turns a finished month into a handful of numbers and a
// short narrative. Pure — the caller feeds month stats and context.

export interface DigestMover {
  name: string
  delta: number                // base currency, + = spent more than prior month
}

export interface Digest {
  month: string                // 'YYYY-MM'
  income: number
  expense: number
  net: number
  savingsRate: number          // % of income
  prevSavingsRate: number | null
  budgetDelta: number | null   // negative = under budget (good)
  movers: DigestMover[]        // top |Δ| vs prior month
  netWorthDelta: number | null
  narrative: string
}

export function buildDigest(opts: {
  month: string
  stats: SpendingStats
  prevStats: SpendingStats
  totalBudget: number
  netWorthStart?: number | null
  netWorthEnd?: number | null
  formatBase: (n: number) => string
}): Digest {
  const { month, stats, prevStats, totalBudget, netWorthStart, netWorthEnd, formatBase } = opts

  const savingsRate = stats.income > 0 ? (stats.net / stats.income) * 100 : 0
  const prevSavingsRate = prevStats.income > 0 ? (prevStats.net / prevStats.income) * 100 : null
  const budgetDelta = totalBudget > 0 ? stats.expense - totalBudget : null

  const prevByCat = new Map(prevStats.byCategory.map((c) => [c.name, c.amount]))
  const names = new Set([...stats.byCategory.map((c) => c.name), ...prevStats.byCategory.map((c) => c.name)])
  const movers = [...names]
    .map((name) => ({
      name,
      delta: (stats.byCategory.find((c) => c.name === name)?.amount ?? 0) - (prevByCat.get(name) ?? 0),
    }))
    .filter((m) => Math.abs(m.delta) > 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)

  const netWorthDelta = netWorthStart != null && netWorthEnd != null
    ? netWorthEnd - netWorthStart : null

  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  const parts: string[] = []
  parts.push(`In ${monthName} you earned ${formatBase(stats.income)} and spent ${formatBase(stats.expense)} — a ${savingsRate.toFixed(0)}% savings rate${
    prevSavingsRate != null ? ` (${savingsRate >= prevSavingsRate ? 'up from' : 'down from'} ${prevSavingsRate.toFixed(0)}%)` : ''
  }.`)
  if (budgetDelta != null) {
    parts.push(budgetDelta <= 0
      ? `You finished ${formatBase(-budgetDelta)} under budget.`
      : `You went ${formatBase(budgetDelta)} over budget.`)
  }
  if (movers.length > 0) {
    const m = movers[0]
    parts.push(`Biggest mover: ${m.name} ${m.delta >= 0 ? 'up' : 'down'} ${formatBase(Math.abs(m.delta))} vs the month before.`)
  }
  if (netWorthDelta != null && Math.abs(netWorthDelta) > 0.5) {
    parts.push(`Net worth ${netWorthDelta >= 0 ? 'grew' : 'fell'} ${formatBase(Math.abs(netWorthDelta))}.`)
  }

  return {
    month, income: stats.income, expense: stats.expense, net: stats.net,
    savingsRate, prevSavingsRate, budgetDelta, movers, netWorthDelta,
    narrative: parts.join(' '),
  }
}

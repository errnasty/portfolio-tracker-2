import { describe, it, expect } from 'vitest'
import { buildDigest } from '../digest'
import type { SpendingStats } from '@/types'

const fmt = (n: number) => `$${n.toFixed(0)}`

function stats(over: Partial<SpendingStats>): SpendingStats {
  return {
    month: '2026-06', income: 5000, expense: 3000, net: 2000,
    byCategory: [], incomeByCategory: [],
    ...over,
  }
}

describe('buildDigest', () => {
  it('summarizes the month with savings rate, budget delta, movers, and net worth', () => {
    const d = buildDigest({
      month: '2026-06',
      stats: stats({
        byCategory: [
          { category_id: 'a', name: 'Food & Dining', amount: 800 },
          { category_id: 'b', name: 'Transport', amount: 200 },
        ],
      }),
      prevStats: stats({
        month: '2026-05', income: 5000, expense: 3500, net: 1500,
        byCategory: [
          { category_id: 'a', name: 'Food & Dining', amount: 500 },
          { category_id: 'b', name: 'Transport', amount: 210 },
        ],
      }),
      totalBudget: 3200,
      netWorthStart: 50_000,
      netWorthEnd: 52_500,
      formatBase: fmt,
    })
    expect(d.savingsRate).toBe(40)
    expect(d.prevSavingsRate).toBe(30)
    expect(d.budgetDelta).toBe(-200)
    expect(d.movers[0]).toEqual({ name: 'Food & Dining', delta: 300 })
    expect(d.netWorthDelta).toBe(2500)
    expect(d.narrative).toContain('In June you earned $5000 and spent $3000 — a 40% savings rate (up from 30%).')
    expect(d.narrative).toContain('You finished $200 under budget.')
    expect(d.narrative).toContain('Food & Dining up $300')
    expect(d.narrative).toContain('Net worth grew $2500.')
  })

  it('degrades gracefully without budget, prior month, or snapshots', () => {
    const d = buildDigest({
      month: '2026-06',
      stats: stats({}),
      prevStats: stats({ income: 0, expense: 0, net: 0 }),
      totalBudget: 0,
      formatBase: fmt,
    })
    expect(d.budgetDelta).toBeNull()
    expect(d.prevSavingsRate).toBeNull()
    expect(d.netWorthDelta).toBeNull()
    expect(d.narrative).toContain('a 40% savings rate.')
  })
})

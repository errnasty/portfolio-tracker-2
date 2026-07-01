import { describe, it, expect } from 'vitest'
import {
  trailingMonthlyNetSavings, trailingAnnualExpenses, fiTarget, yearsToTarget,
} from '../fi'
import type { ProjectionPoint } from '../projection'

type MonthStats = { income: number; expense: number; net: number }

function makeStatsForMonth(byYm: Record<string, MonthStats>) {
  return (ym: string): MonthStats => byYm[ym] ?? { income: 0, expense: 0, net: 0 }
}

describe('trailingMonthlyNetSavings', () => {
  it('averages net over the trailing N months', () => {
    const stats = makeStatsForMonth({
      '2026-05': { income: 8000, expense: 5000, net: 3000 },
      '2026-06': { income: 8000, expense: 6000, net: 2000 },
      '2026-07': { income: 8000, expense: 5500, net: 2500 },
    })
    // trailing 3 months ending 2026-07: (3000+2000+2500)/3
    expect(trailingMonthlyNetSavings(stats, '2026-07', 3)).toBeCloseTo(2500, 5)
  })
  it('returns null when there is no data at all', () => {
    const stats = makeStatsForMonth({})
    expect(trailingMonthlyNetSavings(stats, '2026-07', 3)).toBeNull()
  })
  it('defaults to 3 months when not specified', () => {
    const stats = makeStatsForMonth({
      '2026-05': { income: 100, expense: 0, net: 100 },
      '2026-06': { income: 100, expense: 0, net: 100 },
      '2026-07': { income: 100, expense: 0, net: 100 },
    })
    expect(trailingMonthlyNetSavings(stats, '2026-07')).toBeCloseTo(100, 5)
  })
})

describe('trailingAnnualExpenses', () => {
  it('sums expense over the trailing N months (default 12)', () => {
    const byYm: Record<string, MonthStats> = {}
    for (let m = 1; m <= 12; m++) {
      const ym = `2026-${String(m).padStart(2, '0')}`
      byYm[ym] = { income: 1000, expense: 500, net: 500 }
    }
    const stats = makeStatsForMonth(byYm)
    expect(trailingAnnualExpenses(stats, '2026-12')).toBeCloseTo(6000, 5)
  })
  it('returns null when there is no data at all', () => {
    const stats = makeStatsForMonth({})
    expect(trailingAnnualExpenses(stats, '2026-12')).toBeNull()
  })
  it('is a distinct sum from the savings average for the same data', () => {
    const byYm: Record<string, MonthStats> = {
      '2026-05': { income: 1000, expense: 500, net: 500 },
      '2026-06': { income: 1000, expense: 500, net: 500 },
      '2026-07': { income: 1000, expense: 500, net: 500 },
    }
    const stats = makeStatsForMonth(byYm)
    const savings = trailingMonthlyNetSavings(stats, '2026-07', 3)
    const expenses = trailingAnnualExpenses(stats, '2026-07', 3)
    expect(savings).toBeCloseTo(500, 5)      // average
    expect(expenses).toBeCloseTo(1500, 5)    // sum
  })
})

describe('fiTarget', () => {
  it('applies a 4% safe-withdrawal rate as a 25x multiple', () => {
    expect(fiTarget(48000, 4)).toBeCloseTo(1200000, 2)
  })
  it('applies a 3.33% safe-withdrawal rate as a 30x multiple', () => {
    expect(fiTarget(40000, 3.333333)).toBeCloseTo(1200000, -1)
  })
  it('returns null for null annualExpenses', () => {
    expect(fiTarget(null, 4)).toBeNull()
  })
  it('returns null for zero or negative annualExpenses', () => {
    expect(fiTarget(0, 4)).toBeNull()
    expect(fiTarget(-100, 4)).toBeNull()
  })
})

describe('yearsToTarget', () => {
  const series: ProjectionPoint[] = [
    { month: 0, date: '2026-01', p5: 100, p25: 100, p50: 100, p75: 100, p95: 100, expected: 100 },
    { month: 12, date: '2027-01', p5: 90, p25: 110, p50: 130, p75: 150, p95: 180, expected: 130 },
    { month: 24, date: '2028-01', p5: 95, p25: 140, p50: 170, p75: 200, p95: 260, expected: 170 },
  ]
  it('finds the first month a percentile crosses the target, in years', () => {
    // p50 crosses 130 at month 12 -> 1 year
    expect(yearsToTarget(series, 'p50', 130)).toBeCloseTo(1, 5)
  })
  it('returns 0 when already at/above target at month 0', () => {
    expect(yearsToTarget(series, 'p50', 50)).toBe(0)
  })
  it('returns null when the percentile never reaches the target in the series', () => {
    expect(yearsToTarget(series, 'p50', 1000)).toBeNull()
  })
  it('p95 (optimistic) crosses no later than p5 (pessimistic) for the same target', () => {
    const target = 150
    const fast = yearsToTarget(series, 'p95', target)
    const slow = yearsToTarget(series, 'p5', target)
    expect(fast).not.toBeNull()
    expect(slow === null || fast! <= slow).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { monteCarlo, monthsBetween } from '../projection'

describe('monteCarlo', () => {
  it('produces non-decreasing percentile bands', () => {
    const result = monteCarlo({
      startingValue: 10_000,
      monthlyContribution: 500,
      expectedAnnualReturnPct: 7,
      expectedAnnualVolPct: 15,
      months: 36,
      paths: 200,
      seed: 42,
    })
    expect(result.series.length).toBe(37)
    for (const point of result.series) {
      expect(point.p5).toBeLessThanOrEqual(point.p25)
      expect(point.p25).toBeLessThanOrEqual(point.p50)
      expect(point.p50).toBeLessThanOrEqual(point.p75)
      expect(point.p75).toBeLessThanOrEqual(point.p95)
    }
  })

  it('starts every percentile at the starting value', () => {
    const result = monteCarlo({
      startingValue: 50_000,
      monthlyContribution: 0,
      expectedAnnualReturnPct: 7,
      expectedAnnualVolPct: 15,
      months: 12,
      paths: 100,
      seed: 1,
    })
    const first = result.series[0]
    expect(first.p5).toBe(50_000)
    expect(first.p50).toBe(50_000)
    expect(first.p95).toBe(50_000)
    expect(first.expected).toBe(50_000)
  })

  it('is deterministic when seeded', () => {
    const opts = {
      startingValue: 10_000,
      monthlyContribution: 100,
      expectedAnnualReturnPct: 8,
      expectedAnnualVolPct: 16,
      months: 24,
      paths: 100,
      seed: 99,
    }
    const a = monteCarlo(opts)
    const b = monteCarlo(opts)
    expect(a.finalP50).toBe(b.finalP50)
    expect(a.series[12].p50).toBe(b.series[12].p50)
  })

  it('zero-vol scenario collapses to deterministic compound growth', () => {
    const start = 10_000
    const ret = 6 // %
    const months = 12
    const result = monteCarlo({
      startingValue: start,
      monthlyContribution: 0,
      expectedAnnualReturnPct: ret,
      expectedAnnualVolPct: 0,
      months,
      paths: 50,
      seed: 7,
    })
    // GBM with sigma=0 evolves as start * exp(mu * t) — slightly higher than
    // the discrete (1 + mu)^t version. ~10618 for 6% annual / 12 months.
    const muMonthly = ret / 100 / 12
    const expected = start * Math.exp(muMonthly * months)
    expect(result.finalP50).toBeCloseTo(expected, 1)
    // With zero vol, all paths collapse to the same value.
    expect(result.finalP5).toBeCloseTo(result.finalP95, 1)
  })

  it('computes success rate when target supplied', () => {
    // Conservative scenario: 4% return, 8% vol over 10 years should mostly hit a $50k target with $10k start + $300/mo
    const result = monteCarlo({
      startingValue: 10_000,
      monthlyContribution: 300,
      expectedAnnualReturnPct: 4,
      expectedAnnualVolPct: 8,
      months: 120,
      paths: 500,
      seed: 13,
    }, 50_000)
    expect(result.successRate).toBeGreaterThan(0.5)
    expect(result.successRate).toBeLessThanOrEqual(1)
  })

  it('higher contributions raise the median path', () => {
    const base = monteCarlo({
      startingValue: 10_000, monthlyContribution: 100,
      expectedAnnualReturnPct: 7, expectedAnnualVolPct: 15,
      months: 60, paths: 200, seed: 5,
    })
    const more = monteCarlo({
      startingValue: 10_000, monthlyContribution: 500,
      expectedAnnualReturnPct: 7, expectedAnnualVolPct: 15,
      months: 60, paths: 200, seed: 5,
    })
    expect(more.finalP50).toBeGreaterThan(base.finalP50)
  })
})

describe('monthsBetween', () => {
  it('counts whole calendar months', () => {
    expect(monthsBetween('2024-01-15', '2024-03-15')).toBe(2)
    expect(monthsBetween('2024-01-31', '2025-01-31')).toBe(12)
  })

  it('returns 0 for same month', () => {
    expect(monthsBetween('2024-05-01', '2024-05-30')).toBe(0)
  })

  it('handles cross-year ranges', () => {
    expect(monthsBetween('2023-11-01', '2025-02-01')).toBe(15)
  })
})

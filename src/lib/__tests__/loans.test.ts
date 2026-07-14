import { describe, it, expect } from 'vitest'
import { projectLoan } from '../loans'

describe('projectLoan', () => {
  it('projects a standard reducing-balance loan', () => {
    // 10k at 6% p.a., paying 500/mo → 21 full payments + a final partial one.
    const p = projectLoan(10_000, 6, 500, '2026-07-13')!
    expect(p.months).toBe(22)
    expect(p.payoffDate).toBe('2028-05')
    expect(p.totalInterest).toBeGreaterThan(500)
    expect(p.totalInterest).toBeLessThan(600)
    expect(p.nextInterest).toBeCloseTo(50, 5)       // 10k * 0.5%/mo
    expect(p.nextPrincipal).toBeCloseTo(450, 5)
  })

  it('handles zero-rate loans', () => {
    const p = projectLoan(1200, 0, 100, '2026-07-13')!
    expect(p.months).toBe(12)
    expect(p.totalInterest).toBe(0)
    expect(p.payoffDate).toBe('2027-07')
  })

  it('returns null when the payment cannot cover interest', () => {
    // 100k at 12% → 1000/mo interest; paying 900 never clears it.
    expect(projectLoan(100_000, 12, 900, '2026-07-13')).toBeNull()
  })

  it('returns null for invalid inputs', () => {
    expect(projectLoan(0, 5, 100, '2026-07-13')).toBeNull()
    expect(projectLoan(1000, 5, 0, '2026-07-13')).toBeNull()
  })
})

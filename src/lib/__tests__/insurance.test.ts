import { describe, it, expect } from 'vitest'
import { annualizedPremium, frequencyToRepeat, hasRecurringPremium, daysUntilExpiry } from '../insurance'

describe('annualizedPremium', () => {
  it('multiplies monthly by 12', () => {
    expect(annualizedPremium(100, 'monthly')).toBe(1200)
  })
  it('multiplies quarterly by 4', () => {
    expect(annualizedPremium(250, 'quarterly')).toBe(1000)
  })
  it('keeps yearly as-is', () => {
    expect(annualizedPremium(900, 'yearly')).toBe(900)
  })
  it('treats single/none as no recurring cost', () => {
    expect(annualizedPremium(5000, 'single')).toBe(0)
    expect(annualizedPremium(5000, 'none')).toBe(0)
  })
  it('handles null amount', () => {
    expect(annualizedPremium(null, 'monthly')).toBe(0)
  })
})

describe('frequencyToRepeat', () => {
  it('maps recurring frequencies', () => {
    expect(frequencyToRepeat('monthly')).toBe('monthly')
    expect(frequencyToRepeat('quarterly')).toBe('quarterly')
    expect(frequencyToRepeat('yearly')).toBe('yearly')
  })
  it('maps single/none to a one-off', () => {
    expect(frequencyToRepeat('single')).toBe('none')
    expect(frequencyToRepeat('none')).toBe('none')
  })
})

describe('hasRecurringPremium', () => {
  it('is true only for a positive recurring premium', () => {
    expect(hasRecurringPremium(100, 'monthly')).toBe(true)
    expect(hasRecurringPremium(0, 'monthly')).toBe(false)
    expect(hasRecurringPremium(100, 'single')).toBe(false)
  })
})

describe('daysUntilExpiry', () => {
  it('computes days to end date', () => {
    expect(daysUntilExpiry('2026-07-20', '2026-07-15')).toBe(5)
  })
  it('is negative when already expired', () => {
    expect(daysUntilExpiry('2026-07-10', '2026-07-15')).toBe(-5)
  })
  it('is null with no end date', () => {
    expect(daysUntilExpiry(null, '2026-07-15')).toBeNull()
  })
})

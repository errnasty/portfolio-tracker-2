import { describe, it, expect } from 'vitest'
import { guessCategoryName, DEFAULT_CATEGORIES } from '../categorize'

describe('guessCategoryName', () => {
  it('maps common SG merchants to the right category', () => {
    expect(guessCategoryName('NTUC FAIRPRICE')).toBe('Groceries')
    expect(guessCategoryName('GRAB *TRIP')).toBe('Transport')
    expect(guessCategoryName('GRABFOOD ORDER')).toBe('Food & Dining')
    expect(guessCategoryName('SINGTEL MOBILE BILL')).toBe('Bills & Utilities')
    expect(guessCategoryName('SHOPEE SINGAPORE')).toBe('Shopping')
  })

  it('detects income narratives', () => {
    expect(guessCategoryName('MONTHLY SALARY GIRO')).toBe('Income')
    expect(guessCategoryName('REFUND FROM AMAZON')).toBe('Income')
  })

  it('detects transfers', () => {
    expect(guessCategoryName('PAYNOW TRANSFER TO JOHN')).toBe('Transfers')
  })

  it('returns null when nothing matches', () => {
    expect(guessCategoryName('XYZ UNKNOWN VENDOR 123')).toBeNull()
    expect(guessCategoryName('')).toBeNull()
  })

  it('every guessable category exists in DEFAULT_CATEGORIES', () => {
    const names = new Set(DEFAULT_CATEGORIES.map((c) => c.name))
    for (const sample of ['NTUC', 'GRAB *TRIP', 'GRABFOOD', 'SINGTEL', 'SALARY', 'PAYNOW']) {
      const g = guessCategoryName(sample)
      if (g) expect(names.has(g)).toBe(true)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { pricePerUnit, isKnownWeightUnit, makeMetalFetcher } from '../server/fund-scrapers/precious-metals'

describe('pricePerUnit', () => {
  it('is an identity conversion for troy ounces', () => {
    expect(pricePerUnit(2400, 'oz_troy')).toBeCloseTo(2400, 6)
  })

  it('converts spot USD/oz to price per gram', () => {
    // 1 troy oz = 31.1034768 g, so price/gram = price/oz / 31.1034768
    expect(pricePerUnit(31.1034768, 'gram')).toBeCloseTo(1, 6)
  })

  it('converts spot USD/oz to price per kilogram', () => {
    expect(pricePerUnit(31.1034768, 'kg')).toBeCloseTo(1000, 3)
  })

  it('converts spot USD/oz to price per tael', () => {
    // 1 tael = 37.4290 g
    expect(pricePerUnit(31.1034768, 'tael')).toBeCloseTo(37.4290, 3)
  })

  it('throws for an unrecognized unit', () => {
    expect(() => pricePerUnit(2400, 'stone')).toThrow()
  })
})

describe('isKnownWeightUnit', () => {
  it('recognizes the four supported units', () => {
    expect(isKnownWeightUnit('gram')).toBe(true)
    expect(isKnownWeightUnit('oz_troy')).toBe(true)
    expect(isKnownWeightUnit('tael')).toBe(true)
    expect(isKnownWeightUnit('kg')).toBe(true)
    expect(isKnownWeightUnit('stone')).toBe(false)
  })
})

describe('makeMetalFetcher', () => {
  it('rejects an unknown unit before attempting any network fetch', async () => {
    const fetchQuote = makeMetalFetcher('gold')
    await expect(fetchQuote('stone')).rejects.toThrow(/unknown weight unit/)
  })
})

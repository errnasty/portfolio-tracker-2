import { describe, it, expect } from 'vitest'
import {
  taxOnChargeableIncome,
  marginalRate,
  estimateTax,
  SRS_RELIEF_CAP_SG,
  PERSONAL_RELIEF_CAP,
} from '../income-tax'

describe('taxOnChargeableIncome', () => {
  it('is zero up to the tax-free threshold', () => {
    expect(taxOnChargeableIncome(0)).toBe(0)
    expect(taxOnChargeableIncome(20_000)).toBe(0)
  })

  it('matches IRAS cumulative figures at bracket floors', () => {
    // Known cumulative tax at each bracket floor (YA2024+).
    expect(taxOnChargeableIncome(30_000)).toBe(200)
    expect(taxOnChargeableIncome(40_000)).toBe(550)
    expect(taxOnChargeableIncome(80_000)).toBe(3_350)
    expect(taxOnChargeableIncome(120_000)).toBe(7_950)
    expect(taxOnChargeableIncome(160_000)).toBe(13_950)
    expect(taxOnChargeableIncome(200_000)).toBe(21_150)
    expect(taxOnChargeableIncome(320_000)).toBe(44_550)
    expect(taxOnChargeableIncome(500_000)).toBe(84_150)
    expect(taxOnChargeableIncome(1_000_000)).toBe(199_150)
  })

  it('applies the marginal rate within a bracket', () => {
    // 100,000 = 3,350 (at 80k) + 20,000 * 11.5% = 3,350 + 2,300 = 5,650
    expect(taxOnChargeableIncome(100_000)).toBe(5_650)
  })

  it('applies the top 24% rate above $1m', () => {
    // 1,200,000 = 199,150 + 200,000 * 24% = 199,150 + 48,000 = 247,150
    expect(taxOnChargeableIncome(1_200_000)).toBe(247_150)
  })

  it('never goes negative', () => {
    expect(taxOnChargeableIncome(-5_000)).toBe(0)
  })
})

describe('marginalRate', () => {
  it('returns the bracket rate for the next dollar', () => {
    expect(marginalRate(10_000)).toBe(0)
    expect(marginalRate(50_000)).toBe(0.07)
    expect(marginalRate(100_000)).toBe(0.115)
    expect(marginalRate(2_000_000)).toBe(0.24)
  })
})

describe('estimateTax', () => {
  it('reduces chargeable income by reliefs and top-ups', () => {
    const e = estimateTax({ assessableIncome: 100_000, reliefs: 0, srsTopUp: 15_300 })
    expect(e.totalReliefs).toBe(15_300)
    expect(e.chargeableIncome).toBe(84_700)
    expect(e.tax).toBe(taxOnChargeableIncome(84_700))
  })

  it('quantifies tax saved by an SRS top-up at the marginal rate', () => {
    // At 100k chargeable, marginal rate is 11.5%; 15,300 top-up saves ~1,759.50.
    const e = estimateTax({ assessableIncome: 100_000, srsTopUp: 15_300 })
    expect(e.taxSaved).toBeCloseTo(15_300 * 0.115, 1)
  })

  it('caps SRS relief at the citizen limit', () => {
    const e = estimateTax({ assessableIncome: 100_000, srsTopUp: 999_999 })
    expect(e.totalReliefs).toBe(SRS_RELIEF_CAP_SG)
  })

  it('caps CPF cash top-up relief at $8,000', () => {
    const e = estimateTax({ assessableIncome: 100_000, cpfCashTopUp: 20_000 })
    expect(e.totalReliefs).toBe(8_000)
  })

  it('honours the overall personal relief cap', () => {
    const e = estimateTax({ assessableIncome: 200_000, reliefs: 79_000, srsTopUp: 15_300 })
    expect(e.totalReliefs).toBe(PERSONAL_RELIEF_CAP)
    expect(e.reliefsCapped).toBe(true)
  })

  it('reports a sane effective rate', () => {
    const e = estimateTax({ assessableIncome: 100_000 })
    expect(e.effectiveRate).toBeCloseTo(5_650 / 100_000, 5)
  })
})

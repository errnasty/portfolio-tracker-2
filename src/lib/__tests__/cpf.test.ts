import { describe, it, expect } from 'vitest'
import { computeCpf, grossFromRecorded, cpfBand, ageInYear, CPF_CONFIG } from '../cpf'

describe('grossFromRecorded', () => {
  it('inverts an 80% take-home below the ceiling', () => {
    // Take-home 4000 → gross 5000 (5000 − 20% = 4000).
    expect(grossFromRecorded(4000, 'take_home')).toBe(5000)
  })

  it('passes gross through unchanged', () => {
    expect(grossFromRecorded(5000, 'gross')).toBe(5000)
  })

  it('handles take-home above the ceiling (employee CPF capped)', () => {
    // Ceiling 8000, employee 20% → capped employee CPF 1600.
    // A 10000 gross earner takes home 10000 − 1600 = 8400.
    expect(grossFromRecorded(8400, 'take_home')).toBe(10000)
  })
})

describe('cpfBand', () => {
  it('picks the band by age', () => {
    expect(cpfBand(30).oa).toBe(0.23)
    expect(cpfBand(40).oa).toBe(0.21)
    expect(cpfBand(48).oa).toBe(0.19)
    expect(cpfBand(54).oa).toBe(0.15)
    expect(cpfBand(60).oa).toBe(0.15) // clamps to last band ≤55
  })
})

describe('computeCpf', () => {
  it('computes 37% total split into OA/SA/MA for a young earner', () => {
    // 4000 take-home → 5000 gross. employee 1000, employer 850, total 1850.
    const c = computeCpf({ recordedSalary: 4000, basis: 'take_home', age: 30 })
    expect(c.gross).toBe(5000)
    expect(c.employee).toBe(1000)   // 5000 * 0.20
    expect(c.employer).toBe(850)    // 5000 * 0.17
    expect(c.total).toBe(1850)
    expect(c.oa).toBe(1150)         // 5000 * 0.23
    expect(c.sa).toBe(300)          // 5000 * 0.06
    expect(c.ma).toBe(400)          // 5000 * 0.08
    expect(c.oa + c.sa + c.ma).toBe(c.total)
    expect(c.aboveCeiling).toBe(false)
  })

  it('caps contributions at the Ordinary Wage ceiling', () => {
    // 8400 take-home → 10000 gross, capped to 8000.
    const c = computeCpf({ recordedSalary: 8400, basis: 'take_home', age: 30 })
    expect(c.gross).toBe(10000)
    expect(c.cappedWage).toBe(8000)
    expect(c.employee).toBe(1600)   // 8000 * 0.20
    expect(c.total).toBe(2960)      // 8000 * 0.37
    expect(c.aboveCeiling).toBe(true)
  })

  it('uses the older-band allocation', () => {
    const c = computeCpf({ recordedSalary: 5000, basis: 'gross', age: 52 })
    expect(c.oa).toBe(750)          // 5000 * 0.15
    expect(c.sa).toBe(575)          // 5000 * 0.115
    expect(c.ma).toBe(525)          // 5000 * 0.105
    expect(c.oa + c.sa + c.ma).toBeCloseTo(c.total, 2)
  })
})

describe('ageInYear', () => {
  it('derives age from birth year', () => {
    expect(ageInYear(1996, '2026-07-14')).toBe(30)
  })
})

describe('CPF_CONFIG invariant', () => {
  it('each band allocates exactly the total contribution rate', () => {
    const total = CPF_CONFIG.employeeRate + CPF_CONFIG.employerRate
    for (const b of CPF_CONFIG.bands) {
      expect(b.oa + b.sa + b.ma).toBeCloseTo(total, 6)
    }
  })
})

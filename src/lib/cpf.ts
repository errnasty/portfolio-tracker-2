// Singapore CPF contribution maths for private-sector employees aged 55 & below.
//
// The take-home salary a user records is their gross Ordinary Wage MINUS the
// 20% employee CPF share (they "receive 80%"). CPF then adds the 20% employee
// share + 17% employer share (37% of the wage total) into three accounts,
// split by age band. We invert the take-home to recover the gross wage, cap it
// at the Ordinary Wage ceiling, then compute and allocate.
//
// Rates are the standard CPF rates for age ≤ 55 (source: cpf.gov.sg). The
// Ordinary Wage ceiling is $8,000/month from Jan 2026. All rates live in
// CPF_CONFIG so they can be overridden (tests) and updated in one place.

export interface CpfAllocationBand {
  maxAge: number               // inclusive upper bound of the band
  oa: number                   // fraction of wage → Ordinary Account
  sa: number                   // → Special Account
  ma: number                   // → MediSave
}

export interface CpfConfig {
  employeeRate: number         // employee share (fraction of wage)
  employerRate: number         // employer share
  owCeilingMonthly: number     // Ordinary Wage ceiling per month
  bands: CpfAllocationBand[]   // allocation of the total 37% by age (≤55)
}

// Age ≤ 55 rates. OA+SA+MA in each band sum to employeeRate + employerRate.
export const CPF_CONFIG: CpfConfig = {
  employeeRate: 0.20,
  employerRate: 0.17,
  owCeilingMonthly: 8000,
  bands: [
    { maxAge: 35, oa: 0.23,  sa: 0.06,   ma: 0.08 },
    { maxAge: 45, oa: 0.21,  sa: 0.07,   ma: 0.09 },
    { maxAge: 50, oa: 0.19,  sa: 0.08,   ma: 0.10 },
    { maxAge: 55, oa: 0.15,  sa: 0.115,  ma: 0.105 },
  ],
}

export type SalaryBasis = 'take_home' | 'gross'

export interface CpfBreakdown {
  gross: number                // gross Ordinary Wage (pre-CPF), capped-aware
  cappedWage: number           // wage actually subject to CPF (≤ ceiling)
  employee: number
  employer: number
  total: number
  oa: number
  sa: number
  ma: number
  aboveCeiling: boolean        // true when the wage was capped
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function cpfBand(age: number, config: CpfConfig = CPF_CONFIG): CpfAllocationBand {
  return config.bands.find((b) => age <= b.maxAge) ?? config.bands[config.bands.length - 1]
}

// Recover the gross Ordinary Wage from a recorded salary figure.
//  - basis 'gross': the figure already is the gross wage.
//  - basis 'take_home': figure = gross − employee CPF. Below the ceiling that's
//    gross×(1−e); above it, employee CPF is capped at ceiling×e, so
//    gross = take-home + ceiling×e.
export function grossFromRecorded(
  recorded: number,
  basis: SalaryBasis,
  config: CpfConfig = CPF_CONFIG,
): number {
  if (basis === 'gross') return Math.max(0, recorded)
  const e = config.employeeRate
  const C = config.owCeilingMonthly
  const belowCeilingGross = recorded / (1 - e)
  if (belowCeilingGross <= C) return belowCeilingGross
  return recorded + C * e
}

export function computeCpf(opts: {
  recordedSalary: number       // the income amount as recorded (positive)
  basis: SalaryBasis
  age: number
  config?: CpfConfig
}): CpfBreakdown {
  const config = opts.config ?? CPF_CONFIG
  const gross = grossFromRecorded(opts.recordedSalary, opts.basis, config)
  const cappedWage = Math.min(gross, config.owCeilingMonthly)
  const band = cpfBand(opts.age, config)

  const employee = round2(cappedWage * config.employeeRate)
  const employer = round2(cappedWage * config.employerRate)
  return {
    gross: round2(gross),
    cappedWage: round2(cappedWage),
    employee,
    employer,
    total: round2(employee + employer),
    oa: round2(cappedWage * band.oa),
    sa: round2(cappedWage * band.sa),
    ma: round2(cappedWage * band.ma),
    aboveCeiling: gross > config.owCeilingMonthly + 0.005,
  }
}

// Age at a given date (YYYY-MM-DD) from a birth year — good enough for banding.
export function ageInYear(birthYear: number, dateIso: string): number {
  return Number(dateIso.slice(0, 4)) - birthYear
}

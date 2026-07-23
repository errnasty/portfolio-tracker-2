// Singapore resident personal income tax — YA2024 onwards rate structure
// (source: IRAS). This is an *estimator* for planning: it models the
// progressive bracket table, the main investor-relevant reliefs (SRS cash
// top-up and CPF cash top-up to your own retirement savings), and the overall
// personal income tax relief cap.
//
// It deliberately does NOT try to be a full return: it ignores rebates,
// parenthood/other reliefs the app doesn't know about, and non-resident rates.
// Everything is in SGD.

export interface TaxBracket {
  // Chargeable income at which this marginal rate starts applying.
  floor: number
  rate: number // marginal rate as a fraction (0.07 = 7%)
}

// YA2024+ resident brackets. Each entry's rate applies to income between its
// floor and the next entry's floor (the last is open-ended).
export const RESIDENT_BRACKETS: TaxBracket[] = [
  { floor: 0, rate: 0 },
  { floor: 20_000, rate: 0.02 },
  { floor: 30_000, rate: 0.035 },
  { floor: 40_000, rate: 0.07 },
  { floor: 80_000, rate: 0.115 },
  { floor: 120_000, rate: 0.15 },
  { floor: 160_000, rate: 0.18 },
  { floor: 200_000, rate: 0.19 },
  { floor: 240_000, rate: 0.195 },
  { floor: 280_000, rate: 0.20 },
  { floor: 320_000, rate: 0.22 },
  { floor: 500_000, rate: 0.23 },
  { floor: 1_000_000, rate: 0.24 },
]

// Relief limits (YA2024+).
export const SRS_RELIEF_CAP_SG = 15_300 // Singapore citizens / PRs
export const SRS_RELIEF_CAP_FOREIGNER = 35_700
export const CPF_CASH_TOPUP_OWN_CAP = 8_000 // top-up to own SA/RA & MediSave
export const PERSONAL_RELIEF_CAP = 80_000 // overall cap on personal reliefs

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Tax on a given chargeable income, walking the progressive brackets.
export function taxOnChargeableIncome(chargeable: number): number {
  const ci = Math.max(0, chargeable)
  let tax = 0
  for (let i = 0; i < RESIDENT_BRACKETS.length; i++) {
    const { floor, rate } = RESIDENT_BRACKETS[i]
    if (ci <= floor) break
    const nextFloor = RESIDENT_BRACKETS[i + 1]?.floor ?? Infinity
    const upper = Math.min(ci, nextFloor)
    tax += (upper - floor) * rate
  }
  return round2(tax)
}

// The marginal rate that the *next* dollar of chargeable income is taxed at.
export function marginalRate(chargeable: number): number {
  const ci = Math.max(0, chargeable)
  let rate = 0
  for (const b of RESIDENT_BRACKETS) {
    if (ci >= b.floor) rate = b.rate
    else break
  }
  return rate
}

export interface TaxEstimateInput {
  assessableIncome: number // income after employment expenses, before personal reliefs
  reliefs?: number // existing personal reliefs already claimed (excl. the what-ifs below)
  srsTopUp?: number // planned SRS cash top-up this year
  cpfCashTopUp?: number // planned CPF cash top-up to own retirement savings
  isForeigner?: boolean // affects the SRS relief cap only
}

export interface TaxEstimate {
  chargeableIncome: number
  tax: number
  effectiveRate: number // tax / assessable income
  marginalRate: number
  totalReliefs: number // reliefs actually applied, after the personal cap
  reliefsCapped: boolean
  // Marginal impact of the modelled top-ups vs. claiming none of them.
  taxWithoutTopUps: number
  taxSaved: number
}

// Reliefs are capped in aggregate at PERSONAL_RELIEF_CAP. Each top-up is also
// capped at its own statutory limit first.
function cappedReliefs(input: TaxEstimateInput): { total: number; capped: boolean } {
  const srsCap = input.isForeigner ? SRS_RELIEF_CAP_FOREIGNER : SRS_RELIEF_CAP_SG
  const srs = Math.min(Math.max(0, input.srsTopUp ?? 0), srsCap)
  const cpf = Math.min(Math.max(0, input.cpfCashTopUp ?? 0), CPF_CASH_TOPUP_OWN_CAP)
  const existing = Math.max(0, input.reliefs ?? 0)
  const raw = existing + srs + cpf
  const total = Math.min(raw, PERSONAL_RELIEF_CAP)
  return { total, capped: raw > PERSONAL_RELIEF_CAP }
}

export function estimateTax(input: TaxEstimateInput): TaxEstimate {
  const assessable = Math.max(0, input.assessableIncome)
  const { total: totalReliefs, capped } = cappedReliefs(input)
  const chargeableIncome = Math.max(0, assessable - totalReliefs)
  const tax = taxOnChargeableIncome(chargeableIncome)

  // Baseline: same assessable income and existing reliefs, but none of the
  // modelled top-ups — so "tax saved" isolates the top-ups' effect.
  const baseline = cappedReliefs({ ...input, srsTopUp: 0, cpfCashTopUp: 0 })
  const taxWithoutTopUps = taxOnChargeableIncome(Math.max(0, assessable - baseline.total))

  return {
    chargeableIncome,
    tax,
    effectiveRate: assessable > 0 ? tax / assessable : 0,
    marginalRate: marginalRate(chargeableIncome),
    totalReliefs,
    reliefsCapped: capped,
    taxWithoutTopUps,
    taxSaved: round2(taxWithoutTopUps - tax),
  }
}

// Tithing pool math. The pool accrues `ratePct`% of qualifying income from
// `startDate` onward — by default only Salary-category income, or all income
// when the user widens the base (`incomeCategoryIds` = null). Anything spent
// in the Giving category counts as tithed automatically; manual clearances
// cover tithes given outside tracked accounts (e.g. cash offerings).
// All amounts are in the base currency.

export interface TitheTxn {
  date: string                 // YYYY-MM-DD
  amount: number               // signed, base currency (convert before calling)
  category_id: string | null
}

export interface TitheClearanceInput {
  date: string
  amount: number               // base currency
}

export interface TitheMonth {
  ym: string                   // YYYY-MM
  income: number
  accrued: number              // income * rate
  given: number                // Giving spend + manual clearances that month
}

export interface TitheResult {
  totalIncome: number
  accrued: number              // totalIncome * rate
  givenViaGiving: number       // Giving-category expenses since start
  clearedManually: number      // manual clearance rows since start
  owed: number                 // accrued - given - cleared (negative = ahead)
  byMonth: TitheMonth[]        // ascending, months with any activity
}

export function computeTithe(opts: {
  txns: TitheTxn[]
  transferCategoryIds: Set<string>
  givingCategoryIds: Set<string>
  ratePct: number
  startDate?: string | null
  clearances?: TitheClearanceInput[]
  // Which income counts toward the pool: a set of category ids (e.g. just
  // Salary — the default in the UI), or null/undefined for all income.
  incomeCategoryIds?: Set<string> | null
}): TitheResult {
  const { txns, transferCategoryIds, givingCategoryIds, ratePct, startDate, clearances = [], incomeCategoryIds = null } = opts
  const rate = (Number(ratePct) || 0) / 100
  const months = new Map<string, TitheMonth>()
  const monthOf = (date: string) => date.slice(0, 7)
  const bucket = (ym: string): TitheMonth => {
    let m = months.get(ym)
    if (!m) { m = { ym, income: 0, accrued: 0, given: 0 }; months.set(ym, m) }
    return m
  }

  let totalIncome = 0
  let givenViaGiving = 0

  for (const t of txns) {
    if (startDate && t.date < startDate) continue
    const amt = Number(t.amount) || 0
    if (t.category_id && transferCategoryIds.has(t.category_id)) continue
    if (amt > 0) {
      if (incomeCategoryIds && !(t.category_id && incomeCategoryIds.has(t.category_id))) continue
      totalIncome += amt
      bucket(monthOf(t.date)).income += amt
    } else if (amt < 0 && t.category_id && givingCategoryIds.has(t.category_id)) {
      givenViaGiving += -amt
      bucket(monthOf(t.date)).given += -amt
    }
  }

  let clearedManually = 0
  for (const c of clearances) {
    if (startDate && c.date < startDate) continue
    const amt = Number(c.amount) || 0
    if (amt <= 0) continue
    clearedManually += amt
    bucket(monthOf(c.date)).given += amt
  }

  for (const m of months.values()) m.accrued = m.income * rate

  const accrued = totalIncome * rate
  return {
    totalIncome,
    accrued,
    givenViaGiving,
    clearedManually,
    owed: accrued - givenViaGiving - clearedManually,
    byMonth: Array.from(months.values()).sort((a, b) => a.ym.localeCompare(b.ym)),
  }
}

import type { ProjectionPoint } from './projection'

interface MonthStats { income: number; expense: number; net: number }
type StatsForMonth = (ym: string) => MonthStats

// 'YYYY-MM' -> 'YYYY-MM' one month earlier.
function priorMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function trailingMonths(referenceMonth: string, count: number): string[] {
  const out: string[] = []
  let ym = referenceMonth
  for (let i = 0; i < count; i++) { out.push(ym); ym = priorMonth(ym) }
  return out
}

// True only if every trailing month has zero income AND zero expense — the
// "no data yet" case we want to distinguish from "real months that happened
// to net to zero".
function hasNoData(stats: StatsForMonth, months: string[]): boolean {
  return months.every((ym) => {
    const s = stats(ym)
    return s.income === 0 && s.expense === 0
  })
}

// Average real net savings (income - expense) over the trailing N months.
export function trailingMonthlyNetSavings(
  stats: StatsForMonth,
  referenceMonth: string,
  months = 3,
): number | null {
  const ymList = trailingMonths(referenceMonth, months)
  if (hasNoData(stats, ymList)) return null
  const total = ymList.reduce((s, ym) => s + stats(ym).net, 0)
  return total / months
}

// Sum of real expense over the trailing N months (default 12) — a longer
// window than the savings average above, to smooth seasonal spending rather
// than reacting to a single unusually quiet or heavy month.
export function trailingAnnualExpenses(
  stats: StatsForMonth,
  referenceMonth: string,
  months = 12,
): number | null {
  const ymList = trailingMonths(referenceMonth, months)
  if (hasNoData(stats, ymList)) return null
  return ymList.reduce((s, ym) => s + stats(ym).expense, 0)
}

// FI target = annualExpenses * (100 / swrPct). swrPct=4 -> 25x multiple.
export function fiTarget(annualExpenses: number | null, swrPct: number): number | null {
  if (annualExpenses === null || annualExpenses <= 0) return null
  return annualExpenses * (100 / swrPct)
}

// Walks a monteCarlo() series to find the first month `percentileKey`
// crosses `target`. Returns years (month / 12), or null if it never crosses
// within the series' horizon.
export function yearsToTarget(
  series: ProjectionPoint[],
  percentileKey: 'p5' | 'p50' | 'p95',
  target: number,
): number | null {
  for (const point of series) {
    if (point[percentileKey] >= target) return point.month / 12
  }
  return null
}

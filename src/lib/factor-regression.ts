// Multi-factor regression: portfolio returns vs factor-mimicking ETF returns.
// We use ETF proxies because raw Fama-French factor data isn't easy to fetch
// for free in real time. Each "factor" is approximated by the *excess return*
// of a tilt ETF over a broad-market baseline.
//
// MKT  = SPY (broad market)
// SMB  = IWM - SPY  (small-minus-big)
// HML  = VTV - VUG  (value-minus-growth)
// MOM  = MTUM - SPY (momentum)
// QMJ  = QUAL - SPY (quality)
// MIN  = USMV - SPY (low vol)

export const FACTOR_PROXIES = {
  market:    { tickers: ['SPY'],          label: 'Market (MKT)' },
  size:      { tickers: ['IWM', 'SPY'],   label: 'Size (SMB)' },
  value:     { tickers: ['VTV', 'VUG'],   label: 'Value (HML)' },
  momentum:  { tickers: ['MTUM', 'SPY'],  label: 'Momentum' },
  quality:   { tickers: ['QUAL', 'SPY'],  label: 'Quality' },
  lowvol:    { tickers: ['USMV', 'SPY'],  label: 'Low volatility' },
} as const

export type FactorKey = keyof typeof FACTOR_PROXIES

export const ALL_FACTOR_TICKERS = Array.from(
  new Set(Object.values(FACTOR_PROXIES).flatMap((f) => f.tickers)),
)

export interface FactorLoadings {
  alpha: number          // monthly alpha (%)
  betas: Record<FactorKey, number>
  rSquared: number
  observations: number
}

// Compute monthly returns from daily closes.
function dailyToMonthlyReturns(series: { date: string; close: number }[]): Map<string, number> {
  const byMonth = new Map<string, { date: string; close: number }>()
  for (const p of series) {
    const monthKey = p.date.slice(0, 7)
    const existing = byMonth.get(monthKey)
    if (!existing || p.date > existing.date) byMonth.set(monthKey, p)
  }
  const months = Array.from(byMonth.keys()).sort()
  const out = new Map<string, number>()
  for (let i = 1; i < months.length; i++) {
    const prev = byMonth.get(months[i - 1])!.close
    const curr = byMonth.get(months[i])!.close
    if (prev > 0) out.set(months[i], (curr - prev) / prev)
  }
  return out
}

// Build the factor return series from raw price histories.
export function buildFactorSeries(
  histories: Record<string, { date: string; close: number }[]>,
): Map<string, Record<FactorKey, number>> {
  const monthly: Record<string, Map<string, number>> = {}
  for (const ticker of ALL_FACTOR_TICKERS) {
    monthly[ticker] = dailyToMonthlyReturns(histories[ticker] ?? [])
  }

  // Find common months across all factor proxies
  let common: string[] | null = null
  for (const ticker of ALL_FACTOR_TICKERS) {
    const months = Array.from(monthly[ticker].keys()).sort()
    common = common ? common.filter((m) => monthly[ticker].has(m)) : months
  }
  if (!common) return new Map()

  const out = new Map<string, Record<FactorKey, number>>()
  for (const m of common) {
    const spy = monthly.SPY.get(m) ?? 0
    out.set(m, {
      market:   spy,
      size:    (monthly.IWM.get(m)  ?? 0) - spy,
      value:   (monthly.VTV.get(m)  ?? 0) - (monthly.VUG.get(m) ?? 0),
      momentum:(monthly.MTUM.get(m) ?? 0) - spy,
      quality: (monthly.QUAL.get(m) ?? 0) - spy,
      lowvol:  (monthly.USMV.get(m) ?? 0) - spy,
    })
  }
  return out
}

// Solve a multivariate OLS regression by inverting (X'X). Inputs are arrays
// of equal length: y[t] = portfolio return at month t; X[t] = vector of
// factor returns for that month. Returns alpha + betas + R².
export function olsRegress(
  y: number[],
  X: number[][],     // X[t] = factor row, length k
  factorKeys: FactorKey[],
): FactorLoadings {
  const n = y.length
  if (n < 6 || X.length !== n) {
    return zeroLoadings(factorKeys)
  }
  const k = X[0].length
  // Augment X with intercept column
  const Xa = X.map((row) => [1, ...row])
  const ka = k + 1

  // X'X (ka × ka)
  const XtX = Array.from({ length: ka }, () => new Array(ka).fill(0))
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < ka; r++) {
      for (let c = 0; c < ka; c++) {
        XtX[r][c] += Xa[i][r] * Xa[i][c]
      }
    }
  }
  // X'y (ka)
  const Xty = new Array(ka).fill(0)
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < ka; r++) Xty[r] += Xa[i][r] * y[i]
  }

  const inv = invertMatrix(XtX)
  if (!inv) return zeroLoadings(factorKeys)

  // beta = (X'X)^-1 X'y
  const beta = new Array(ka).fill(0)
  for (let r = 0; r < ka; r++) {
    for (let c = 0; c < ka; c++) beta[r] += inv[r][c] * Xty[c]
  }

  // R² = 1 - RSS / TSS
  const yMean = y.reduce((s, v) => s + v, 0) / n
  let rss = 0, tss = 0
  for (let i = 0; i < n; i++) {
    let yhat = 0
    for (let r = 0; r < ka; r++) yhat += beta[r] * Xa[i][r]
    rss += (y[i] - yhat) ** 2
    tss += (y[i] - yMean) ** 2
  }
  const rSquared = tss > 0 ? 1 - rss / tss : 0

  const betas = {} as Record<FactorKey, number>
  factorKeys.forEach((f, i) => { betas[f] = beta[i + 1] })

  return {
    alpha: beta[0] * 100,        // express in %
    betas,
    rSquared,
    observations: n,
  }
}

// Gauss-Jordan inversion. Returns null if singular.
function invertMatrix(m: number[][]): number[][] | null {
  const n = m.length
  const a = m.map((row, i) => [...row, ...identityRow(i, n)])
  for (let i = 0; i < n; i++) {
    // Pivot
    let pivot = i
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r
    }
    if (Math.abs(a[pivot][i]) < 1e-12) return null
    if (pivot !== i) [a[i], a[pivot]] = [a[pivot], a[i]]
    // Normalize pivot row
    const div = a[i][i]
    for (let c = 0; c < 2 * n; c++) a[i][c] /= div
    // Eliminate other rows
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const factor = a[r][i]
      if (factor === 0) continue
      for (let c = 0; c < 2 * n; c++) a[r][c] -= factor * a[i][c]
    }
  }
  return a.map((row) => row.slice(n))
}

function identityRow(i: number, n: number): number[] {
  const r = new Array(n).fill(0)
  r[i] = 1
  return r
}

function zeroLoadings(factorKeys: FactorKey[]): FactorLoadings {
  const betas = {} as Record<FactorKey, number>
  for (const k of factorKeys) betas[k] = 0
  return { alpha: 0, betas, rSquared: 0, observations: 0 }
}

// Convenience: given the portfolio's monthly returns map and factor series,
// run the full regression.
export function runFactorRegression(
  portfolioReturns: Map<string, number>,
  factorSeries: Map<string, Record<FactorKey, number>>,
): FactorLoadings {
  const factorKeys = Object.keys(FACTOR_PROXIES) as FactorKey[]
  const months = Array.from(portfolioReturns.keys())
    .filter((m) => factorSeries.has(m))
    .sort()
  const y = months.map((m) => portfolioReturns.get(m)!)
  const X = months.map((m) => {
    const row = factorSeries.get(m)!
    return factorKeys.map((k) => row[k])
  })
  return olsRegress(y, X, factorKeys)
}

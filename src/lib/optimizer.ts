// Monte Carlo portfolio optimizer with Markowitz mean-variance math and a
// Sortino alternative. Generates random portfolios uniformly distributed on
// the simplex (Dirichlet(1)), evaluates each on annualized return,
// volatility, Sharpe and Sortino, and identifies the tangency (max-Sharpe),
// max-Sortino, and minimum-variance portfolios. Includes the "Misho
// critique" knobs: users can override expected returns to forward-looking
// estimates instead of using past 10y data.

export interface PortfolioPoint {
  weights: number[]        // length = tickers.length, sum = 1
  expectedReturn: number   // annualized %
  volatility: number       // annualized %
  sharpe: number
  sortino: number
}

export interface OptimizerInputs {
  tickers: string[]
  // Monthly returns matrix, rows = tickers, columns = months. Use a single
  // shared month axis (alignment is done upstream — missing months dropped).
  monthlyReturns: number[][]
  // If supplied, overrides the historical mean for each ticker. Length must
  // match `tickers`. Express in percent annualized terms (e.g. 7 = 7%).
  expectedReturnsAnnualized?: number[]
  riskFreeRatePct: number
  simulations: number
  seed?: number
}

export interface OptimizerResult {
  points: PortfolioPoint[]
  tangency: PortfolioPoint    // max Sharpe
  maxSortino: PortfolioPoint  // max Sortino
  minVol: PortfolioPoint
}

// ── Random generator (Mulberry32) ─────────────────────────────────────────
function makeRng(seed?: number): () => number {
  if (seed === undefined) return Math.random
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Uniform sample on the simplex (Dirichlet(1, ..., 1)) ──────────────────
// Generate n exponentials and normalize. Concentration parameter 1 means
// every weight vector summing to 1 is equally likely.
export function randomWeights(n: number, rng: () => number): number[] {
  const raw = new Array<number>(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    const u = rng() || 1e-12
    const x = -Math.log(u)
    raw[i] = x
    sum += x
  }
  for (let i = 0; i < n; i++) raw[i] /= sum
  return raw
}

// ── Helpers ───────────────────────────────────────────────────────────────
export function annualizedMean(monthlyReturns: number[]): number {
  if (monthlyReturns.length === 0) return 0
  const mean = monthlyReturns.reduce((s, r) => s + r, 0) / monthlyReturns.length
  return mean * 12 * 100  // express as percent
}

// Annualized covariance matrix from monthly returns. Each entry covariance
// of monthlyReturns[i] vs monthlyReturns[j] × 12 (× 100 since returns are
// fractional, we keep raw fractions then ×12 at the end).
export function annualizedCovariance(monthlyReturns: number[][]): number[][] {
  const n = monthlyReturns.length
  if (n === 0) return []
  const m = monthlyReturns[0].length
  const means = monthlyReturns.map((row) => row.reduce((s, r) => s + r, 0) / row.length)
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let acc = 0
      for (let t = 0; t < m; t++) {
        acc += (monthlyReturns[i][t] - means[i]) * (monthlyReturns[j][t] - means[j])
      }
      // Sample covariance × annualization
      const v = (acc / Math.max(1, m - 1)) * 12
      cov[i][j] = v
      cov[j][i] = v
    }
  }
  return cov
}

// Portfolio variance = wᵀ Σ w. Returns the variance (annualized fraction²).
function portfolioVariance(weights: number[], cov: number[][]): number {
  const n = weights.length
  let v = 0
  for (let i = 0; i < n; i++) {
    const wi = weights[i]
    let row = 0
    for (let j = 0; j < n; j++) row += weights[j] * cov[i][j]
    v += wi * row
  }
  return v
}

// Portfolio's monthly return path under a given weight vector. Used to
// compute Sortino (downside-only volatility).
function portfolioMonthlyReturns(
  weights: number[],
  monthlyReturns: number[][],
): number[] {
  const n = weights.length
  const m = monthlyReturns[0]?.length ?? 0
  const out = new Array<number>(m)
  for (let t = 0; t < m; t++) {
    let r = 0
    for (let i = 0; i < n; i++) r += weights[i] * monthlyReturns[i][t]
    out[t] = r
  }
  return out
}

// Annualized downside deviation: only counts months where portfolio return
// fell below `target` (default 0). Annualization is × √12.
function downsideDeviation(returns: number[], target = 0): number {
  if (returns.length === 0) return 0
  let acc = 0
  let count = 0
  for (const r of returns) {
    if (r < target) {
      const d = target - r
      acc += d * d
      count++
    }
  }
  if (count === 0) return 0
  return Math.sqrt(acc / returns.length) * Math.sqrt(12) * 100  // percent
}

// ── Main entry ────────────────────────────────────────────────────────────
export function runOptimizer(inputs: OptimizerInputs): OptimizerResult {
  const { tickers, monthlyReturns, expectedReturnsAnnualized,
    riskFreeRatePct, simulations, seed } = inputs

  const n = tickers.length
  if (n === 0 || monthlyReturns.length !== n) {
    return emptyResult()
  }
  // Validate inner length consistency — pad shorter rows or skip
  const m = Math.min(...monthlyReturns.map((r) => r.length))
  if (m < 6) return emptyResult()
  const aligned = monthlyReturns.map((row) => row.slice(row.length - m))

  // Annualized expected returns: use override if supplied
  const mu: number[] = expectedReturnsAnnualized && expectedReturnsAnnualized.length === n
    ? expectedReturnsAnnualized.slice()
    : aligned.map(annualizedMean)

  // Annualized covariance from raw monthly returns
  const cov = annualizedCovariance(aligned)

  const rng = makeRng(seed)
  const points: PortfolioPoint[] = []
  let tangency: PortfolioPoint | null = null
  let maxSortino: PortfolioPoint | null = null
  let minVol: PortfolioPoint | null = null

  for (let s = 0; s < simulations; s++) {
    const w = randomWeights(n, rng)
    const expRet = w.reduce((acc, wi, i) => acc + wi * mu[i], 0)
    const variance = portfolioVariance(w, cov)
    const vol = Math.sqrt(Math.max(0, variance)) * 100  // percent
    const excess = expRet - riskFreeRatePct
    const sharpe = vol > 0 ? excess / vol : 0
    // Sortino: simulate portfolio monthly path then take downside deviation
    const portfolioPath = portfolioMonthlyReturns(w, aligned)
    const downside = downsideDeviation(portfolioPath, 0)
    const sortino = downside > 0 ? excess / downside : 0

    const point: PortfolioPoint = {
      weights: w,
      expectedReturn: expRet,
      volatility: vol,
      sharpe,
      sortino,
    }
    points.push(point)
    if (!tangency || point.sharpe > tangency.sharpe) tangency = point
    if (!maxSortino || point.sortino > maxSortino.sortino) maxSortino = point
    if (!minVol || point.volatility < minVol.volatility) minVol = point
  }

  return {
    points,
    tangency: tangency ?? emptyPoint(n),
    maxSortino: maxSortino ?? emptyPoint(n),
    minVol: minVol ?? emptyPoint(n),
  }
}

// Score an arbitrary weight vector with the same math (used to plot the
// user's current allocation alongside the Monte Carlo cloud).
export function scorePortfolio(
  weights: number[],
  mu: number[],
  cov: number[][],
  monthlyReturns: number[][],
  riskFreeRatePct: number,
): PortfolioPoint {
  const expRet = weights.reduce((s, w, i) => s + w * mu[i], 0)
  const vol = Math.sqrt(Math.max(0, portfolioVariance(weights, cov))) * 100
  const excess = expRet - riskFreeRatePct
  const sharpe = vol > 0 ? excess / vol : 0
  const path = portfolioMonthlyReturns(weights, monthlyReturns)
  const downside = downsideDeviation(path, 0)
  const sortino = downside > 0 ? excess / downside : 0
  return { weights, expectedReturn: expRet, volatility: vol, sharpe, sortino }
}

// ── Helpers for alignment ─────────────────────────────────────────────────
// Convert raw daily price series → monthly returns (month-end log returns).
// Returns are decimal fractions (0.05 = 5%).
export function dailyToMonthlyReturns(
  series: { date: string; close: number }[],
): { months: string[]; returns: number[] } {
  if (series.length === 0) return { months: [], returns: [] }
  const byMonth = new Map<string, { date: string; close: number }>()
  for (const p of series) {
    const k = p.date.slice(0, 7)
    const existing = byMonth.get(k)
    if (!existing || p.date > existing.date) byMonth.set(k, p)
  }
  const months = Array.from(byMonth.keys()).sort()
  const closes = months.map((m) => byMonth.get(m)!.close)
  const returns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]
    returns.push(prev > 0 ? (closes[i] - prev) / prev : 0)
  }
  return { months: months.slice(1), returns }
}

// Align multiple monthly-return series to the same month range (intersection).
export function alignMonthlyReturns(
  perTicker: Record<string, { months: string[]; returns: number[] }>,
  tickers: string[],
): { months: string[]; matrix: number[][] } {
  // Find the intersection of months across all tickers
  let common: string[] | null = null
  for (const t of tickers) {
    const m = perTicker[t]?.months ?? []
    common = common ? common.filter((x) => m.includes(x)) : [...m]
  }
  common = common ?? []
  const monthsSet = new Set(common)
  const matrix: number[][] = tickers.map((t) => {
    const series = perTicker[t]
    if (!series) return common!.map(() => 0)
    return series.months
      .map((m, i) => ({ m, r: series.returns[i] }))
      .filter((p) => monthsSet.has(p.m))
      .map((p) => p.r)
  })
  return { months: common, matrix }
}

function emptyPoint(n: number): PortfolioPoint {
  return {
    weights: new Array(n).fill(1 / Math.max(1, n)),
    expectedReturn: 0, volatility: 0, sharpe: 0, sortino: 0,
  }
}

function emptyResult(): OptimizerResult {
  return {
    points: [],
    tangency: emptyPoint(0),
    maxSortino: emptyPoint(0),
    minVol: emptyPoint(0),
  }
}

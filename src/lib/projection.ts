// Geometric Brownian Motion Monte Carlo for portfolio projection.
// Each path is simulated month-by-month with a constant monthly contribution
// and lognormal returns drawn from the supplied annual mean / vol.

export interface MonteCarloInputs {
  startingValue: number
  monthlyContribution: number
  expectedAnnualReturnPct: number  // e.g. 7
  expectedAnnualVolPct: number     // e.g. 15
  months: number                   // total months to project
  paths?: number                   // default 1000
  seed?: number                    // optional reproducibility
}

export interface ProjectionPoint {
  month: number          // 0 = today
  date: string           // YYYY-MM
  p5: number             // 5th percentile
  p25: number
  p50: number            // median
  p75: number
  p95: number            // 95th percentile
  expected: number       // deterministic compound (no vol)
}

export interface MonteCarloResult {
  series: ProjectionPoint[]
  successRate: number    // fraction of paths >= target at end (if target supplied)
  finalP50: number
  finalP5: number
  finalP95: number
}

// Box-Muller — generate one standard normal from two uniforms
function gaussian(rng: () => number): number {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Mulberry32 — fast deterministic PRNG when seed is given
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

export function monteCarlo(inputs: MonteCarloInputs, target?: number): MonteCarloResult {
  const {
    startingValue, monthlyContribution,
    expectedAnnualReturnPct, expectedAnnualVolPct,
    months, paths = 1000, seed,
  } = inputs

  const rng = makeRng(seed)
  const muMonthly = expectedAnnualReturnPct / 100 / 12
  const sigmaMonthly = (expectedAnnualVolPct / 100) / Math.sqrt(12)
  // GBM drift adjustment: log-return mean = mu - sigma^2/2
  const drift = muMonthly - 0.5 * sigmaMonthly * sigmaMonthly

  // values[t][p] — simulate paths for t = 0..months
  // To save memory we collect percentiles per month directly.
  const allPaths: number[][] = []
  for (let p = 0; p < paths; p++) {
    let v = startingValue
    const series = new Array(months + 1)
    series[0] = v
    for (let t = 1; t <= months; t++) {
      const z = gaussian(rng)
      const r = Math.exp(drift + sigmaMonthly * z) - 1
      v = v * (1 + r) + monthlyContribution
      series[t] = v
    }
    allPaths.push(series)
  }

  const series: ProjectionPoint[] = []
  const today = new Date()
  for (let t = 0; t <= months; t++) {
    const slice = allPaths.map((s) => s[t]).sort((a, b) => a - b)
    const date = new Date(today.getFullYear(), today.getMonth() + t, 1)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    series.push({
      month: t,
      date: dateStr,
      p5: percentile(slice, 0.05),
      p25: percentile(slice, 0.25),
      p50: percentile(slice, 0.5),
      p75: percentile(slice, 0.75),
      p95: percentile(slice, 0.95),
      expected: deterministic(startingValue, monthlyContribution, muMonthly, t),
    })
  }

  const finalSlice = allPaths.map((s) => s[months]).sort((a, b) => a - b)
  let successRate = 0
  if (target !== undefined) {
    successRate = finalSlice.filter((v) => v >= target).length / paths
  }

  return {
    series,
    successRate,
    finalP50: percentile(finalSlice, 0.5),
    finalP5: percentile(finalSlice, 0.05),
    finalP95: percentile(finalSlice, 0.95),
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))
  return sorted[idx]
}

// Deterministic compound: starting * (1+r)^t + contributions * annuity factor
function deterministic(start: number, monthly: number, r: number, t: number): number {
  if (t === 0) return start
  const grown = start * Math.pow(1 + r, t)
  // FV of an ordinary annuity (contribution at end of each period)
  const annuity = r === 0 ? monthly * t : monthly * (Math.pow(1 + r, t) - 1) / r
  return grown + annuity
}

export function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso)
  const b = new Date(toIso)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

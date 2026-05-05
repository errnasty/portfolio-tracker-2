import { describe, it, expect } from 'vitest'
import {
  olsRegress,
  buildFactorSeries,
  runFactorRegression,
  ALL_FACTOR_TICKERS,
  type FactorKey,
} from '../factor-regression'

describe('olsRegress', () => {
  const factorKeys: FactorKey[] = ['market', 'size', 'value', 'momentum', 'quality', 'lowvol']

  it('returns zeros for too-few observations', () => {
    const result = olsRegress([1, 2, 3], [[0.1], [0.2], [0.3]], ['market'])
    expect(result.observations).toBe(0)
    expect(result.alpha).toBe(0)
  })

  it('recovers known coefficients from synthetic data (single factor)', () => {
    // y = 2 + 1.5x + small noise
    const xs = Array.from({ length: 60 }, (_, i) => (i - 30) / 30)
    const y = xs.map((x) => 2 + 1.5 * x + (Math.sin(x * 7) * 0.001))
    const X = xs.map((x) => [x])
    const result = olsRegress(y, X, ['market'])
    // alpha is in % (× 100 in olsRegress)
    expect(result.alpha).toBeCloseTo(200, 1)
    expect(result.betas.market).toBeCloseTo(1.5, 2)
    expect(result.rSquared).toBeGreaterThan(0.99)
  })

  it('returns very high R² when y is a linear combination of multiple factors', () => {
    const n = 60
    const factors: number[][] = []
    const y: number[] = []
    // Each factor needs distinct variation, otherwise X'X is singular and
    // OLS bails out. Synthesize 6 independent-looking series.
    for (let i = 0; i < n; i++) {
      const m = Math.sin(i / 5)
      const s = Math.cos(i / 7)
      const v = Math.sin(i / 3 + 1)
      const mom = Math.cos(i / 4 + 0.5)
      const q = Math.sin(i / 9 + 2)
      const lv = Math.cos(i / 11 + 1.3)
      factors.push([m, s, v, mom, q, lv])
      // y = 0.5 + 1.0*m + 0.3*s − 0.2*v (mom/q/lv have zero true coefficient)
      y.push(0.5 + 1.0 * m + 0.3 * s - 0.2 * v)
    }
    const result = olsRegress(y, factors, factorKeys)
    expect(result.rSquared).toBeGreaterThan(0.999)
    expect(result.betas.market).toBeCloseTo(1.0, 3)
    expect(result.betas.size).toBeCloseTo(0.3, 3)
    expect(result.betas.value).toBeCloseTo(-0.2, 3)
    // Unspecified factors should regress to ~0
    expect(Math.abs(result.betas.momentum)).toBeLessThan(0.05)
    expect(Math.abs(result.betas.quality)).toBeLessThan(0.05)
  })

  it('returns zero R² when y is uncorrelated noise', () => {
    // Pseudo-random but deterministic
    let seed = 12345
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return (seed / 0x7fffffff) - 0.5
    }
    const X = Array.from({ length: 80 }, () => factorKeys.map(() => rand()))
    const y = Array.from({ length: 80 }, () => rand())
    const result = olsRegress(y, X, factorKeys)
    expect(result.rSquared).toBeLessThan(0.3)
  })
})

describe('buildFactorSeries', () => {
  it('returns empty map when histories are missing', () => {
    const empty = ALL_FACTOR_TICKERS.reduce<Record<string, { date: string; close: number }[]>>(
      (acc, t) => { acc[t] = []; return acc }, {},
    )
    const series = buildFactorSeries(empty)
    expect(series.size).toBe(0)
  })

  it('aligns months across all factor proxies', () => {
    // Build a series of 6 months for every factor ticker
    const months = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06']
    const histories: Record<string, { date: string; close: number }[]> = {}
    for (const ticker of ALL_FACTOR_TICKERS) {
      histories[ticker] = months.map((m, i) => ({
        date: `${m}-28`,
        close: 100 * Math.pow(1.01, i), // 1% per month
      }))
    }
    const series = buildFactorSeries(histories)
    // Excludes the first month (no prior return); 5 monthly returns expected
    expect(series.size).toBe(5)
    const first = series.get('2024-02')
    expect(first?.market).toBeCloseTo(0.01, 4)
    // SMB = IWM − SPY, both up 1% → 0
    expect(first?.size).toBeCloseTo(0, 4)
  })
})

describe('runFactorRegression', () => {
  it('returns zero loadings when factor series is sparse', () => {
    const result = runFactorRegression(new Map(), new Map())
    expect(result.observations).toBe(0)
  })

  it('recovers a synthetic 1.0 market beta', () => {
    // Build factor series with distinct variation per factor so the
    // multivariate OLS is well-posed. Each non-market factor gets small,
    // independent noise — true beta is zero, but the columns aren't constant.
    const months = Array.from({ length: 36 }, (_, i) => {
      const year = 2022 + Math.floor(i / 12)
      const month = (i % 12) + 1
      return `${year}-${String(month).padStart(2, '0')}`
    })
    const factorSeries = new Map<string, Record<FactorKey, number>>()
    const portfolioReturns = new Map<string, number>()
    months.forEach((m, i) => {
      const marketRet = Math.sin(i / 4) * 0.05
      factorSeries.set(m, {
        market: marketRet,
        size:    Math.cos(i / 7) * 0.005,
        value:   Math.sin(i / 3 + 1) * 0.005,
        momentum:Math.cos(i / 5 + 0.5) * 0.005,
        quality: Math.sin(i / 9 + 2) * 0.005,
        lowvol:  Math.cos(i / 11 + 1.3) * 0.005,
      })
      // Portfolio return = 1.0 × market exactly
      portfolioReturns.set(m, marketRet)
    })
    const result = runFactorRegression(portfolioReturns, factorSeries)
    expect(result.betas.market).toBeCloseTo(1.0, 3)
    expect(result.rSquared).toBeGreaterThan(0.99)
  })
})

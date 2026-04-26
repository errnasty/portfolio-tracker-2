// Risk and return metrics computed from daily-close historical price series.
//
// All return-based metrics annualize using 252 trading days. Sharpe/Sortino
// use a configurable risk-free rate (default 4% annualized — adjust for
// current short-term rates).

import type { EnrichedHolding } from '@/types'

const TRADING_DAYS = 252

export type PriceSeries = { date: string; close: number }[]

// ── Series math helpers ───────────────────────────────────────────────────
function dailyReturns(series: PriceSeries): number[] {
  if (series.length < 2) return []
  const out: number[] = []
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].close
    const curr = series[i].close
    if (prev > 0) out.push(curr / prev - 1)
  }
  return out
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) ** 2
  return s / (xs.length - 1) // sample variance
}

function stdDev(xs: number[]): number {
  return Math.sqrt(variance(xs))
}

function downsideDeviation(xs: number[], threshold = 0): number {
  if (xs.length === 0) return 0
  let s = 0
  let n = 0
  for (const x of xs) {
    if (x < threshold) {
      s += (x - threshold) ** 2
      n++
    }
  }
  return n > 0 ? Math.sqrt(s / n) : 0
}

function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  let s = 0
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb)
  return s / (n - 1)
}

function maxDrawdown(series: PriceSeries): { drawdown: number; peakDate?: string; troughDate?: string } {
  if (series.length === 0) return { drawdown: 0 }
  let peak = series[0].close
  let peakDate = series[0].date
  let maxDd = 0
  let ddPeakDate = peakDate
  let ddTroughDate = peakDate
  let runningPeakDate = peakDate
  for (const point of series) {
    if (point.close > peak) {
      peak = point.close
      runningPeakDate = point.date
    }
    const dd = peak > 0 ? (point.close - peak) / peak : 0
    if (dd < maxDd) {
      maxDd = dd
      ddPeakDate = runningPeakDate
      ddTroughDate = point.date
    }
  }
  return { drawdown: maxDd, peakDate: ddPeakDate, troughDate: ddTroughDate }
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)))
  return sorted[idx]
}

// ── Portfolio series construction ─────────────────────────────────────────
// Build a portfolio price series from per-ticker history weighted by current
// market value. We use today's weights as a proxy — this is a "holdings-as-of"
// backtest, not a money-weighted return. It's the standard approach when
// you don't have transaction history.
export function buildPortfolioSeries(
  enriched: EnrichedHolding[],
  history: Record<string, PriceSeries>,
): PriceSeries {
  const totalValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  if (totalValue <= 0) return []

  const weights = new Map<string, number>()
  for (const h of enriched) {
    if (history[h.ticker] && history[h.ticker].length > 0) {
      weights.set(h.ticker, h.currentValueBase / totalValue)
    }
  }
  if (weights.size === 0) return []

  // Find the union of dates that all weighted tickers share
  const dateSets: Set<string>[] = []
  for (const ticker of Array.from(weights.keys())) {
    dateSets.push(new Set(history[ticker].map((p) => p.date)))
  }
  // Intersect — only dates present across all series (so weights stay normalized)
  const sharedDates = Array.from(dateSets[0]).filter((d) => dateSets.every((s) => s.has(d)))
  sharedDates.sort()
  if (sharedDates.length === 0) return []

  // For each ticker, normalize its series to start at 1.0 on the first shared date
  const normalized = new Map<string, Map<string, number>>()
  for (const ticker of Array.from(weights.keys())) {
    const seriesMap = new Map(history[ticker].map((p) => [p.date, p.close]))
    const first = seriesMap.get(sharedDates[0]) ?? 0
    if (first <= 0) continue
    const normMap = new Map<string, number>()
    for (const d of sharedDates) {
      const c = seriesMap.get(d)
      if (c !== undefined) normMap.set(d, c / first)
    }
    normalized.set(ticker, normMap)
  }

  // Sum weighted normalized values per date — this gives a portfolio index
  // that starts at 1.0 and tracks the weighted-average return path.
  const portfolio: PriceSeries = []
  const totalW = Array.from(weights.values()).reduce((s, w) => s + w, 0)
  for (const date of sharedDates) {
    let val = 0
    for (const [ticker, w] of Array.from(weights.entries())) {
      const v = normalized.get(ticker)?.get(date)
      if (v !== undefined) val += (w / totalW) * v
    }
    portfolio.push({ date, close: val })
  }
  return portfolio
}

// ── Public metric API ─────────────────────────────────────────────────────
export interface RiskMetrics {
  // Return metrics
  totalReturnPct: number       // (1 + r1)(1 + r2)... - 1, over the window
  cagr: number                 // annualized total return
  meanDailyReturn: number      // arithmetic mean of daily returns
  // Risk metrics
  annualizedVol: number        // stddev × √252
  downsideVol: number          // downside deviation × √252
  maxDrawdownPct: number       // negative number, e.g. -0.18 for -18%
  drawdownPeakDate?: string
  drawdownTroughDate?: string
  // Risk-adjusted
  sharpeRatio: number          // (annual_return - rf) / annual_vol
  sortinoRatio: number         // (annual_return - rf) / downside_vol
  calmarRatio: number          // cagr / |maxDrawdown|
  // Tail risk
  var95: number                // 5th-percentile daily return (loss boundary)
  cvar95: number               // expected loss when in the worst 5% tail
  // Day stats
  bestDay: number
  worstDay: number
  positiveDayPct: number       // % of days with positive return
  // vs benchmark (optional)
  beta?: number
  alpha?: number               // Jensen's alpha, annualized
  correlation?: number
  trackingError?: number       // annualized stdev of (port - bench) returns
  informationRatio?: number    // (port_return - bench_return) / tracking_error
  // Meta
  observations: number
  startDate?: string
  endDate?: string
}

export function computeRiskMetrics(
  portfolio: PriceSeries,
  benchmark?: PriceSeries,
  riskFreeAnnual = 0.04,
): RiskMetrics | null {
  if (portfolio.length < 5) return null

  const r = dailyReturns(portfolio)
  if (r.length < 2) return null

  const totalReturn = portfolio[portfolio.length - 1].close / portfolio[0].close - 1
  const years = r.length / TRADING_DAYS
  const cagr = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0

  const meanR = mean(r)
  const annualReturn = meanR * TRADING_DAYS
  const dailyVol = stdDev(r)
  const annualizedVol = dailyVol * Math.sqrt(TRADING_DAYS)
  const dsd = downsideDeviation(r, 0)
  const downsideVol = dsd * Math.sqrt(TRADING_DAYS)

  const dd = maxDrawdown(portfolio)
  const sharpe = annualizedVol > 0 ? (annualReturn - riskFreeAnnual) / annualizedVol : 0
  const sortino = downsideVol > 0 ? (annualReturn - riskFreeAnnual) / downsideVol : 0
  const calmar = dd.drawdown < 0 ? cagr / Math.abs(dd.drawdown) : 0

  const v95 = percentile(r, 0.05)
  const tail = r.filter((x) => x <= v95)
  const cvar = tail.length > 0 ? mean(tail) : v95
  const bestDay = Math.max(...r)
  const worstDay = Math.min(...r)
  const positiveDayPct = r.filter((x) => x > 0).length / r.length

  const result: RiskMetrics = {
    totalReturnPct: totalReturn,
    cagr,
    meanDailyReturn: meanR,
    annualizedVol,
    downsideVol,
    maxDrawdownPct: dd.drawdown,
    drawdownPeakDate: dd.peakDate,
    drawdownTroughDate: dd.troughDate,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    calmarRatio: calmar,
    var95: v95,
    cvar95: cvar,
    bestDay,
    worstDay,
    positiveDayPct,
    observations: r.length,
    startDate: portfolio[0].date,
    endDate: portfolio[portfolio.length - 1].date,
  }

  if (benchmark && benchmark.length >= 5) {
    // Align benchmark to portfolio dates so cov/correlation are paired
    const benchMap = new Map(benchmark.map((p) => [p.date, p.close]))
    const aligned: PriceSeries = []
    for (const p of portfolio) {
      const v = benchMap.get(p.date)
      if (v !== undefined) aligned.push({ date: p.date, close: v })
    }
    if (aligned.length >= 5) {
      const rb = dailyReturns(aligned)
      const rp = r.slice(r.length - rb.length) // align return-array lengths
      const cov = covariance(rp, rb)
      const varB = variance(rb)
      const beta = varB > 0 ? cov / varB : 0
      const benchAnnual = mean(rb) * TRADING_DAYS
      const alpha = annualReturn - (riskFreeAnnual + beta * (benchAnnual - riskFreeAnnual))
      const corr = stdDev(rp) > 0 && stdDev(rb) > 0
        ? cov / (stdDev(rp) * stdDev(rb))
        : 0
      const diff = rp.map((x, i) => x - rb[i])
      const te = stdDev(diff) * Math.sqrt(TRADING_DAYS)
      const ir = te > 0 ? (annualReturn - benchAnnual) / te : 0
      result.beta = beta
      result.alpha = alpha
      result.correlation = corr
      result.trackingError = te
      result.informationRatio = ir
    }
  }

  return result
}

// Helper: ticker × ticker correlation matrix from price histories
export function correlationMatrix(
  tickers: string[],
  history: Record<string, PriceSeries>,
): { tickers: string[]; matrix: number[][] } {
  // Build aligned daily-return arrays for each ticker
  const dateSets = tickers.map((t) => new Set((history[t] ?? []).map((p) => p.date)))
  const shared = dateSets.length > 0
    ? Array.from(dateSets[0]).filter((d) => dateSets.every((s) => s.has(d)))
    : []
  shared.sort()

  const returns: Record<string, number[]> = {}
  for (const t of tickers) {
    const map = new Map((history[t] ?? []).map((p) => [p.date, p.close]))
    const aligned: PriceSeries = shared
      .map((d) => ({ date: d, close: map.get(d) ?? 0 }))
      .filter((p) => p.close > 0)
    returns[t] = dailyReturns(aligned)
  }

  const n = tickers.length
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1
        continue
      }
      const ri = returns[tickers[i]] ?? []
      const rj = returns[tickers[j]] ?? []
      const len = Math.min(ri.length, rj.length)
      if (len < 2) {
        matrix[i][j] = 0
        continue
      }
      const a = ri.slice(0, len)
      const b = rj.slice(0, len)
      const sa = stdDev(a)
      const sb = stdDev(b)
      matrix[i][j] = sa > 0 && sb > 0 ? covariance(a, b) / (sa * sb) : 0
    }
  }
  return { tickers, matrix }
}

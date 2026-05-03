// Backtest a fixed-weight portfolio against historical monthly closes.
// Annual rebalancing back to target weights. Tickers with missing data
// for a given month are dropped and the remaining weights re-normalized.

export interface BacktestPosition {
  ticker: string
  pct: number   // 0–100, weights need not sum to 100 (will be normalized)
}

export interface PriceHistory {
  ticker: string
  series: { date: string; close: number }[]
}

export interface BacktestPoint {
  date: string   // YYYY-MM-DD (month-end)
  value: number  // portfolio value (or normalized index when no DCA)
  invested: number  // cumulative dollars contributed up to this point
}

export interface BacktestResult {
  series: BacktestPoint[]
  cagrPct: number          // time-weighted compound growth
  totalReturnPct: number   // (final / starting) - 1, time-weighted
  moneyWeightedReturnPct: number  // (final - invested) / invested — true ROI on DCA capital
  maxDrawdownPct: number
  volPct: number           // annualized monthly vol (×√12)
  sharpe: number           // assuming 0% rf
  bestMonthPct: number
  worstMonthPct: number
  monthsCovered: number
  startDate: string
  endDate: string
  totalInvested: number    // starting + sum of contributions
  finalValue: number
}

// Resample daily series → month-end closes, keyed by YYYY-MM
function toMonthEndCloses(series: { date: string; close: number }[]): Map<string, number> {
  const byMonth = new Map<string, { date: string; close: number }>()
  for (const point of series) {
    const monthKey = point.date.slice(0, 7)
    const existing = byMonth.get(monthKey)
    if (!existing || point.date > existing.date) {
      byMonth.set(monthKey, point)
    }
  }
  const out = new Map<string, number>()
  byMonth.forEach((v, k) => out.set(k, v.close))
  return out
}

export interface BacktestOptions {
  rebalanceMonths?: number      // default 12
  monthlyContribution?: number  // default 0; deployed per target weight each month
  startingValue?: number        // default 100 (index)
}

export function runBacktest(
  positions: BacktestPosition[],
  histories: Record<string, PriceHistory>,
  optsOrRebalance: BacktestOptions | number = {},
): BacktestResult {
  // Backward-compat: callers used to pass `rebalanceMonths` as a number.
  const opts: BacktestOptions = typeof optsOrRebalance === 'number'
    ? { rebalanceMonths: optsOrRebalance }
    : optsOrRebalance
  const rebalanceMonths = opts.rebalanceMonths ?? 12
  const monthlyContribution = Math.max(0, opts.monthlyContribution ?? 0)
  const startingValue = opts.startingValue ?? 100
  const valid = positions.filter((p) => p.pct > 0 && histories[p.ticker]?.series.length)
  if (valid.length === 0) {
    return emptyResult()
  }

  // Convert each ticker's series to month-end closes
  const closesByTicker = new Map<string, Map<string, number>>()
  for (const p of valid) {
    closesByTicker.set(p.ticker, toMonthEndCloses(histories[p.ticker].series))
  }

  // Determine month overlap — months where every ticker has data
  // (We allow tickers with later inception by dropping & renormalizing
  // when missing — but easier first pass: intersect all months.)
  const tickerMaps: Map<string, number>[] = Array.from(closesByTicker.values())
  let commonMonths: string[] = Array.from(tickerMaps[0].keys()).sort()
  for (let i = 1; i < tickerMaps.length; i++) {
    const m = tickerMaps[i]
    commonMonths = commonMonths.filter((x) => m.has(x))
  }
  if (commonMonths.length < 2) {
    return emptyResult()
  }

  const totalWeight = valid.reduce((s, p) => s + p.pct, 0)
  const weights = new Map<string, number>(valid.map((p) => [p.ticker, p.pct / totalWeight]))

  // Simulate. Hold each ticker's share count; rebalance every N months and
  // optionally add a fixed monthly contribution split per target weight.
  const startValue = startingValue
  let portfolioValue = startValue
  let invested = startValue
  const shares = new Map<string, number>()
  // Initial allocation
  for (const p of valid) {
    const startClose = closesByTicker.get(p.ticker)!.get(commonMonths[0])!
    const dollarAmount = portfolioValue * weights.get(p.ticker)!
    shares.set(p.ticker, dollarAmount / startClose)
  }

  const series: BacktestPoint[] = [{
    date: monthEndDate(commonMonths[0]),
    value: portfolioValue,
    invested,
  }]
  const monthlyReturns: number[] = []

  for (let i = 1; i < commonMonths.length; i++) {
    const month = commonMonths[i]
    // Mark-to-market the existing position
    let valueBefore = 0
    for (const p of valid) {
      const close = closesByTicker.get(p.ticker)!.get(month)!
      valueBefore += (shares.get(p.ticker) ?? 0) * close
    }
    // Time-weighted return ignores contributions: it measures growth of
    // existing capital from the previous month to this month BEFORE the
    // new contribution is added.
    const ret = portfolioValue > 0 ? (valueBefore - portfolioValue) / portfolioValue : 0
    monthlyReturns.push(ret)

    // Apply monthly contribution at month-end (DCA): buy each ticker
    // worth `contribution × targetWeight` at the current month's close.
    if (monthlyContribution > 0) {
      for (const p of valid) {
        const close = closesByTicker.get(p.ticker)!.get(month)!
        const buyDollars = monthlyContribution * weights.get(p.ticker)!
        const addedShares = buyDollars / close
        shares.set(p.ticker, (shares.get(p.ticker) ?? 0) + addedShares)
      }
      invested += monthlyContribution
    }

    // Recompute value after contribution
    let value = 0
    for (const p of valid) {
      const close = closesByTicker.get(p.ticker)!.get(month)!
      value += (shares.get(p.ticker) ?? 0) * close
    }
    portfolioValue = value
    series.push({ date: monthEndDate(month), value, invested })

    // Rebalance every N months
    if (i % rebalanceMonths === 0) {
      for (const p of valid) {
        const close = closesByTicker.get(p.ticker)!.get(month)!
        const target = portfolioValue * weights.get(p.ticker)!
        shares.set(p.ticker, target / close)
      }
    }
  }

  // Metrics — time-weighted (independent of contribution timing)
  // We chain the monthly returns for true TWR.
  const twrFactor = monthlyReturns.reduce((acc, r) => acc * (1 + r), 1)
  const totalReturnPct = (twrFactor - 1) * 100
  const years = (series.length - 1) / 12
  const cagrPct = years > 0 ? (Math.pow(twrFactor, 1 / years) - 1) * 100 : 0
  // Money-weighted: simple ROI on capital deployed.
  const moneyWeightedReturnPct = invested > 0 ? ((portfolioValue - invested) / invested) * 100 : 0

  // Max drawdown
  let peak = series[0].value
  let maxDD = 0
  for (const p of series) {
    if (p.value > peak) peak = p.value
    const dd = peak > 0 ? (p.value - peak) / peak : 0
    if (dd < maxDD) maxDD = dd
  }

  // Vol & Sharpe
  const meanRet = monthlyReturns.length > 0 ? monthlyReturns.reduce((s, r) => s + r, 0) / monthlyReturns.length : 0
  const variance = monthlyReturns.length > 1
    ? monthlyReturns.reduce((s, r) => s + (r - meanRet) * (r - meanRet), 0) / (monthlyReturns.length - 1)
    : 0
  const volMonthly = Math.sqrt(variance)
  const volAnnual = volMonthly * Math.sqrt(12)
  const sharpe = volAnnual > 0 ? (cagrPct / 100) / volAnnual : 0

  return {
    series,
    cagrPct,
    totalReturnPct,
    moneyWeightedReturnPct,
    maxDrawdownPct: maxDD * 100,
    volPct: volAnnual * 100,
    sharpe,
    bestMonthPct: monthlyReturns.length ? Math.max(...monthlyReturns) * 100 : 0,
    worstMonthPct: monthlyReturns.length ? Math.min(...monthlyReturns) * 100 : 0,
    monthsCovered: series.length,
    startDate: series[0].date,
    endDate: series[series.length - 1].date,
    totalInvested: invested,
    finalValue: portfolioValue,
  }
}

function monthEndDate(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${yyyymm}-${String(lastDay).padStart(2, '0')}`
}

function emptyResult(): BacktestResult {
  return {
    series: [],
    cagrPct: 0,
    totalReturnPct: 0,
    moneyWeightedReturnPct: 0,
    maxDrawdownPct: 0,
    volPct: 0,
    sharpe: 0,
    bestMonthPct: 0,
    worstMonthPct: 0,
    monthsCovered: 0,
    startDate: '',
    endDate: '',
    totalInvested: 0,
    finalValue: 0,
  }
}

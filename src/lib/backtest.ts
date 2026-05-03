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
  date: string  // YYYY-MM-DD (month-end)
  value: number  // normalized index, starts at 100
}

export interface BacktestResult {
  series: BacktestPoint[]
  cagrPct: number
  totalReturnPct: number
  maxDrawdownPct: number
  volPct: number          // annualized monthly vol (×√12)
  sharpe: number          // assuming 0% rf for simplicity
  bestMonthPct: number
  worstMonthPct: number
  monthsCovered: number
  startDate: string
  endDate: string
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

export function runBacktest(
  positions: BacktestPosition[],
  histories: Record<string, PriceHistory>,
  rebalanceMonths = 12,
): BacktestResult {
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

  // Simulate. Start at index value 100. Hold each ticker's share count;
  // rebalance every `rebalanceMonths`.
  const startValue = 100
  let portfolioValue = startValue
  const shares = new Map<string, number>()
  // Initial allocation
  for (const p of valid) {
    const startClose = closesByTicker.get(p.ticker)!.get(commonMonths[0])!
    const dollarAmount = portfolioValue * weights.get(p.ticker)!
    shares.set(p.ticker, dollarAmount / startClose)
  }

  const series: BacktestPoint[] = [{ date: monthEndDate(commonMonths[0]), value: portfolioValue }]
  const monthlyReturns: number[] = []

  for (let i = 1; i < commonMonths.length; i++) {
    const month = commonMonths[i]
    let value = 0
    for (const p of valid) {
      const close = closesByTicker.get(p.ticker)!.get(month)!
      value += (shares.get(p.ticker) ?? 0) * close
    }
    const ret = portfolioValue > 0 ? (value - portfolioValue) / portfolioValue : 0
    monthlyReturns.push(ret)
    portfolioValue = value
    series.push({ date: monthEndDate(month), value })

    // Rebalance every N months
    if (i % rebalanceMonths === 0) {
      for (const p of valid) {
        const close = closesByTicker.get(p.ticker)!.get(month)!
        const target = portfolioValue * weights.get(p.ticker)!
        shares.set(p.ticker, target / close)
      }
    }
  }

  // Metrics
  const totalReturnPct = ((portfolioValue / startValue) - 1) * 100
  const years = (series.length - 1) / 12
  const cagrPct = years > 0 ? (Math.pow(portfolioValue / startValue, 1 / years) - 1) * 100 : 0

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
    maxDrawdownPct: maxDD * 100,
    volPct: volAnnual * 100,
    sharpe,
    bestMonthPct: monthlyReturns.length ? Math.max(...monthlyReturns) * 100 : 0,
    worstMonthPct: monthlyReturns.length ? Math.min(...monthlyReturns) * 100 : 0,
    monthsCovered: series.length,
    startDate: series[0].date,
    endDate: series[series.length - 1].date,
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
    maxDrawdownPct: 0,
    volPct: 0,
    sharpe: 0,
    bestMonthPct: 0,
    worstMonthPct: 0,
    monthsCovered: 0,
    startDate: '',
    endDate: '',
  }
}

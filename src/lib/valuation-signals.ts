// Selling-discipline signal definitions. Each signal has a default threshold
// and a function that returns true when the metric crosses it. The set
// covers the "valuation has run too hot" and "momentum overextended" cases
// that retail investors most often miss.

export interface RawMetrics {
  ticker: string
  price: number
  // From quoteSummary.summaryDetail / defaultKeyStatistics
  trailingPE?: number
  forwardPE?: number
  priceToBook?: number
  priceToSales?: number
  dividendYield?: number  // fraction, e.g. 0.018 = 1.8%
  // Computed from price history
  rsi14?: number          // 0-100
  sma50?: number
  sma200?: number
  high52w?: number
  low52w?: number
  drawdownFromHigh?: number  // fraction, negative = below high
  yearChange?: number      // 1y price change fraction
}

export type SignalSeverity = 'info' | 'warning' | 'critical' | 'opportunity'

export interface SignalDefinition {
  id: string
  label: string
  description: string
  // The default threshold the user might override
  defaultThreshold: number
  // 'gt' fires when metric > threshold, 'lt' fires when metric < threshold
  direction: 'gt' | 'lt'
  // Read the metric to compare from the raw bundle
  read: (m: RawMetrics) => number | undefined
  // How to render the value (e.g. "32.4x", "82%", "−18%")
  format: (v: number) => string
  severity: SignalSeverity
  // Plain-English reasoning for the user
  rationale: string
}

export const SIGNAL_DEFINITIONS: SignalDefinition[] = [
  // ── Valuation ──────────────────────────────────────────────────────────
  {
    id: 'pe_extreme',
    label: 'Trailing P/E above threshold',
    description: 'Earnings multiple sits well above the long-run average for broad equity (~16x).',
    defaultThreshold: 35,
    direction: 'gt',
    read: (m) => m.trailingPE,
    format: (v) => `${v.toFixed(1)}x`,
    severity: 'warning',
    rationale: 'A trailing P/E above 35 implies the market is pricing 35 years of current earnings as fair value. Historically, these multiples revert — either prices fall, earnings catch up over time, or both. For broad-market ETFs like QQQ or SPY, P/E spikes above the long-run average have preceded significant pullbacks.',
  },
  {
    id: 'forward_pe_extreme',
    label: 'Forward P/E above threshold',
    description: 'Even on optimistic forward earnings, the multiple is stretched.',
    defaultThreshold: 30,
    direction: 'gt',
    read: (m) => m.forwardPE,
    format: (v) => `${v.toFixed(1)}x`,
    severity: 'warning',
    rationale: 'Forward P/E uses next-12-months estimated earnings, which are typically higher than trailing. If even that ratio is elevated, analysts are already baking in growth — leaving little room for upside surprise and lots of room for disappointment.',
  },
  {
    id: 'pb_high',
    label: 'Price-to-Book above threshold',
    description: 'Premium over accounting net worth is unusually wide.',
    defaultThreshold: 5,
    direction: 'gt',
    read: (m) => m.priceToBook,
    format: (v) => `${v.toFixed(1)}x`,
    severity: 'info',
    rationale: 'P/B > 5 historically signals expensive valuations relative to assets. Less meaningful for tech/services (asset-light businesses) but useful for diversified ETFs and banks/REITs.',
  },

  // ── Momentum / overextension ──────────────────────────────────────────
  {
    id: 'rsi_overbought',
    label: 'RSI(14) overbought',
    description: '14-day Relative Strength Index above the standard overbought line.',
    defaultThreshold: 75,
    direction: 'gt',
    read: (m) => m.rsi14,
    format: (v) => `${v.toFixed(0)}`,
    severity: 'info',
    rationale: 'RSI(14) measures recent up-day vs down-day strength. Readings above 70 are conventionally "overbought" — not a sell signal on its own, but a sign that the rally is mature and a pullback or pause is statistically more likely.',
  },
  {
    id: 'extended_above_sma200',
    label: 'Price ≥ X% above 200-day SMA',
    description: 'Price is significantly stretched above its long-term trend line.',
    defaultThreshold: 25,  // percent
    direction: 'gt',
    read: (m) => (m.sma200 && m.sma200 > 0) ? ((m.price - m.sma200) / m.sma200) * 100 : undefined,
    format: (v) => `+${v.toFixed(1)}%`,
    severity: 'warning',
    rationale: 'When price runs 25%+ above the 200-day moving average, history suggests mean reversion is likely within a year. The 200-day SMA acts as a magnet over long horizons. Useful for trend-following exits.',
  },
  {
    id: 'big_1y_runup',
    label: '1-year price gain > threshold',
    description: 'The asset has rallied unusually hard in the past 12 months.',
    defaultThreshold: 60,  // percent
    direction: 'gt',
    read: (m) => m.yearChange !== undefined ? m.yearChange * 100 : undefined,
    format: (v) => `+${v.toFixed(0)}%`,
    severity: 'info',
    rationale: 'A 60%+ gain in 12 months is rare and often partially gives back. Doesn\'t mean sell, but does mean trimming for rebalancing and re-checking your investment thesis is warranted.',
  },

  // ── Income signals ────────────────────────────────────────────────────
  {
    id: 'yield_compressed',
    label: 'Dividend yield below historical floor',
    description: 'Yield compression usually means price ran up faster than dividend growth.',
    defaultThreshold: 1,  // percent — yield below this is "expensive"
    direction: 'lt',
    read: (m) => m.dividendYield !== undefined ? m.dividendYield * 100 : undefined,
    format: (v) => `${v.toFixed(2)}%`,
    severity: 'info',
    rationale: 'When a dividend-paying asset\'s yield drops below its historical average, it means price growth outpaced dividend growth. Sometimes justified (genuinely better business), often a sign the asset is expensive vs its income stream.',
  },

  // ── Buy-the-dip / opportunity signals ─────────────────────────────────
  {
    id: 'large_drawdown',
    label: 'Drawdown from 52w high',
    description: 'Asset is significantly below its recent high — potential rebalancing opportunity.',
    defaultThreshold: -20,  // percent
    direction: 'lt',
    read: (m) => m.drawdownFromHigh !== undefined ? m.drawdownFromHigh * 100 : undefined,
    format: (v) => `${v.toFixed(1)}%`,
    severity: 'opportunity',
    rationale: 'A 20%+ drawdown from the 52-week high is "bear-market territory" for that asset. If your conviction in the underlying thesis is intact, this is when most professionals add — buying low rather than selling low.',
  },
  {
    id: 'rsi_oversold',
    label: 'RSI(14) oversold',
    description: '14-day Relative Strength Index below the standard oversold line.',
    defaultThreshold: 25,
    direction: 'lt',
    read: (m) => m.rsi14,
    format: (v) => `${v.toFixed(0)}`,
    severity: 'opportunity',
    rationale: 'RSI below 30 historically marks short-term capitulation lows. Not a guarantee of a rebound, but historically a better time to add than to sell.',
  },
]

// Evaluate one ticker against all signals. Returns the subset that fired.
export interface FiredSignal {
  signalId: string
  ticker: string
  value: number
  threshold: number
  severity: SignalSeverity
  label: string
  description: string
  rationale: string
  formatted: string  // pre-formatted value for display
}

export function evaluateSignals(
  metrics: RawMetrics,
  thresholdOverrides: Record<string, number> = {},
): FiredSignal[] {
  const fired: FiredSignal[] = []
  for (const def of SIGNAL_DEFINITIONS) {
    const value = def.read(metrics)
    if (value === undefined || isNaN(value)) continue
    const threshold = thresholdOverrides[def.id] ?? def.defaultThreshold
    const triggered = def.direction === 'gt' ? value > threshold : value < threshold
    if (!triggered) continue
    fired.push({
      signalId: def.id,
      ticker: metrics.ticker,
      value,
      threshold,
      severity: def.severity,
      label: def.label,
      description: def.description,
      rationale: def.rationale,
      formatted: def.format(value),
    })
  }
  return fired
}

// ── Helpers for computing metrics from daily price history ────────────────
export function computeRsi14(closes: number[]): number | undefined {
  if (closes.length < 15) return undefined
  // Wilder's smoothing
  let gains = 0
  let losses = 0
  for (let i = 1; i <= 14; i++) {
    const delta = closes[i] - closes[i - 1]
    if (delta >= 0) gains += delta; else losses -= delta
  }
  let avgG = gains / 14
  let avgL = losses / 14
  for (let i = 15; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1]
    const g = delta > 0 ? delta : 0
    const l = delta < 0 ? -delta : 0
    avgG = (avgG * 13 + g) / 14
    avgL = (avgL * 13 + l) / 14
  }
  if (avgL === 0) return 100
  const rs = avgG / avgL
  return 100 - 100 / (1 + rs)
}

export function computeSma(closes: number[], window: number): number | undefined {
  if (closes.length < window) return undefined
  let sum = 0
  for (let i = closes.length - window; i < closes.length; i++) sum += closes[i]
  return sum / window
}

export function computeMetricsFromPrices(
  closes: number[],
): Pick<RawMetrics, 'rsi14' | 'sma50' | 'sma200' | 'high52w' | 'low52w' | 'drawdownFromHigh' | 'yearChange'> {
  const last = closes[closes.length - 1]
  // Last ~252 trading days = 1 year
  const yearWindow = closes.slice(Math.max(0, closes.length - 252))
  const high52w = yearWindow.length > 0 ? Math.max(...yearWindow) : undefined
  const low52w = yearWindow.length > 0 ? Math.min(...yearWindow) : undefined
  const drawdownFromHigh = high52w && high52w > 0 ? (last - high52w) / high52w : undefined
  const yearAgo = yearWindow[0]
  const yearChange = yearAgo > 0 ? (last - yearAgo) / yearAgo : undefined
  return {
    rsi14: computeRsi14(closes),
    sma50: computeSma(closes, 50),
    sma200: computeSma(closes, 200),
    high52w,
    low52w,
    drawdownFromHigh,
    yearChange,
  }
}

export const SEVERITY_ORDER: SignalSeverity[] = ['critical', 'warning', 'opportunity', 'info']

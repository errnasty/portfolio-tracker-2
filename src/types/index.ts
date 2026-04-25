export type Currency = 'USD' | 'SGD' | 'EUR'

export interface Holding {
  id: string
  user_id: string
  ticker: string
  name: string | null
  shares: number
  cost_basis_per_share: number
  cost_basis_currency: Currency
  created_at: string
  updated_at: string
}

export interface HoldingFormData {
  ticker: string
  name: string
  shares: string
  cost_basis_per_share: string
  cost_basis_currency: Currency
}

export interface PriceQuote {
  ticker: string
  price: number
  currency: string
  change: number
  changePercent: number
  longName?: string
}

export interface FxRates {
  base: Currency
  rates: Record<string, number>
}

export interface EnrichedHolding extends Holding {
  currentPrice: number
  priceCurrency: string
  currentValueBase: number
  costBasisBase: number
  gainLoss: number
  gainLossPct: number
  dayChange: number
  dayChangePct: number
  allocationPct: number
}

export interface PortfolioStats {
  totalValue: number
  totalCost: number
  totalGainLoss: number
  totalGainLossPct: number
  totalDayChange: number
  totalDayChangePct: number
  baseCurrency: Currency
}

export interface HistoricalPoint {
  date: string
  value: number
}

export interface BenchmarkConfig {
  ticker: string
  name: string
}

export interface TargetAllocation {
  id: string
  user_id: string
  ticker: string
  target_pct: number
}

export interface UserSettings {
  user_id: string
  base_currency: Currency
}

export interface RebalanceRecommendation {
  ticker: string
  name: string
  currentValue: number
  targetValue: number
  currentPct: number
  targetPct: number
  delta: number
  sharesToTrade: number
  action: 'buy' | 'sell' | 'hold'
  currentPrice: number
}

export const DEFAULT_BENCHMARKS: BenchmarkConfig[] = [
  { ticker: 'SPY', name: 'S&P 500' },
  { ticker: 'QQQ', name: 'NASDAQ 100' },
  { ticker: 'VTI', name: 'US Total Market' },
  { ticker: 'VEA', name: 'Developed Markets ex-US' },
  { ticker: 'EWS', name: 'Singapore (STI proxy)' },
]

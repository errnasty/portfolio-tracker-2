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
  totalValue: number          // holdings + cash, in base currency
  holdingsValue: number       // holdings only, in base currency
  cashValue: number           // cash total, in base currency
  totalCost: number
  totalGainLoss: number
  totalGainLossPct: number
  totalDayChange: number
  totalDayChangePct: number
  baseCurrency: Currency
}

export interface CashBalance {
  id: string
  user_id: string
  currency: Currency | string
  balance: number
  notes: string | null
  created_at: string
  updated_at: string
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
  tolerance_pct?: number
}

export type TransactionType = 'buy' | 'sell' | 'dividend' | 'split'

export interface Transaction {
  id: string
  user_id: string
  ticker: string
  type: TransactionType
  date: string
  shares: number
  price_per_share: number
  amount: number
  currency: Currency | string
  fees: number
  split_ratio: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TransactionFormData {
  ticker: string
  type: TransactionType
  date: string
  shares: string
  price_per_share: string
  amount: string
  currency: Currency
  fees: string
  split_ratio: string
  notes: string
}

export interface DerivedPosition {
  ticker: string
  shares: number
  totalCost: number
  avgCostBasis: number
  realizedGain: number
  totalDividends: number
  costCurrency: Currency | string
  buyCount: number
  sellCount: number
  firstBuyDate: string | null
  lastTransactionDate: string | null
}

export interface Goal {
  id: string
  user_id: string
  name: string
  target_amount: number
  target_date: string
  monthly_contribution: number
  expected_return_pct: number
  expected_volatility_pct: number
  created_at: string
  updated_at: string
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

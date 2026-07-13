// Currencies the app supports for accounts, transactions, and display.
// All are covered by the Frankfurter FX API (ECB reference rates).
export const SUPPORTED_CURRENCIES = [
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'CNY', label: 'CNY — Chinese Yuan' },
  { code: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { code: 'IDR', label: 'IDR — Indonesian Rupiah' },
  { code: 'THB', label: 'THB — Thai Baht' },
  { code: 'PHP', label: 'PHP — Philippine Peso' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'KRW', label: 'KRW — South Korean Won' },
  { code: 'NZD', label: 'NZD — New Zealand Dollar' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'CHF', label: 'CHF — Swiss Franc' },
] as const

export type Currency = (typeof SUPPORTED_CURRENCIES)[number]['code']

export const CURRENCY_CODES: Currency[] = SUPPORTED_CURRENCIES.map((c) => c.code)

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

export interface NetWorthSnapshot {
  date: string         // YYYY-MM-DD
  net_worth: number    // base currency at snapshot time
  currency: string
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
  // What the projection starts from (column added 2026-07; default 'portfolio').
  basis?: 'portfolio' | 'networth'
  created_at: string
  updated_at: string
}

export interface UserSettings {
  user_id: string
  base_currency: Currency
  // Tithing pool (see src/lib/tithe.ts). Optional: columns added 2026-07.
  tithe_enabled?: boolean
  tithe_rate?: number          // percent of income, default 10
  tithe_start?: string | null  // YYYY-MM-DD; null = all history
  tithe_base?: 'salary' | 'all' // which income accrues (default 'salary')
}

export interface TitheClearance {
  id: string
  user_id: string
  date: string
  amount: number               // base currency
  notes: string | null
  created_at: string
}

export interface RebalanceRecommendation {
  ticker: string
  name: string
  currentValue: number
  targetValue: number
  currentPct: number
  targetPct: number
  delta: number               // amount to trade, in base currency
  sharesToTrade: number
  action: 'buy' | 'sell' | 'hold'
  currentPrice: number        // price per share converted to base currency
  nativePrice: number         // price per share in the ticker's quote currency
  priceCurrency: string       // e.g. "USD" for VOO, "SGD" for ES3.SI
  nativeAmount: number        // |delta| in the ticker's native currency
}

// ── Personal finance: accounts, categories, spending ──────────────────────

export type AccountType = 'bank' | 'cash' | 'credit' | 'wallet'

export interface Account {
  id: string
  user_id: string
  name: string
  type: AccountType
  institution: string | null
  currency: Currency | string
  current_balance: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AccountFormData {
  name: string
  type: AccountType
  institution: string
  currency: Currency
  current_balance: string
}

export type CategoryKind = 'expense' | 'income' | 'transfer'

export interface Category {
  id: string
  user_id: string
  name: string
  kind: CategoryKind
  color: string | null
  icon: string | null
  parent_id: string | null
  sort: number
  created_at: string
}

export interface CategoryRule {
  id: string
  user_id: string
  match_text: string
  category_id: string
  priority: number
  created_at: string
}

export type BankTxnSource = 'csv' | 'email' | 'manual'

export interface BankTransaction {
  id: string
  user_id: string
  account_id: string | null
  date: string
  description: string
  merchant: string | null
  amount: number              // negative = expense, positive = income
  currency: Currency | string
  category_id: string | null
  source: BankTxnSource
  external_id: string | null  // dedupe key (csv row hash / gmail message id)
  notes: string | null
  payee_key?: string | null   // stable per-payee grouping key
  needs_review?: boolean       // parser low-confidence or possible duplicate
  created_at: string
  updated_at: string
}

export interface PayeeAlias {
  id: string
  user_id: string
  payee_key: string
  alias: string
  created_at: string
  updated_at: string
}

export interface BankTransactionFormData {
  account_id: string
  date: string
  description: string
  merchant: string
  amount: string              // signed; expense entered as negative
  currency: Currency
  category_id: string
  notes: string
}

export interface Budget {
  id: string
  user_id: string
  category_id: string
  amount: number              // monthly limit, base currency
  period: 'monthly'
  created_at: string
  updated_at: string
}

export type SubscriptionState = 'active' | 'could_cancel' | 'cancelled'

// Persisted per-merchant cancel state (the savings tracker).
export interface SubscriptionStatus {
  id: string
  user_id: string
  merchant_key: string
  status: SubscriptionState
  label: string | null
  monthly_amount: number | null
  updated_at: string
}

// Derived recurring charge (detected from bank transactions + joined status).
export interface Subscription {
  key: string                 // normalized merchant key
  label: string
  monthlyAmount: number       // base currency, representative per-month cost
  annualAmount: number        // monthlyAmount * 12, base
  occurrences: number
  months: number              // distinct months seen
  lastDate: string
  categoryId: string | null
  status: SubscriptionState
}

export interface CategorySpend {
  category_id: string | null
  name: string
  amount: number              // absolute spend in base currency
}

export interface SpendingStats {
  month: string               // 'YYYY-MM'
  income: number              // base currency
  expense: number             // base currency (positive magnitude)
  net: number                 // income - expense
  byCategory: CategorySpend[] // expense breakdown, base currency
  incomeByCategory: CategorySpend[] // income breakdown, base currency
}

export const DEFAULT_BENCHMARKS: BenchmarkConfig[] = [
  { ticker: 'SPY', name: 'S&P 500' },
  { ticker: 'QQQ', name: 'NASDAQ 100' },
  { ticker: 'VTI', name: 'US Total Market' },
  { ticker: 'VEA', name: 'Developed Markets ex-US' },
  { ticker: 'EWS', name: 'Singapore (STI proxy)' },
]

// ── Planned payments (upcoming deadlines) ──────────────────────────────────

export type PaymentRepeat = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface PlannedPayment {
  id: string
  user_id: string
  name: string
  amount: number
  currency: Currency | string
  due_date: string             // YYYY-MM-DD
  repeat: PaymentRepeat
  category_id: string | null
  account_id: string | null
  autopay: boolean
  notes: string | null
  paid_at: string | null       // set when a one-off payment is settled
  // Recurring posting (columns added 2026-07): book a real transaction each
  // time the due date passes. flow 'bill' = money out, 'income' = money in.
  post_as_transaction?: boolean
  flow?: 'bill' | 'income'
  created_at: string
  updated_at: string
}

// ── IOUs (money owed between you and people) ───────────────────────────────

export type IouDirection = 'owed_to_me' | 'i_owe'

export interface Iou {
  id: string
  user_id: string
  person: string
  direction: IouDirection
  amount: number
  currency: Currency | string
  tag: string | null           // friend group / occasion
  date: string
  notes: string | null
  settled: boolean
  settled_at: string | null
  created_at: string
  updated_at: string
}

// Inbound forwarding address for bank email sync.
export interface InboundAddress {
  user_id: string
  address: string              // e.g. "abc123@inbound.aureus.app"
  address_local: string        // e.g. "abc123"
  last_synced: string | null
  total_synced: number
  created_at: string
  // Captured forwarding-verification email (e.g. Gmail's confirmation):
  verify_code?: string | null
  verify_link?: string | null
  verify_from?: string | null
  verify_received_at?: string | null
}

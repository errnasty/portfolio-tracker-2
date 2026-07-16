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

// 'auto' = priced from Yahoo Finance (the default). 'custom' = priced from
// custom_price, either entered by hand or kept fresh by price_provider (a
// registry entry in src/lib/server/fund-scrapers) — for funds that aren't
// on Yahoo, e.g. Singapore unit trusts.
export type PriceSource = 'auto' | 'custom'

export interface Holding {
  id: string
  user_id: string
  ticker: string
  name: string | null
  shares: number
  cost_basis_per_share: number
  cost_basis_currency: Currency
  price_source: PriceSource
  custom_price: number | null
  custom_price_asof: string | null   // YYYY-MM-DD
  price_provider: string | null      // e.g. 'sgfund', 'gold'
  price_provider_ref: string | null  // provider-specific fund identifier
  locked_until: string | null        // YYYY-MM-DD; can't withdraw until then
  created_at: string
  updated_at: string
}

export interface HoldingFormData {
  ticker: string
  name: string
  shares: string
  cost_basis_per_share: string
  cost_basis_currency: Currency
  price_source: PriceSource
  custom_price: string
  price_provider: string   // '' = none (pure manual)
  price_provider_ref: string
  locked_until: string     // '' = not locked
}

// A fund-price provider's answer for one fund. asOf is the NAV date the
// provider reports, not the fetch time.
export interface FundQuote {
  price: number
  asOf: string | null
  name?: string | null
}

export interface FundProviderMeta {
  id: string
  label: string
  helpText: string
  // Fixed quote currency for this provider (e.g. gold spot is always USD,
  // regardless of what currency the holding's cost basis is in). Omitted
  // when the provider's currency varies (e.g. a fund's own share class) —
  // those holdings fall back to pricing in cost_basis_currency.
  nativeCurrency?: Currency
  // When set, the "ref" field is a picker (e.g. weight unit) instead of
  // free text (e.g. a fund code).
  refOptions?: { value: string; label: string }[]
}

export interface PriceQuote {
  ticker: string
  price: number
  currency: string
  change: number
  changePercent: number
  longName?: string
  // Set when this quote came from price_cache (a live Yahoo fetch failed) —
  // asOf is when the cached price was last refreshed, not now.
  stale?: boolean
  asOf?: string
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
  // Composition (columns added 2026-07; null on older rows)
  holdings_value?: number | null
  accounts_value?: number | null
  assets_value?: number | null
  liabilities_value?: number | null
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
  // CPF auto-contribution (columns added 2026-07).
  cpf_enabled?: boolean
  cpf_birth_year?: number | null
  cpf_salary_basis?: 'take_home' | 'gross'  // recorded salary is 80% take-home or gross
  cpf_start?: string | null                 // YYYY-MM-DD; auto-contribute from here
}

export interface CpfContribution {
  id: string
  user_id: string
  source_txn_id: string | null
  date: string
  gross: number
  employee: number
  employer: number
  oa: number
  sa: number
  ma: number
  notes: string | null
  created_at: string
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

export type BankTxnSource = 'csv' | 'email' | 'manual' | 'paste' | 'receipt'

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

// ── Assets & liabilities (everything that isn't a bank account or holding) ──

export type AssetKind =
  | 'cpf_oa' | 'cpf_sa' | 'cpf_ma'
  | 'fixed_deposit' | 'tbill' | 'ssb' | 'bond'
  | 'property' | 'vehicle' | 'other'
  | 'loan' | 'mortgage'

// How often a bond pays its coupon.
export type CouponFrequency = 'annual' | 'semi_annual' | 'quarterly' | 'monthly' | 'zero'

export const COUPON_FREQUENCIES: { value: CouponFrequency; label: string; perYear: number }[] = [
  { value: 'semi_annual', label: 'Semi-annual', perYear: 2 },
  { value: 'annual', label: 'Annual', perYear: 1 },
  { value: 'quarterly', label: 'Quarterly', perYear: 4 },
  { value: 'monthly', label: 'Monthly', perYear: 12 },
  { value: 'zero', label: 'Zero-coupon', perYear: 0 },
]

export interface AssetKindMeta {
  kind: AssetKind
  label: string
  group: 'CPF' | 'Deposits & bonds' | 'Property & other' | 'Loans'
  liability: boolean
}

export const ASSET_KINDS: AssetKindMeta[] = [
  { kind: 'cpf_oa', label: 'CPF Ordinary Account', group: 'CPF', liability: false },
  { kind: 'cpf_sa', label: 'CPF Special Account', group: 'CPF', liability: false },
  { kind: 'cpf_ma', label: 'CPF MediSave', group: 'CPF', liability: false },
  { kind: 'fixed_deposit', label: 'Fixed deposit', group: 'Deposits & bonds', liability: false },
  { kind: 'tbill', label: 'T-bill', group: 'Deposits & bonds', liability: false },
  { kind: 'ssb', label: 'Savings Bond (SSB)', group: 'Deposits & bonds', liability: false },
  { kind: 'bond', label: 'Bond', group: 'Deposits & bonds', liability: false },
  { kind: 'property', label: 'Property', group: 'Property & other', liability: false },
  { kind: 'vehicle', label: 'Vehicle', group: 'Property & other', liability: false },
  { kind: 'other', label: 'Other asset', group: 'Property & other', liability: false },
  { kind: 'loan', label: 'Loan', group: 'Loans', liability: true },
  { kind: 'mortgage', label: 'Mortgage', group: 'Loans', liability: true },
]

export const ASSET_KIND_META: Record<AssetKind, AssetKindMeta> =
  Object.fromEntries(ASSET_KINDS.map((k) => [k.kind, k])) as Record<AssetKind, AssetKindMeta>

export interface Asset {
  id: string
  user_id: string
  name: string
  kind: AssetKind
  balance: number              // always positive; loans = amount owed; bonds = current value
  currency: Currency | string
  interest_rate_pct: number | null   // deposits: yield; bonds: coupon rate; loans: cost
  maturity_date: string | null
  monthly_payment: number | null
  notes: string | null
  is_active: boolean
  // Bond-specific (null for other kinds):
  face_value?: number | null         // par value redeemed at maturity
  coupon_frequency?: CouponFrequency | null
  locked_until?: string | null       // can't withdraw until then (SRS, locked deposits)
  created_at: string
  updated_at: string
}

// ── Insurance policies ──────────────────────────────────────────────────────

export type PolicyType =
  | 'term' | 'whole' | 'ilp' | 'health' | 'accident' | 'car' | 'home' | 'travel' | 'other'

export type PremiumFrequency = 'monthly' | 'quarterly' | 'yearly' | 'single' | 'none'

export const POLICY_TYPES: { value: PolicyType; label: string }[] = [
  { value: 'term', label: 'Term life' },
  { value: 'whole', label: 'Whole life' },
  { value: 'ilp', label: 'Investment-linked (ILP)' },
  { value: 'health', label: 'Health / hospitalisation' },
  { value: 'accident', label: 'Personal accident' },
  { value: 'car', label: 'Car / motor' },
  { value: 'home', label: 'Home / contents' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
]

export interface InsurancePolicy {
  id: string
  user_id: string
  name: string
  insurer: string | null
  policy_type: PolicyType
  policy_number: string | null
  sum_assured: number | null
  currency: Currency | string
  premium_amount: number | null
  premium_frequency: PremiumFrequency
  next_premium_due: string | null   // YYYY-MM-DD
  planned_payment_id: string | null
  cash_value: number | null          // surrender/cash value -> net worth
  cash_value_asof: string | null
  invested_value: number | null      // ILP current account value (vs surrender)
  locked_until: string | null        // exit penalty-free from this date (ILP lock-in)
  start_date: string | null
  end_date: string | null            // maturity / expiry
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

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
  // Provider-assigned relay address (CloudMailin/Postmark free tier) used
  // until the user owns a domain — pasted in on the Settings card.
  provider_address?: string | null
}

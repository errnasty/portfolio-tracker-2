'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { enrichHoldings, calcPortfolioStats, convertToBase, convertBetween } from '@/lib/calculations'
import { deriveAllPositions } from '@/lib/transactions'
import { FUND_PROVIDER_LIST } from '@/lib/fund-providers'
import { computeLiquidity, type LockedItem } from '@/lib/liquidity'

// Translate Supabase errors into user-actionable toasts. The most common one
// new users hit is the "relation does not exist" error when a migration
// hasn't been applied yet.
function reportSupabaseError(operation: string, error: { message: string; code?: string } | null) {
  if (!error) return
  console.error(`[supabase] ${operation} failed:`, error)
  // Postgres "undefined_table" error code = 42P01
  if (error.code === '42P01' || /relation .* does not exist/i.test(error.message)) {
    const m = error.message.match(/relation "(\w+)"/)
    const table = m?.[1] ?? 'a table'
    toast.error(`Database is missing ${table}. Re-run supabase-schema.sql in your Supabase SQL editor.`, {
      duration: 8000,
    })
    return
  }
  toast.error(`${operation} failed: ${error.message}`)
}
import type {
  Holding, PriceQuote, FxRates, EnrichedHolding, PortfolioStats,
  Currency, TargetAllocation, UserSettings, Transaction, DerivedPosition, Goal,
  Account, Asset, NetWorthSnapshot, InsurancePolicy,
} from '@/types'
import { CURRENCY_CODES, ASSET_KIND_META } from '@/types'

interface PortfolioContextValue {
  holdings: Holding[]
  enriched: EnrichedHolding[]
  stats: PortfolioStats | null
  prices: Record<string, PriceQuote>
  fxRates: FxRates | null
  targets: TargetAllocation[]
  settings: UserSettings | null
  transactions: Transaction[]
  positions: Record<string, DerivedPosition>
  goals: Goal[]
  accounts: Account[]
  totalCashBase: number        // cash-type accounts, in base (investable buying power)
  accountsNetBase: number      // all accounts net (credit subtracted), in base
  assets: Asset[]              // CPF / deposits / property / loans ledger
  assetsError: string | null
  assetsBase: number           // non-liability assets, in base
  liabilitiesBase: number      // loans + mortgages, in base (positive magnitude)
  netWorthBase: number         // holdings + accounts + assets − liabilities, in base
  netWorthHistory: NetWorthSnapshot[]   // daily snapshots, ascending by date
  accountsError: string | null
  loading: boolean
  refreshHoldings: () => Promise<void>
  refreshPrices: () => Promise<void>
  refreshTransactions: () => Promise<void>
  addHolding: (data: Omit<Holding, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateHolding: (id: string, data: Partial<Holding>) => Promise<void>
  deleteHolding: (id: string) => Promise<void>
  upsertTarget: (ticker: string, pct: number, tolerancePct?: number) => Promise<void>
  deleteTarget: (id: string) => Promise<void>
  updateSettings: (s: Partial<UserSettings>) => Promise<void>
  addTransaction: (t: Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  addTransactionsBulk: (rows: Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>[]) => Promise<{ inserted: number }>
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  refreshGoals: () => Promise<void>
  addGoal: (g: Omit<Goal, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateGoal: (id: string, data: Partial<Goal>) => Promise<void>
  deleteGoal: (id: string) => Promise<void>
  refreshAccounts: () => Promise<void>
  addAccount: (data: Omit<Account, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateAccount: (id: string, data: Partial<Account>) => Promise<void>
  deleteAccount: (id: string) => Promise<void>
  refreshAssets: () => Promise<void>
  addAsset: (data: Omit<Asset, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateAsset: (id: string, data: Partial<Asset>) => Promise<void>
  deleteAsset: (id: string) => Promise<void>
  policies: InsurancePolicy[]
  policiesError: string | null
  policiesCashBase: number     // sum of policy cash/surrender values, in base
  liquidBase: number           // net worth you can access now, in base
  lockedBase: number           // net worth locked until a date/retirement, in base
  lockedItems: LockedItem[]    // locked positions, soonest unlock first
  refreshPolicies: () => Promise<void>
  addPolicy: (data: Omit<InsurancePolicy, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<InsurancePolicy | null>
  updatePolicy: (id: string, data: Partial<InsurancePolicy>) => Promise<void>
  deletePolicy: (id: string) => Promise<void>
  // Apply a buy/sell to the holdings table directly (weighted-avg cost basis).
  // Optionally also write a row to the transaction log.
  applyTrade: (trade: TradeInput, alsoLog?: boolean) => Promise<void>
}

export interface TradeInput {
  ticker: string
  type: 'buy' | 'sell'
  date: string
  shares: number
  pricePerShare: number       // in trade currency
  fees: number                // in trade currency
  currency: string            // trade currency (e.g. 'USD')
  name?: string | null        // used only when creating a new holding row
  notes?: string | null
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null)

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [prices, setPrices] = useState<Record<string, PriceQuote>>({})
  const [fxRates, setFxRates] = useState<FxRates | null>(null)
  const [targets, setTargets] = useState<TargetAllocation[]>([])
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [policiesError, setPoliciesError] = useState<string | null>(null)
  const [netWorthHistory, setNetWorthHistory] = useState<NetWorthSnapshot[]>([])
  const snapshotSaved = useRef(false)
  const [loading, setLoading] = useState(true)

  const baseCurrency: Currency = (settings?.base_currency as Currency) ?? 'USD'

  // The transaction log is a separate, optional ledger. We derive
  // per-ticker positions for the Transactions/Dividends pages, but
  // **transactions never override the holdings table** — holdings are
  // the source of truth for the dashboard, analytics, and rebalancer.
  const positions: Record<string, DerivedPosition> = deriveAllPositions(transactions)

  const enriched: EnrichedHolding[] = fxRates && holdings.length > 0
    ? enrichHoldings(holdings, prices, fxRates).filter((h) => h.shares > 0)
    : []

  // Cash-type accounts = investable buying power (feeds stats + rebalancer).
  const totalCashBase = fxRates
    ? accounts
        .filter((a) => a.type === 'cash')
        .reduce((s, a) => s + convertToBase(Number(a.current_balance) || 0, a.currency, fxRates), 0)
    : 0

  // All accounts net, credit balances subtracted (money owed).
  const accountsNetBase = fxRates
    ? accounts.reduce((s, a) => {
        const v = convertToBase(Number(a.current_balance) || 0, a.currency, fxRates)
        return s + (a.type === 'credit' ? -v : v)
      }, 0)
    : 0

  // Assets & liabilities ledger (CPF, deposits, property vs loans/mortgages).
  const assetsBase = fxRates
    ? assets
        .filter((a) => a.is_active && !ASSET_KIND_META[a.kind]?.liability)
        .reduce((s, a) => s + convertToBase(Number(a.balance) || 0, a.currency, fxRates), 0)
    : 0
  const liabilitiesBase = fxRates
    ? assets
        .filter((a) => a.is_active && ASSET_KIND_META[a.kind]?.liability)
        .reduce((s, a) => s + convertToBase(Number(a.balance) || 0, a.currency, fxRates), 0)
    : 0

  // Insurance value in net worth: surrender/cash value, or an ILP's current
  // invested value when no surrender value is recorded.
  const policyNetValue = (p: InsurancePolicy) => Number(p.cash_value ?? p.invested_value ?? 0) || 0
  const policiesCashBase = fxRates
    ? policies
        .filter((p) => p.is_active)
        .reduce((s, p) => s + convertToBase(policyNetValue(p), p.currency, fxRates), 0)
    : 0

  const holdingsValueBase = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  const netWorthBase = holdingsValueBase + accountsNetBase + assetsBase + policiesCashBase - liabilitiesBase

  // Liquid vs locked split + unlock timeline (money you can't withdraw yet:
  // locked funds, endowment/ILP lock-in, CPF/SRS retirement).
  const liquidityToday = new Date().toISOString().slice(0, 10)
  const liquidity = fxRates
    ? computeLiquidity(netWorthBase, liquidityToday, [
        ...enriched.map((h) => ({
          name: h.name ?? h.ticker, valueBase: h.currentValueBase,
          lockedUntil: h.locked_until ?? null, source: 'holding' as const,
        })),
        ...assets
          .filter((a) => a.is_active && !ASSET_KIND_META[a.kind]?.liability)
          .map((a) => ({
            name: a.name, valueBase: convertToBase(Number(a.balance) || 0, a.currency, fxRates),
            lockedUntil: a.locked_until ?? null, alwaysLocked: a.kind.startsWith('cpf_'),
            source: 'asset' as const,
          })),
        ...policies
          .filter((p) => p.is_active)
          .map((p) => ({
            name: p.name, valueBase: convertToBase(policyNetValue(p), p.currency, fxRates),
            lockedUntil: p.locked_until ?? null, source: 'policy' as const,
          })),
      ])
    : { lockedBase: 0, liquidBase: netWorthBase, items: [] }

  const refreshNetWorthHistory = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // Was 120 days; the daily cron now writes a snapshot every day (not just
    // when the app is opened), so "All" on the Net worth page can go back
    // years without being full of gaps.
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 1100)
    const { data } = await supabase
      .from('networth_snapshots')
      .select('date, net_worth, currency')
      .eq('user_id', user.id)
      .gte('date', cutoff.toISOString().slice(0, 10))
      .order('date')
    if (data) setNetWorthHistory(data)
  }, [])

  const stats: PortfolioStats | null = (enriched.length > 0 || totalCashBase > 0)
    ? calcPortfolioStats(enriched, baseCurrency, totalCashBase)
    : null

  const fetchSettings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).single()
    if (data) {
      setSettings(data)
    } else {
      const { data: newSettings } = await supabase
        .from('user_settings')
        .insert({ user_id: user.id, base_currency: 'USD' })
        .select()
        .single()
      if (newSettings) setSettings(newSettings)
    }
  }, [])

  const fetchFxRates = useCallback(async (base: Currency) => {
    try {
      const res = await fetch(`/api/fx?base=${base}&symbols=${CURRENCY_CODES.join(',')}`)
      if (res.ok) {
        const data = await res.json()
        setFxRates(data)
      }
    } catch (err) {
      console.error('FX fetch failed:', err)
    }
  }, [])

  const refreshHoldings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('holdings').select('*').eq('user_id', user.id).order('created_at')
    setHoldings(data ?? [])

    const { data: targetsData } = await supabase.from('target_allocations').select('*').eq('user_id', user.id)
    setTargets(targetsData ?? [])
  }, [])

  const refreshGoals = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('goals').select('*').eq('user_id', user.id).order('target_date')
    setGoals(data ?? [])
  }, [])

  const refreshAccounts = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at')
    if (error) {
      console.error('[supabase] Load accounts failed:', error)
      setAccounts([])
      // Surface as inline state so the UI can show a banner.
      // Most common cause: the accounts table doesn't exist yet.
      const isMissingTable = error.code === '42P01' ||
        /relation .* does not exist/i.test(error.message)
      setAccountsError(
        isMissingTable
          ? 'The accounts table is missing. Re-run supabase-schema.sql in your Supabase SQL editor.'
          : `Couldn\'t load accounts: ${error.message}`,
      )
      return
    }
    setAccountsError(null)
    setAccounts(data ?? [])
  }, [])

  const refreshAssets = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('assets').select('*').eq('user_id', user.id).order('created_at')
    if (error) {
      // Most common cause: migration 006 not applied yet. Treat as empty and
      // surface a banner on the Assets page rather than breaking net worth.
      setAssets([])
      const missing = error.code === '42P01' ||
        /relation .* does not exist|schema cache/i.test(error.message)
      setAssetsError(missing
        ? 'The assets table is missing. Run supabase/migrations/006_assets_networth.sql in your Supabase SQL editor.'
        : `Couldn't load assets: ${error.message}`)
      return
    }
    setAssetsError(null)
    setAssets(data ?? [])
  }, [])

  const refreshPolicies = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('insurance_policies').select('*').eq('user_id', user.id).order('created_at')
    if (error) {
      setPolicies([])
      const missing = error.code === '42P01' ||
        /relation .* does not exist|schema cache/i.test(error.message)
      setPoliciesError(missing
        ? 'The insurance_policies table is missing. Run supabase/migrations/010_insurance.sql in your Supabase SQL editor.'
        : `Couldn't load insurance: ${error.message}`)
      return
    }
    setPoliciesError(null)
    setPolicies(data ?? [])
  }, [])

  const addPolicy = async (data: Omit<InsurancePolicy, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: row, error } = await supabase
      .from('insurance_policies').insert({ ...data, user_id: user.id }).select('*').single()
    if (error) { reportSupabaseError('Add policy', error); throw error }
    await refreshPolicies()
    return (row as InsurancePolicy) ?? null
  }

  const updatePolicy = async (id: string, data: Partial<InsurancePolicy>) => {
    const { error } = await supabase.from('insurance_policies')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { reportSupabaseError('Update policy', error); throw error }
    await refreshPolicies()
  }

  const deletePolicy = async (id: string) => {
    const { error } = await supabase.from('insurance_policies').delete().eq('id', id)
    if (error) { reportSupabaseError('Delete policy', error); throw error }
    await refreshPolicies()
  }

  const refreshTransactions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
    setTransactions(data ?? [])
  }, [])

  const refreshPrices = useCallback(async () => {
    // Custom-priced holdings (funds not on Yahoo, e.g. Singapore unit trusts)
    // skip the Yahoo fetch entirely — their price comes from custom_price,
    // which either the user or the daily fund-price cron keeps up to date.
    const customTickers = new Set(
      holdings.filter((h) => h.price_source === 'custom').map((h) => h.ticker),
    )
    const tickers = Array.from(new Set([
      ...holdings.map((h) => h.ticker),
      ...transactions.map((t) => t.ticker),
    ])).filter((t) => !customTickers.has(t))

    const quotes: Record<string, PriceQuote> = {}
    if (tickers.length > 0) {
      // Instant paint from the daily cron's cache (kills the "$0 while
      // loading" flash) — overlaid by the live fetch below when it lands.
      try {
        const { data: cached } = await supabase
          .from('price_cache').select('*').in('ticker', tickers)
        for (const row of cached ?? []) {
          quotes[row.ticker] = {
            ticker: row.ticker, price: Number(row.price), currency: row.currency,
            change: Number(row.change) || 0, changePercent: Number(row.change_percent) || 0,
            longName: row.long_name ?? undefined, stale: true, asOf: row.fetched_at,
          }
        }
        if (Object.keys(quotes).length > 0) setPrices((prev) => ({ ...prev, ...quotes }))
      } catch { /* cache table may not exist yet — live fetch below still runs */ }

      try {
        const res = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers }),
        })
        if (res.ok) {
          const data = await res.json()
          Object.assign(quotes, data.quotes)
        }
      } catch (err) {
        console.error('Prices fetch failed:', err)
      }
    }

    for (const h of holdings) {
      if (h.price_source === 'custom' && h.custom_price != null) {
        // Most custom providers publish a price in the holding's own cost
        // basis currency (e.g. a fund's SGD share class). A few quote a
        // fixed currency regardless (e.g. gold spot is always USD) — that's
        // FUND_PROVIDER_LIST[...].nativeCurrency.
        const providerCurrency = h.price_provider
          ? FUND_PROVIDER_LIST.find((p) => p.id === h.price_provider)?.nativeCurrency
          : undefined
        quotes[h.ticker] = {
          ticker: h.ticker,
          price: h.custom_price,
          currency: providerCurrency ?? h.cost_basis_currency,
          change: 0,
          changePercent: 0,
          longName: h.name ?? h.ticker,
        }
      }
    }
    setPrices(quotes)
  }, [holdings, transactions])

  // Initial load
  useEffect(() => {
    async function init() {
      setLoading(true)
      await fetchSettings()
      await refreshHoldings()
      await refreshTransactions()
      await refreshGoals()
      await refreshAccounts()
      await refreshAssets()
      await refreshPolicies()
      await refreshNetWorthHistory()
      setLoading(false)
    }
    init()
  }, [fetchSettings, refreshHoldings, refreshTransactions, refreshGoals, refreshAccounts, refreshAssets, refreshPolicies, refreshNetWorthHistory])

  // Save today's net-worth snapshot once per session, after data has loaded.
  // Includes the composition breakdown; falls back to the bare shape when the
  // composition columns (migration 006) don't exist yet.
  useEffect(() => {
    if (loading || !fxRates || netWorthBase <= 0 || snapshotSaved.current) return
    snapshotSaved.current = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const today = new Date().toISOString().slice(0, 10)
      const r2 = (n: number) => Math.round(n * 100) / 100
      const bare = { user_id: user.id, date: today, net_worth: r2(netWorthBase), currency: baseCurrency }
      const { error } = await supabase.from('networth_snapshots').upsert(
        {
          ...bare,
          holdings_value: r2(holdingsValueBase),
          accounts_value: r2(accountsNetBase),
          assets_value: r2(assetsBase + policiesCashBase),
          liabilities_value: r2(liabilitiesBase),
        },
        { onConflict: 'user_id,date' },
      )
      if (error) {
        await supabase.from('networth_snapshots').upsert(bare, { onConflict: 'user_id,date' })
      }
      await refreshNetWorthHistory()
    })()
  }, [loading, fxRates, netWorthBase, holdingsValueBase, accountsNetBase, assetsBase, policiesCashBase, liabilitiesBase, baseCurrency, refreshNetWorthHistory])

  useEffect(() => {
    fetchFxRates(baseCurrency)
  }, [baseCurrency, fetchFxRates])

  // Refresh prices when the set of tickers changes
  useEffect(() => {
    refreshPrices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length, transactions.length])

  // ── Holding CRUD ────────────────────────────────────────────────────────
  // Holdings are the user's source of truth. We don't auto-create or
  // auto-delete transactions when holdings change — the transaction log is
  // an independent ledger the user opts into.
  const addHolding = async (data: Omit<Holding, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('holdings').insert({ ...data, user_id: user.id })
    if (error) { reportSupabaseError('Add holding', error); throw error }
    await refreshHoldings()
  }

  const updateHolding = async (id: string, data: Partial<Holding>) => {
    const { error } = await supabase.from('holdings')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { reportSupabaseError('Update holding', error); throw error }
    await refreshHoldings()
  }

  const deleteHolding = async (id: string) => {
    const { error } = await supabase.from('holdings').delete().eq('id', id)
    if (error) { reportSupabaseError('Delete holding', error); throw error }
    await refreshHoldings()
  }

  // ── Target allocation CRUD ──────────────────────────────────────────────
  const upsertTarget = async (ticker: string, pct: number, tolerancePct?: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('target_allocations').upsert(
      {
        user_id: user.id,
        ticker,
        target_pct: pct,
        ...(tolerancePct !== undefined ? { tolerance_pct: tolerancePct } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,ticker' },
    )
    await refreshHoldings()
  }

  const deleteTarget = async (id: string) => {
    await supabase.from('target_allocations').delete().eq('id', id)
    await refreshHoldings()
  }

  // ── User settings ──────────────────────────────────────────────────────
  const updateSettings = async (s: Partial<UserSettings>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('user_settings').update({ ...s, updated_at: new Date().toISOString() }).eq('user_id', user.id)
    setSettings((prev) => prev ? { ...prev, ...s } : null)
  }

  // ── Transaction CRUD ───────────────────────────────────────────────────
  // Transactions are an independent log. They do NOT auto-create or update
  // holdings rows — use applyTrade() if you want a trade to update both.
  const addTransaction = async (t: Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('transactions').insert({
      ...t,
      ticker: t.ticker.toUpperCase(),
      user_id: user.id,
    })
    if (error) { reportSupabaseError('Add transaction', error); throw error }
    await refreshTransactions()
  }

  const addTransactionsBulk = async (
    rows: Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>[],
  ) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { inserted: 0 }
    if (rows.length === 0) return { inserted: 0 }

    const payload = rows.map((r) => ({
      ...r,
      ticker: r.ticker.toUpperCase(),
      user_id: user.id,
    }))
    const { data, error } = await supabase.from('transactions').insert(payload).select('id')
    if (error) {
      reportSupabaseError('Import transactions', error)
      return { inserted: 0 }
    }
    await refreshTransactions()
    return { inserted: data?.length ?? 0 }
  }

  const updateTransaction = async (id: string, data: Partial<Transaction>) => {
    await supabase.from('transactions').update({
      ...data,
      ...(data.ticker ? { ticker: data.ticker.toUpperCase() } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    await refreshTransactions()
  }

  const deleteTransaction = async (id: string) => {
    await supabase.from('transactions').delete().eq('id', id)
    await refreshTransactions()
  }

  // ── Goals CRUD ─────────────────────────────────────────────────────────
  const addGoal = async (g: Omit<Goal, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('goals').insert({ ...g, user_id: user.id })
    await refreshGoals()
  }

  const updateGoal = async (id: string, data: Partial<Goal>) => {
    await supabase.from('goals').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
    await refreshGoals()
  }

  const deleteGoal = async (id: string) => {
    await supabase.from('goals').delete().eq('id', id)
    await refreshGoals()
  }

  // ── Account CRUD ───────────────────────────────────────────────────────
  // Accounts unify cash / bank / credit / wallet balances. Cash-type accounts
  // feed the rebalancer; all accounts roll up into net worth.
  const addAccount = async (data: Omit<Account, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not signed in'); throw new Error('Not signed in') }
    const { error } = await supabase.from('accounts').insert({
      ...data,
      currency: (data.currency || 'SGD').toUpperCase(),
      user_id: user.id,
    })
    if (error) { reportSupabaseError('Add account', error); throw error }
    await refreshAccounts()
  }

  const updateAccount = async (id: string, data: Partial<Account>) => {
    const { error } = await supabase.from('accounts').update({
      ...data,
      ...(data.currency ? { currency: data.currency.toUpperCase() } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) { reportSupabaseError('Update account', error); throw error }
    await refreshAccounts()
  }

  const deleteAccount = async (id: string) => {
    const { error } = await supabase.from('accounts').delete().eq('id', id)
    if (error) { reportSupabaseError('Delete account', error); throw error }
    await refreshAccounts()
  }

  // ── Asset CRUD ─────────────────────────────────────────────────────────
  // CPF / deposits / property / loans. Liability kinds subtract from net worth.
  const addAsset = async (data: Omit<Asset, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not signed in'); throw new Error('Not signed in') }
    const { error } = await supabase.from('assets').insert({
      ...data,
      currency: (String(data.currency) || 'SGD').toUpperCase(),
      user_id: user.id,
    })
    if (error) { reportSupabaseError('Add asset', error); throw error }
    await refreshAssets()
  }

  const updateAsset = async (id: string, data: Partial<Asset>) => {
    const { error } = await supabase.from('assets').update({
      ...data,
      ...(data.currency ? { currency: String(data.currency).toUpperCase() } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) { reportSupabaseError('Update asset', error); throw error }
    await refreshAssets()
  }

  const deleteAsset = async (id: string) => {
    const { error } = await supabase.from('assets').delete().eq('id', id)
    if (error) { reportSupabaseError('Delete asset', error); throw error }
    await refreshAssets()
  }

  // ── applyTrade ─────────────────────────────────────────────────────────
  // Update the holdings table with a buy or sell. Uses weighted-average
  // cost basis. If the holding doesn't exist yet, creates one in the
  // trade's currency. Optionally also logs a transaction.
  const applyTrade = async (trade: TradeInput, alsoLog = false) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Not signed in')
      throw new Error('Not signed in')
    }
    const tickerUpper = trade.ticker.toUpperCase().trim()
    if (!tickerUpper) throw new Error('Missing ticker')
    if (trade.shares <= 0) throw new Error('Shares must be positive')
    if (trade.pricePerShare <= 0) throw new Error('Price must be positive')

    const existing = holdings.find((h) => h.ticker.toUpperCase() === tickerUpper)

    if (trade.type === 'buy') {
      if (!existing) {
        // Fresh ticker — create the holding in the trade's currency.
        // Bake fees into per-share cost.
        const costPerShare = trade.pricePerShare + (trade.fees / trade.shares)
        const { error } = await supabase.from('holdings').insert({
          user_id: user.id,
          ticker: tickerUpper,
          name: trade.name ?? null,
          shares: trade.shares,
          cost_basis_per_share: costPerShare,
          cost_basis_currency: trade.currency.toUpperCase(),
        })
        if (error) { reportSupabaseError('Create holding', error); throw error }
      } else {
        // Existing position — weighted-average cost basis math, in the
        // holding's currency. Convert the trade's spend if needed.
        const holdingCur = existing.cost_basis_currency
        let buyTotalInHoldingCur = trade.shares * trade.pricePerShare + trade.fees
        if (trade.currency.toUpperCase() !== holdingCur.toUpperCase()) {
          if (!fxRates) {
            toast.error('FX rates unavailable — cannot convert between currencies')
            throw new Error('FX rates unavailable')
          }
          buyTotalInHoldingCur = convertBetween(
            buyTotalInHoldingCur,
            trade.currency.toUpperCase(),
            holdingCur,
            fxRates,
          )
        }
        const oldShares = Number(existing.shares) || 0
        const oldCost = oldShares * (Number(existing.cost_basis_per_share) || 0)
        const newShares = oldShares + trade.shares
        const newTotalCost = oldCost + buyTotalInHoldingCur
        const newCostPerShare = newShares > 0 ? newTotalCost / newShares : 0
        const { error } = await supabase.from('holdings').update({
          shares: newShares,
          cost_basis_per_share: newCostPerShare,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
        if (error) { reportSupabaseError('Update holding', error); throw error }
      }
    } else {
      // Sell — reduce shares, leave avg cost basis untouched
      if (!existing) {
        toast.error(`Can't sell ${tickerUpper}: no existing position`)
        throw new Error('No existing position to sell from')
      }
      const oldShares = Number(existing.shares) || 0
      const newShares = Math.max(0, oldShares - trade.shares)
      const { error } = await supabase.from('holdings').update({
        shares: newShares,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
      if (error) { reportSupabaseError('Update holding', error); throw error }
    }

    // Optionally log to transaction history (independent ledger)
    if (alsoLog) {
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        ticker: tickerUpper,
        type: trade.type,
        date: trade.date,
        shares: trade.shares,
        price_per_share: trade.pricePerShare,
        amount: 0,
        currency: trade.currency.toUpperCase(),
        fees: trade.fees,
        split_ratio: null,
        notes: trade.notes ?? 'Rebalancer',
      })
      if (error) { reportSupabaseError('Log transaction', error); /* non-fatal */ }
      else await refreshTransactions()
    }

    await refreshHoldings()
    toast.success(
      `${trade.type === 'buy' ? 'Bought' : 'Sold'} ${trade.shares} ${tickerUpper} @ ${trade.pricePerShare.toFixed(2)} ${trade.currency.toUpperCase()}`,
    )
  }

  return (
    <PortfolioContext.Provider value={{
      holdings, enriched, stats, prices, fxRates, targets, settings,
      transactions, positions, goals,
      accounts, totalCashBase, accountsNetBase, netWorthBase, netWorthHistory, accountsError,
      assets, assetsError, assetsBase, liabilitiesBase,
      policies, policiesError, policiesCashBase, refreshPolicies, addPolicy, updatePolicy, deletePolicy,
      liquidBase: liquidity.liquidBase, lockedBase: liquidity.lockedBase, lockedItems: liquidity.items,
      loading, refreshHoldings, refreshPrices, refreshTransactions,
      addHolding, updateHolding, deleteHolding,
      upsertTarget, deleteTarget, updateSettings,
      addTransaction, addTransactionsBulk, updateTransaction, deleteTransaction,
      refreshGoals, addGoal, updateGoal, deleteGoal,
      refreshAccounts, addAccount, updateAccount, deleteAccount,
      refreshAssets, addAsset, updateAsset, deleteAsset,
      applyTrade,
    }}>
      {children}
    </PortfolioContext.Provider>
  )
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext)
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider')
  return ctx
}

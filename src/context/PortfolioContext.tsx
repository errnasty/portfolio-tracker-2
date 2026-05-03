'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { enrichHoldings, calcPortfolioStats, convertToBase } from '@/lib/calculations'
import { deriveAllPositions } from '@/lib/transactions'
import type {
  Holding, PriceQuote, FxRates, EnrichedHolding, PortfolioStats,
  Currency, TargetAllocation, UserSettings, Transaction, DerivedPosition, Goal,
  CashBalance,
} from '@/types'

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
  cashBalances: CashBalance[]
  totalCashBase: number
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
  refreshCashBalances: () => Promise<void>
  upsertCashBalance: (currency: string, balance: number, notes?: string | null) => Promise<void>
  deleteCashBalance: (id: string) => Promise<void>
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
  const [cashBalances, setCashBalances] = useState<CashBalance[]>([])
  const [loading, setLoading] = useState(true)

  const baseCurrency: Currency = (settings?.base_currency as Currency) ?? 'USD'

  // Derive positions per ticker from transaction log
  const positions: Record<string, DerivedPosition> = deriveAllPositions(transactions)

  // Merge: when transactions exist for a ticker, override the holding's
  // shares + cost basis with the derived values. Holdings without txns fall
  // back to the legacy stored fields (handles migration cleanly).
  const mergedHoldings: Holding[] = holdings.map((h) => {
    const pos = positions[h.ticker.toUpperCase()]
    if (!pos || (pos.buyCount === 0 && pos.sellCount === 0)) return h
    return {
      ...h,
      shares: pos.shares,
      cost_basis_per_share: pos.avgCostBasis,
      cost_basis_currency: (pos.costCurrency as Currency) ?? h.cost_basis_currency,
    }
  })

  const enriched: EnrichedHolding[] = fxRates && mergedHoldings.length > 0
    ? enrichHoldings(mergedHoldings, prices, fxRates).filter((h) => h.shares > 0)
    : []

  // Sum cash across all currencies, converted to base.
  const totalCashBase = fxRates
    ? cashBalances.reduce((s, c) => s + convertToBase(Number(c.balance) || 0, c.currency, fxRates), 0)
    : 0

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
    const res = await fetch(`/api/fx?base=${base}&symbols=USD,SGD,EUR`)
    if (res.ok) {
      const data = await res.json()
      setFxRates(data)
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

  const refreshCashBalances = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('cash_balances').select('*').eq('user_id', user.id).order('currency')
    setCashBalances(data ?? [])
  }, [])

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
    const tickers = Array.from(new Set([
      ...holdings.map((h) => h.ticker),
      ...transactions.map((t) => t.ticker),
    ]))
    if (tickers.length === 0) return
    const res = await fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    })
    if (res.ok) {
      const data = await res.json()
      setPrices(data.quotes)
    }
  }, [holdings, transactions])

  // Initial load
  useEffect(() => {
    async function init() {
      setLoading(true)
      await fetchSettings()
      await refreshHoldings()
      await refreshTransactions()
      await refreshGoals()
      await refreshCashBalances()
      setLoading(false)
    }
    init()
  }, [fetchSettings, refreshHoldings, refreshTransactions, refreshGoals, refreshCashBalances])

  useEffect(() => {
    fetchFxRates(baseCurrency)
  }, [baseCurrency, fetchFxRates])

  // Refresh prices when the set of tickers changes
  useEffect(() => {
    refreshPrices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length, transactions.length])

  // ── Holding CRUD ────────────────────────────────────────────────────────
  const addHolding = async (data: Omit<Holding, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // Insert holding row + an initial buy transaction so we have a clean log.
    const { data: holdingRow } = await supabase.from('holdings').insert({ ...data, user_id: user.id }).select().single()
    if (holdingRow && data.shares > 0 && data.cost_basis_per_share > 0) {
      await supabase.from('transactions').insert({
        user_id: user.id,
        ticker: data.ticker.toUpperCase(),
        type: 'buy',
        date: new Date().toISOString().slice(0, 10),
        shares: data.shares,
        price_per_share: data.cost_basis_per_share,
        currency: data.cost_basis_currency,
        notes: 'Initial position',
      })
    }
    await refreshHoldings()
    await refreshTransactions()
  }

  const updateHolding = async (id: string, data: Partial<Holding>) => {
    await supabase.from('holdings').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
    await refreshHoldings()
  }

  const deleteHolding = async (id: string) => {
    // Find ticker first so we can offer to delete its transactions
    const holding = holdings.find((h) => h.id === id)
    await supabase.from('holdings').delete().eq('id', id)
    if (holding) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('transactions')
          .delete()
          .eq('user_id', user.id)
          .eq('ticker', holding.ticker)
      }
    }
    await refreshHoldings()
    await refreshTransactions()
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
  const addTransaction = async (t: Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('transactions').insert({
      ...t,
      ticker: t.ticker.toUpperCase(),
      user_id: user.id,
    })
    // Ensure a holding row exists for this ticker (so the dashboard picks it up)
    const tickerUpper = t.ticker.toUpperCase()
    if (!holdings.some((h) => h.ticker.toUpperCase() === tickerUpper)) {
      await supabase.from('holdings').insert({
        user_id: user.id,
        ticker: tickerUpper,
        name: null,
        shares: 0,
        cost_basis_per_share: 0,
        cost_basis_currency: t.currency,
      })
    }
    await refreshHoldings()
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
      console.error('Bulk insert failed:', error)
      return { inserted: 0 }
    }

    // Make sure a holding row exists for every ticker we just inserted txns for
    const existingTickers = new Set(holdings.map((h) => h.ticker.toUpperCase()))
    const newTickers = Array.from(new Set(payload.map((r) => r.ticker)))
      .filter((t) => !existingTickers.has(t))
    if (newTickers.length > 0) {
      await supabase.from('holdings').insert(
        newTickers.map((ticker) => ({
          user_id: user.id,
          ticker,
          name: null,
          shares: 0,
          cost_basis_per_share: 0,
          cost_basis_currency: 'USD',
        })),
      )
    }

    await refreshHoldings()
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

  // ── Cash CRUD ──────────────────────────────────────────────────────────
  const upsertCashBalance = async (currency: string, balance: number, notes: string | null = null) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('cash_balances').upsert(
      { user_id: user.id, currency: currency.toUpperCase(), balance, notes, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,currency' },
    )
    await refreshCashBalances()
  }

  const deleteCashBalance = async (id: string) => {
    await supabase.from('cash_balances').delete().eq('id', id)
    await refreshCashBalances()
  }

  return (
    <PortfolioContext.Provider value={{
      holdings: mergedHoldings, enriched, stats, prices, fxRates, targets, settings,
      transactions, positions, goals, cashBalances, totalCashBase,
      loading, refreshHoldings, refreshPrices, refreshTransactions,
      addHolding, updateHolding, deleteHolding,
      upsertTarget, deleteTarget, updateSettings,
      addTransaction, addTransactionsBulk, updateTransaction, deleteTransaction,
      refreshGoals, addGoal, updateGoal, deleteGoal,
      refreshCashBalances, upsertCashBalance, deleteCashBalance,
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

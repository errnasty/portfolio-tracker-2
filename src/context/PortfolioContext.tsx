'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { enrichHoldings, calcPortfolioStats } from '@/lib/calculations'
import type {
  Holding, PriceQuote, FxRates, EnrichedHolding, PortfolioStats,
  Currency, TargetAllocation, UserSettings,
} from '@/types'

interface PortfolioContextValue {
  holdings: Holding[]
  enriched: EnrichedHolding[]
  stats: PortfolioStats | null
  prices: Record<string, PriceQuote>
  fxRates: FxRates | null
  targets: TargetAllocation[]
  settings: UserSettings | null
  loading: boolean
  refreshHoldings: () => Promise<void>
  refreshPrices: () => Promise<void>
  addHolding: (data: Omit<Holding, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateHolding: (id: string, data: Partial<Holding>) => Promise<void>
  deleteHolding: (id: string) => Promise<void>
  upsertTarget: (ticker: string, pct: number) => Promise<void>
  deleteTarget: (id: string) => Promise<void>
  updateSettings: (s: Partial<UserSettings>) => Promise<void>
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null)

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [prices, setPrices] = useState<Record<string, PriceQuote>>({})
  const [fxRates, setFxRates] = useState<FxRates | null>(null)
  const [targets, setTargets] = useState<TargetAllocation[]>([])
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const baseCurrency: Currency = (settings?.base_currency as Currency) ?? 'USD'

  const enriched: EnrichedHolding[] = fxRates && holdings.length > 0
    ? enrichHoldings(holdings, prices, fxRates)
    : []

  const stats: PortfolioStats | null = enriched.length > 0
    ? calcPortfolioStats(enriched, baseCurrency)
    : null

  const fetchSettings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).single()
    if (data) {
      setSettings(data)
    } else {
      // Create default settings
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

  const refreshPrices = useCallback(async () => {
    if (holdings.length === 0) return
    const tickers = holdings.map((h) => h.ticker)
    const res = await fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    })
    if (res.ok) {
      const data = await res.json()
      setPrices(data.quotes)
    }
  }, [holdings])

  // Initial load
  useEffect(() => {
    async function init() {
      setLoading(true)
      await fetchSettings()
      await refreshHoldings()
      setLoading(false)
    }
    init()
  }, [fetchSettings, refreshHoldings])

  // When settings change, refresh FX rates
  useEffect(() => {
    fetchFxRates(baseCurrency)
  }, [baseCurrency, fetchFxRates])

  // When holdings change, fetch prices
  useEffect(() => {
    refreshPrices()
  }, [holdings.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const addHolding = async (data: Omit<Holding, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('holdings').insert({ ...data, user_id: user.id })
    await refreshHoldings()
  }

  const updateHolding = async (id: string, data: Partial<Holding>) => {
    await supabase.from('holdings').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
    await refreshHoldings()
  }

  const deleteHolding = async (id: string) => {
    await supabase.from('holdings').delete().eq('id', id)
    await refreshHoldings()
  }

  const upsertTarget = async (ticker: string, pct: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('target_allocations').upsert(
      { user_id: user.id, ticker, target_pct: pct, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,ticker' },
    )
    await refreshHoldings()
  }

  const deleteTarget = async (id: string) => {
    await supabase.from('target_allocations').delete().eq('id', id)
    await refreshHoldings()
  }

  const updateSettings = async (s: Partial<UserSettings>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('user_settings').update({ ...s, updated_at: new Date().toISOString() }).eq('user_id', user.id)
    setSettings((prev) => prev ? { ...prev, ...s } : null)
  }

  return (
    <PortfolioContext.Provider value={{
      holdings, enriched, stats, prices, fxRates, targets, settings,
      loading, refreshHoldings, refreshPrices,
      addHolding, updateHolding, deleteHolding,
      upsertTarget, deleteTarget, updateSettings,
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

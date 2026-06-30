'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { convertToBase } from '@/lib/calculations'
import { usePortfolio } from '@/context/PortfolioContext'
import { DEFAULT_CATEGORIES, guessCategoryName } from '@/lib/categorize'
import type { Category, CategoryRule, BankTransaction, SpendingStats, FxRates, Currency } from '@/types'

type BankTxnInsert = Omit<BankTransaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>

interface SpendingContextValue {
  categories: Category[]
  bankTransactions: BankTransaction[]
  categoryRules: CategoryRule[]
  categoryById: Record<string, Category>
  spendingStats: SpendingStats          // current calendar month, base currency
  loading: boolean
  error: string | null
  refreshCategories: () => Promise<void>
  refreshBankTransactions: () => Promise<void>
  refreshCategoryRules: () => Promise<void>
  addCategory: (data: { name: string; kind?: Category['kind']; color?: string | null; icon?: string | null }) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  addCategoryRule: (matchText: string, categoryId: string, priority?: number) => Promise<void>
  deleteCategoryRule: (id: string) => Promise<void>
  addBankTransaction: (t: BankTxnInsert) => Promise<void>
  updateBankTransaction: (id: string, data: Partial<BankTransaction>) => Promise<void>
  deleteBankTransaction: (id: string) => Promise<void>
  bulkInsertBankTransactions: (rows: BankTxnInsert[]) => Promise<{ inserted: number }>
  statsForMonth: (ym: string) => SpendingStats
  // Best category id for a transaction: user rules first, then built-in keywords.
  categorize: (description: string, merchant?: string | null) => string | null
}

const SpendingContext = createContext<SpendingContextValue | null>(null)

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function computeStats(
  txns: BankTransaction[],
  ym: string,
  categories: Category[],
  fxRates: FxRates | null,
): SpendingStats {
  const catName = new Map(categories.map((c) => [c.id, c.name]))
  // Transfers (e.g. top-ups to a brokerage account) move money between your own
  // accounts — they're neither income nor spending, so exclude them.
  const transferIds = new Set(categories.filter((c) => c.kind === 'transfer').map((c) => c.id))
  const toBase = (amt: number, cur: string) =>
    fxRates ? convertToBase(amt, cur, fxRates) : amt

  let income = 0
  let expense = 0
  const byCat = new Map<string, { name: string; amount: number }>()

  for (const t of txns) {
    if (!t.date.startsWith(ym)) continue
    if (t.category_id && transferIds.has(t.category_id)) continue
    const base = toBase(Number(t.amount) || 0, t.currency)
    if (base >= 0) {
      income += base
    } else {
      const mag = -base
      expense += mag
      const key = t.category_id ?? '__uncat__'
      const name = t.category_id ? (catName.get(t.category_id) ?? 'Other') : 'Uncategorized'
      const prev = byCat.get(key)
      byCat.set(key, { name, amount: (prev?.amount ?? 0) + mag })
    }
  }

  const byCategory = Array.from(byCat.entries())
    .map(([key, v]) => ({ category_id: key === '__uncat__' ? null : key, name: v.name, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)

  return { month: ym, income, expense, net: income - expense, byCategory }
}

export function SpendingProvider({ children }: { children: React.ReactNode }) {
  const { fxRates, settings } = usePortfolio()
  const [categories, setCategories] = useState<Category[]>([])
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([])
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshCategories = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error: err } = await supabase
      .from('categories').select('*').eq('user_id', user.id).order('sort').order('name')
    if (err) {
      const missing = err.code === '42P01' || /relation .* does not exist/i.test(err.message)
      setError(missing
        ? 'The categories table is missing. Re-run supabase-schema.sql in your Supabase SQL editor.'
        : `Couldn't load categories: ${err.message}`)
      return
    }
    setError(null)

    // Seed defaults for a brand-new user.
    if ((data ?? []).length === 0) {
      const payload = DEFAULT_CATEGORIES.map((c, i) => ({
        user_id: user.id, name: c.name, kind: c.kind, color: c.color, icon: c.icon, sort: i,
      }))
      const { data: seeded } = await supabase.from('categories').insert(payload).select('*')
      setCategories(seeded ?? [])
      return
    }
    setCategories(data ?? [])
  }, [])

  const refreshBankTransactions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error: err } = await supabase
      .from('bank_transactions').select('*').eq('user_id', user.id)
      .order('date', { ascending: false }).order('created_at', { ascending: false })
    if (err) {
      const missing = err.code === '42P01' || /relation .* does not exist/i.test(err.message)
      setError(missing
        ? 'The bank_transactions table is missing. Re-run supabase-schema.sql in your Supabase SQL editor.'
        : `Couldn't load transactions: ${err.message}`)
      return
    }
    setBankTransactions(data ?? [])
  }, [])

  const refreshCategoryRules = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('category_rules').select('*').eq('user_id', user.id)
      .order('priority', { ascending: false })
    setCategoryRules(data ?? [])
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await refreshCategories()
      await refreshBankTransactions()
      await refreshCategoryRules()
      setLoading(false)
    }
    init()
  }, [refreshCategories, refreshBankTransactions, refreshCategoryRules])

  const addCategory: SpendingContextValue['addCategory'] = async ({ name, kind = 'expense', color = null, icon = null }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase.from('categories').insert({
      user_id: user.id, name, kind, color, icon, sort: categories.length,
    })
    if (err) { toast.error(`Add category failed: ${err.message}`); throw err }
    await refreshCategories()
  }

  const deleteCategory = async (id: string) => {
    const { error: err } = await supabase.from('categories').delete().eq('id', id)
    if (err) { toast.error(`Delete category failed: ${err.message}`); throw err }
    await Promise.all([refreshCategories(), refreshBankTransactions()])
  }

  const addCategoryRule = async (matchText: string, categoryId: string, priority = 0) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase.from('category_rules').upsert(
      { user_id: user.id, match_text: matchText.trim().toLowerCase(), category_id: categoryId, priority },
      { onConflict: 'user_id,match_text' },
    )
    if (err) { toast.error(`Add rule failed: ${err.message}`); throw err }
    await refreshCategoryRules()
  }

  const deleteCategoryRule = async (id: string) => {
    const { error: err } = await supabase.from('category_rules').delete().eq('id', id)
    if (err) { toast.error(`Delete rule failed: ${err.message}`); throw err }
    await refreshCategoryRules()
  }

  const addBankTransaction = async (t: BankTxnInsert) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase.from('bank_transactions').insert({ ...t, user_id: user.id })
    if (err) { toast.error(`Add transaction failed: ${err.message}`); throw err }
    await refreshBankTransactions()
  }

  const updateBankTransaction = async (id: string, data: Partial<BankTransaction>) => {
    const { error: err } = await supabase.from('bank_transactions')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
    if (err) { toast.error(`Update failed: ${err.message}`); throw err }
    await refreshBankTransactions()
  }

  const deleteBankTransaction = async (id: string) => {
    const { error: err } = await supabase.from('bank_transactions').delete().eq('id', id)
    if (err) { toast.error(`Delete failed: ${err.message}`); throw err }
    await refreshBankTransactions()
  }

  const bulkInsertBankTransactions = async (rows: BankTxnInsert[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || rows.length === 0) return { inserted: 0 }
    const payload = rows.map((r) => ({ ...r, user_id: user.id }))
    // Skip rows whose (user_id, external_id) already exists — lets the user
    // re-import the same statement without creating duplicates.
    const { data, error: err } = await supabase
      .from('bank_transactions')
      .upsert(payload, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
      .select('id')
    if (err) { toast.error(`Import failed: ${err.message}`); return { inserted: 0 } }
    await refreshBankTransactions()
    return { inserted: data?.length ?? 0 }
  }

  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])) as Record<string, Category>,
    [categories],
  )

  const catIdByName = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name, c.id])) as Record<string, string>,
    [categories],
  )

  // User rules sorted by priority, then longest keyword (most specific) first.
  const sortedRules = useMemo(
    () => [...categoryRules].sort((a, b) => b.priority - a.priority || b.match_text.length - a.match_text.length),
    [categoryRules],
  )

  const categorize = useCallback((description: string, merchant?: string | null): string | null => {
    const text = `${description ?? ''} ${merchant ?? ''}`.toLowerCase()
    for (const r of sortedRules) {
      if (r.match_text && text.includes(r.match_text)) return r.category_id
    }
    const g = guessCategoryName(description, merchant)
    return g ? (catIdByName[g] ?? null) : null
  }, [sortedRules, catIdByName])

  const statsForMonth = useCallback(
    (ym: string) => computeStats(bankTransactions, ym, categories, fxRates),
    [bankTransactions, categories, fxRates],
  )

  const spendingStats = useMemo(
    () => computeStats(bankTransactions, currentMonth(), categories, fxRates),
    [bankTransactions, categories, fxRates],
  )

  // settings referenced so base-currency changes re-render consumers cleanly.
  void (settings?.base_currency as Currency | undefined)

  return (
    <SpendingContext.Provider value={{
      categories, bankTransactions, categoryRules, categoryById, spendingStats, loading, error,
      refreshCategories, refreshBankTransactions, refreshCategoryRules,
      addCategory, deleteCategory, addCategoryRule, deleteCategoryRule,
      addBankTransaction, updateBankTransaction, deleteBankTransaction, bulkInsertBankTransactions,
      statsForMonth, categorize,
    }}>
      {children}
    </SpendingContext.Provider>
  )
}

export function useSpending() {
  const ctx = useContext(SpendingContext)
  if (!ctx) throw new Error('useSpending must be used within SpendingProvider')
  return ctx
}

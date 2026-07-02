'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { convertToBase } from '@/lib/calculations'
import { usePortfolio } from '@/context/PortfolioContext'
import { DEFAULT_CATEGORIES, guessCategoryName } from '@/lib/categorize'
import { detectSubscriptions } from '@/lib/subscriptions'
import type {
  Category, CategoryRule, BankTransaction, SpendingStats, FxRates, Currency,
  Subscription, SubscriptionStatus, SubscriptionState, Budget, PayeeAlias,
} from '@/types'

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
  subscriptions: Subscription[]
  subscriptionSummary: { totalMonthly: number; activeMonthly: number; potentialMonthly: number; cancelledMonthly: number }
  setSubscriptionStatus: (key: string, status: SubscriptionState, opts?: { label?: string; monthlyAmount?: number }) => Promise<void>
  budgets: Budget[]
  refreshBudgets: () => Promise<void>
  upsertBudget: (categoryId: string, amount: number) => Promise<void>
  deleteBudget: (categoryId: string) => Promise<void>
  payeeAliases: PayeeAlias[]
  refreshPayeeAliases: () => Promise<void>
  upsertPayeeAlias: (payeeKey: string, alias: string) => Promise<void>
  resolveDescription: (t: BankTransaction) => string
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
  const { fxRates, settings, accounts, updateAccount, addAccount, refreshAccounts } = usePortfolio()
  const [categories, setCategories] = useState<Category[]>([])
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([])
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([])
  const [subscriptionStatuses, setSubscriptionStatuses] = useState<SubscriptionStatus[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [payeeAliases, setPayeeAliases] = useState<PayeeAlias[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Keep account balances connected to spending: every credit/debit on an
  // account nudges its stored balance, so income shows up as cash and net
  // worth/investable cash stay current without manual edits.
  const adjustAccountBalance = useCallback(async (accountId: string | null, delta: number) => {
    if (!accountId || !delta) return
    const acc = accounts.find((a) => a.id === accountId)
    if (!acc) return
    try {
      await updateAccount(accountId, { current_balance: Number(acc.current_balance) + delta })
    } catch { /* balance is best-effort; transaction already saved */ }
  }, [accounts, updateAccount])

  // Money moved to Interactive Brokers shows up as investable brokerage cash.
  const isIbkrTransfer = (description: string, merchant?: string | null) =>
    /interactive br|rec trust|ibkr/i.test(`${description} ${merchant ?? ''}`)

  const creditBrokerageCash = useCallback(async (amount: number, currency: string) => {
    if (amount <= 0) return
    const acc = accounts.find((a) => a.type === 'cash' && /interactive|ibkr|brokerage/i.test(`${a.name} ${a.institution ?? ''}`))
    try {
      if (acc) await updateAccount(acc.id, { current_balance: Number(acc.current_balance) + amount })
      else await addAccount({ name: 'Interactive Brokers', type: 'cash', institution: 'Interactive Brokers', currency, current_balance: amount, is_active: true })
    } catch { /* best-effort */ }
  }, [accounts, updateAccount, addAccount])

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

    let cats = data ?? []
    // Seed a new user, and one-time backfill of defaults added in later versions
    // (e.g. Giving/Education) so categorize() resolves. The one-time guard means
    // deleting a default category afterwards sticks (we don't re-add it).
    let backfilled = false
    try { backfilled = window.localStorage.getItem('categories_backfill_v2') === '1' } catch { /* ignore */ }
    if (cats.length === 0 || !backfilled) {
      const missing = DEFAULT_CATEGORIES.filter((d) => !cats.some((c) => c.name === d.name))
      if (missing.length > 0) {
        const payload = missing.map((c) => ({
          user_id: user.id, name: c.name, kind: c.kind, color: c.color, icon: c.icon,
          sort: DEFAULT_CATEGORIES.findIndex((x) => x.name === c.name),
        }))
        await supabase.from('categories').insert(payload)
        // Reload regardless of insert outcome — tolerates the unique-constraint
        // race when two tabs/effects seed at once.
        const { data: after } = await supabase
          .from('categories').select('*').eq('user_id', user.id)
        if (after) cats = after
      }
      try { window.localStorage.setItem('categories_backfill_v2', '1') } catch { /* ignore */ }
    }
    setCategories(
      [...cats].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name)),
    )
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

  const refreshSubscriptionStatuses = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('subscription_status').select('*').eq('user_id', user.id)
    setSubscriptionStatuses(data ?? [])
  }, [])

  const refreshBudgets = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('budgets').select('*').eq('user_id', user.id)
    setBudgets(data ?? [])
  }, [])

  const refreshPayeeAliases = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('payee_aliases').select('*').eq('user_id', user.id)
    setPayeeAliases(data ?? [])
  }, [])

  const upsertPayeeAlias = async (payeeKey: string, alias: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase.from('payee_aliases').upsert(
      { user_id: user.id, payee_key: payeeKey, alias: alias.trim(), updated_at: new Date().toISOString() },
      { onConflict: 'user_id,payee_key' },
    )
    if (err) { toast.error(`Save name failed: ${err.message}`); throw err }
    await refreshPayeeAliases()
  }

  useEffect(() => {
    async function init() {
      setLoading(true)
      await refreshCategories()
      await refreshBankTransactions()
      await refreshCategoryRules()
      await refreshSubscriptionStatuses()
      await refreshBudgets()
      await refreshPayeeAliases()
      setLoading(false)
    }
    init()
  }, [refreshCategories, refreshBankTransactions, refreshCategoryRules, refreshSubscriptionStatuses, refreshBudgets, refreshPayeeAliases])

  // Auto-sync Gmail bank alerts once per session (if connected & not synced
  // recently) so spending stays current without a manual "Sync now".
  useEffect(() => {
    if (loading) return
    let cancelled = false
    ;(async () => {
      try { if (window.sessionStorage.getItem('gmail_autosync_done')) return } catch { return }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: tok } = await supabase
        .from('google_tokens').select('last_synced').eq('user_id', user.id).maybeSingle()
      if (!tok) return // Gmail not connected
      try { window.sessionStorage.setItem('gmail_autosync_done', '1') } catch { /* ignore */ }
      // Throttle: skip if synced within the last 6h.
      if (tok.last_synced && Date.now() - new Date(tok.last_synced).getTime() < 6 * 3600 * 1000) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      try {
        const res = await fetch('/api/bank/gmail-sync', {
          method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok || cancelled) return
        const j = await res.json().catch(() => null)
        if (j?.inserted > 0) {
          await refreshBankTransactions()
          await refreshAccounts()
          toast.success(`Synced ${j.inserted} new transaction${j.inserted === 1 ? '' : 's'} from Gmail`)
        }
      } catch { /* silent — manual Sync still available */ }
    })()
    return () => { cancelled = true }
  }, [loading, refreshBankTransactions, refreshAccounts])

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
    // Rules for this category are cascade-deleted in the DB; transactions are
    // set to null (FK). Refresh all three so state can't reference a ghost id.
    await Promise.all([refreshCategories(), refreshBankTransactions(), refreshCategoryRules()])
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

  const setSubscriptionStatus = async (
    key: string, status: SubscriptionState, opts?: { label?: string; monthlyAmount?: number },
  ) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase.from('subscription_status').upsert(
      {
        user_id: user.id, merchant_key: key, status,
        label: opts?.label ?? null, monthly_amount: opts?.monthlyAmount ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,merchant_key' },
    )
    if (err) { toast.error(`Save failed: ${err.message}`); throw err }
    await refreshSubscriptionStatuses()
  }

  const upsertBudget = async (categoryId: string, amount: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase.from('budgets').upsert(
      { user_id: user.id, category_id: categoryId, amount, period: 'monthly', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,category_id' },
    )
    if (err) { toast.error(`Save budget failed: ${err.message}`); throw err }
    await refreshBudgets()
  }

  const deleteBudget = async (categoryId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase.from('budgets').delete()
      .eq('user_id', user.id).eq('category_id', categoryId)
    if (err) { toast.error(`Delete budget failed: ${err.message}`); throw err }
    await refreshBudgets()
  }

  const addBankTransaction = async (t: BankTxnInsert) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase.from('bank_transactions').insert({ ...t, user_id: user.id })
    if (err) { toast.error(`Add transaction failed: ${err.message}`); throw err }
    await adjustAccountBalance(t.account_id, Number(t.amount) || 0)
    if (isIbkrTransfer(t.description, t.merchant) && Number(t.amount) < 0) {
      await creditBrokerageCash(-Number(t.amount), t.currency)
    }
    await refreshBankTransactions()
  }

  const updateBankTransaction = async (id: string, data: Partial<BankTransaction>) => {
    const prev = bankTransactions.find((t) => t.id === id)
    const { error: err } = await supabase.from('bank_transactions')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
    if (err) { toast.error(`Update failed: ${err.message}`); throw err }
    // Reconcile account balances if the amount or account changed.
    if (prev) {
      const newAccount = data.account_id !== undefined ? data.account_id : prev.account_id
      const newAmount = data.amount !== undefined ? Number(data.amount) : Number(prev.amount)
      if (newAccount === prev.account_id) {
        await adjustAccountBalance(prev.account_id, newAmount - Number(prev.amount))
      } else {
        await adjustAccountBalance(prev.account_id, -Number(prev.amount))
        await adjustAccountBalance(newAccount, newAmount)
      }
    }
    await refreshBankTransactions()
  }

  const deleteBankTransaction = async (id: string) => {
    const prev = bankTransactions.find((t) => t.id === id)
    const { error: err } = await supabase.from('bank_transactions').delete().eq('id', id)
    if (err) { toast.error(`Delete failed: ${err.message}`); throw err }
    if (prev) await adjustAccountBalance(prev.account_id, -Number(prev.amount))
    await refreshBankTransactions()
  }

  const bulkInsertBankTransactions = async (rows: BankTxnInsert[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || rows.length === 0) return { inserted: 0 }

    // Re-import safety: skip rows whose external_id already exists for this user.
    // Done in code (a SELECT + filter) rather than ON CONFLICT, so it doesn't
    // depend on a specific DB unique constraint.
    const ids = rows.map((r) => r.external_id).filter((x): x is string => !!x)
    const existing = new Set<string>()
    if (ids.length > 0) {
      const { data: ex } = await supabase
        .from('bank_transactions').select('external_id').eq('user_id', user.id).in('external_id', ids)
      for (const r of ex ?? []) if (r.external_id) existing.add(r.external_id)
    }

    const seenBatch = new Set<string>()
    const payload = rows
      .filter((r) => {
        if (!r.external_id) return true
        if (existing.has(r.external_id) || seenBatch.has(r.external_id)) return false
        seenBatch.add(r.external_id)
        return true
      })
      .map((r) => ({ ...r, user_id: user.id }))
    if (payload.length === 0) { await refreshBankTransactions(); return { inserted: 0 } }

    const { data, error: err } = await supabase.from('bank_transactions').insert(payload).select('id')
    if (err) { toast.error(`Import failed: ${err.message}`); return { inserted: 0 } }
    // Nudge each affected account's balance by its net imported flow.
    const byAccount = new Map<string, number>()
    let ibkrTotal = 0
    let ibkrCurrency = 'SGD'
    for (const r of payload) {
      if (r.account_id) byAccount.set(r.account_id, (byAccount.get(r.account_id) ?? 0) + (Number(r.amount) || 0))
      if (isIbkrTransfer(r.description, r.merchant) && Number(r.amount) < 0) {
        ibkrTotal += -Number(r.amount); ibkrCurrency = r.currency
      }
    }
    for (const [accId, delta] of byAccount) await adjustAccountBalance(accId, delta)
    if (ibkrTotal > 0) await creditBrokerageCash(ibkrTotal, ibkrCurrency)
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

  const catNameById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])) as Record<string, string>,
    [categories],
  )

  const aliasByKey = useMemo(
    () => Object.fromEntries(payeeAliases.map((a) => [a.payee_key, a.alias])) as Record<string, string>,
    [payeeAliases],
  )

  const resolveDescription = useCallback(
    (t: BankTransaction) => (t.payee_key ? aliasByKey[t.payee_key] : undefined) || t.description,
    [aliasByKey],
  )

  const subscriptions = useMemo<Subscription[]>(() => {
    const statusByKey = new Map(subscriptionStatuses.map((s) => [s.merchant_key, s.status]))
    return detectSubscriptions(bankTransactions, catNameById, fxRates).map((d) => ({
      ...d,
      annualAmount: d.monthlyAmount * 12,
      status: statusByKey.get(d.key) ?? 'active',
    }))
  }, [bankTransactions, catNameById, fxRates, subscriptionStatuses])

  const subscriptionSummary = useMemo(() => {
    let totalMonthly = 0, activeMonthly = 0, potentialMonthly = 0, cancelledMonthly = 0
    for (const s of subscriptions) {
      totalMonthly += s.monthlyAmount
      if (s.status === 'cancelled') cancelledMonthly += s.monthlyAmount
      else {
        activeMonthly += s.monthlyAmount
        if (s.status === 'could_cancel') potentialMonthly += s.monthlyAmount
      }
    }
    return { totalMonthly, activeMonthly, potentialMonthly, cancelledMonthly }
  }, [subscriptions])

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
      subscriptions, subscriptionSummary, setSubscriptionStatus,
      budgets, refreshBudgets, upsertBudget, deleteBudget,
      payeeAliases, refreshPayeeAliases, upsertPayeeAlias, resolveDescription,
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

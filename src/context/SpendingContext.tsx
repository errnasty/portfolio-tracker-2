'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { convertToBase, convertBetween } from '@/lib/calculations'
import { usePortfolio } from '@/context/PortfolioContext'
import { DEFAULT_CATEGORIES, guessCategoryName } from '@/lib/categorize'
import { findFuzzyDuplicate } from '@/lib/txn-dedupe'
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
  // Apply a keyword→category rule to existing *uncategorized* transactions.
  // Returns how many rows were updated.
  applyRuleRetroactively: (matchText: string, categoryId: string) => Promise<number>
  addBankTransaction: (t: BankTxnInsert) => Promise<void>
  updateBankTransaction: (id: string, data: Partial<BankTransaction>) => Promise<void>
  deleteBankTransaction: (id: string) => Promise<void>
  bulkInsertBankTransactions: (rows: BankTxnInsert[]) => Promise<{ inserted: number }>
  // Move money between two of your own accounts. Writes a matched pair of
  // Transfers-category rows (excluded from income/spending) and nudges both
  // balances. amountTo defaults to the FX conversion of amountFrom.
  transferBetweenAccounts: (opts: {
    fromAccountId: string
    toAccountId: string
    amountFrom: number
    amountTo?: number
    date: string
    notes?: string | null
  }) => Promise<void>
  // Reclassify an existing expense/income row as a transfer and create the
  // matching opposite row on the counterpart account ("this wasn't spending,
  // it went to my savings account" — and vice versa).
  convertToTransfer: (txnId: string, counterpartAccountId: string) => Promise<void>
  statsForMonth: (ym: string) => SpendingStats
  // Best category id for a transaction: user rules first, then built-in keywords.
  categorize: (description: string, merchant?: string | null) => string | null
  // AI-powered categorization (free OpenRouter model, keyword fallback).
  // Returns category id or null. Async because it calls the server.
  aiCategorize: (description: string, merchant: string | null, amount: number, currency?: string) => Promise<string | null>
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
  const incomeByCat = new Map<string, { name: string; amount: number }>()

  for (const t of txns) {
    if (!t.date.startsWith(ym)) continue
    if (t.category_id && transferIds.has(t.category_id)) continue
    const base = toBase(Number(t.amount) || 0, t.currency)
    const key = t.category_id ?? '__uncat__'
    const name = t.category_id ? (catName.get(t.category_id) ?? 'Other') : 'Uncategorized'
    if (base >= 0) {
      income += base
      const prev = incomeByCat.get(key)
      incomeByCat.set(key, { name, amount: (prev?.amount ?? 0) + base })
    } else {
      const mag = -base
      expense += mag
      const prev = byCat.get(key)
      byCat.set(key, { name, amount: (prev?.amount ?? 0) + mag })
    }
  }

  const toSorted = (m: Map<string, { name: string; amount: number }>) =>
    Array.from(m.entries())
      .map(([key, v]) => ({ category_id: key === '__uncat__' ? null : key, name: v.name, amount: v.amount }))
      .sort((a, b) => b.amount - a.amount)

  return {
    month: ym, income, expense, net: income - expense,
    byCategory: toSorted(byCat), incomeByCategory: toSorted(incomeByCat),
  }
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
    try { backfilled = window.localStorage.getItem('categories_backfill_v3') === '1' } catch { /* ignore */ }
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
      try { window.localStorage.setItem('categories_backfill_v3', '1') } catch { /* ignore */ }
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
      // Independent per-table fetches — no ordering dependency between them.
      await Promise.all([
        refreshCategories(),
        refreshBankTransactions(),
        refreshCategoryRules(),
        refreshSubscriptionStatuses(),
        refreshBudgets(),
        refreshPayeeAliases(),
      ])
      setLoading(false)
    }
    init()
  }, [refreshCategories, refreshBankTransactions, refreshCategoryRules, refreshSubscriptionStatuses, refreshBudgets, refreshPayeeAliases])

  // Auto-refresh bank transactions once per session so any transactions
  // received via the inbound email webhook appear without a manual refresh.
  // The webhook inserts rows server-side; this just pulls them into the UI.
  useEffect(() => {
    if (loading) return
    let cancelled = false
    ;(async () => {
      try { if (window.sessionStorage.getItem('inbound_autorefresh_done')) return } catch { return }
      try { window.sessionStorage.setItem('inbound_autorefresh_done', '1') } catch { /* ignore */ }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // Check if user has an inbound address
      const { data: addr } = await supabase
        .from('inbound_addresses').select('address').eq('user_id', user.id).maybeSingle()
      if (!addr) return // No inbound address provisioned yet
      await refreshBankTransactions()
    })()
    return () => { cancelled = true }
  }, [loading, refreshBankTransactions])

  // Live updates: a webhook-forwarded bank email lands in the DB from a
  // server route, not this browser tab, so without a subscription the user
  // wouldn't see it until their next manual refresh or reload. Debounced so
  // a burst of inserts (e.g. a CSV-shaped batch) triggers one refetch.
  // Falls back gracefully to the once-per-session refresh above if Realtime
  // isn't enabled on the Supabase project.
  useEffect(() => {
    if (loading) return
    let debounce: ReturnType<typeof setTimeout> | undefined
    let channel: ReturnType<typeof supabase.channel> | null = null
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      channel = supabase
        .channel(`bank_transactions_live_${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'bank_transactions', filter: `user_id=eq.${user.id}` },
          () => {
            clearTimeout(debounce)
            debounce = setTimeout(() => { refreshBankTransactions() }, 1500)
          },
        )
        .subscribe()
    })()
    return () => {
      clearTimeout(debounce)
      if (channel) supabase.removeChannel(channel)
    }
  }, [loading, refreshBankTransactions])

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

  const applyRuleRetroactively = async (matchText: string, categoryId: string): Promise<number> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0
    // Escape ILIKE wildcards so a literal % / _ in the keyword can't match everything.
    const pattern = `%${matchText.trim().replace(/[%_]/g, '\\$&')}%`
    const { data, error: err } = await supabase.from('bank_transactions')
      .update({ category_id: categoryId, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('category_id', null)
      .ilike('description', pattern)
      .select('id')
    if (err) { toast.error(`Apply rule failed: ${err.message}`); return 0 }
    const n = data?.length ?? 0
    if (n > 0) await refreshBankTransactions()
    return n
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

  // The Transfers category id (kind='transfer'); prefers the seeded "Transfers".
  const transferCategoryId = useMemo(() => {
    const transfers = categories.filter((c) => c.kind === 'transfer')
    return (transfers.find((c) => c.name === 'Transfers') ?? transfers[0])?.id ?? null
  }, [categories])

  const transferBetweenAccounts: SpendingContextValue['transferBetweenAccounts'] = async ({
    fromAccountId, toAccountId, amountFrom, amountTo, date, notes = null,
  }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const fromAcc = accounts.find((a) => a.id === fromAccountId)
    const toAcc = accounts.find((a) => a.id === toAccountId)
    if (!fromAcc || !toAcc || fromAccountId === toAccountId || !(amountFrom > 0)) {
      toast.error('Pick two different accounts and a positive amount')
      throw new Error('Invalid transfer')
    }
    const fromCur = String(fromAcc.currency)
    const toCur = String(toAcc.currency)
    let received = amountTo
    if (received === undefined || !(received > 0)) {
      if (fromCur === toCur) received = amountFrom
      else if (fxRates) received = convertBetween(amountFrom, fromCur, toCur, fxRates)
      else { toast.error('FX rates unavailable — enter the received amount manually'); throw new Error('FX unavailable') }
    }
    const pair = [
      {
        user_id: user.id, account_id: fromAccountId, date,
        description: `Transfer to ${toAcc.name}`, merchant: null,
        amount: -amountFrom, currency: fromCur, category_id: transferCategoryId,
        source: 'manual' as const, external_id: null, notes,
      },
      {
        user_id: user.id, account_id: toAccountId, date,
        description: `Transfer from ${fromAcc.name}`, merchant: null,
        amount: received, currency: toCur, category_id: transferCategoryId,
        source: 'manual' as const, external_id: null, notes,
      },
    ]
    const { error: err } = await supabase.from('bank_transactions').insert(pair)
    if (err) { toast.error(`Transfer failed: ${err.message}`); throw err }
    await adjustAccountBalance(fromAccountId, -amountFrom)
    await adjustAccountBalance(toAccountId, received)
    await refreshBankTransactions()
    toast.success(`Transferred ${amountFrom.toFixed(2)} ${fromCur} → ${toAcc.name}`)
  }

  const convertToTransfer: SpendingContextValue['convertToTransfer'] = async (txnId, counterpartAccountId) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const txn = bankTransactions.find((t) => t.id === txnId)
    const counterpart = accounts.find((a) => a.id === counterpartAccountId)
    if (!txn || !counterpart) { toast.error('Transaction or account not found'); return }
    if (txn.account_id === counterpartAccountId) {
      toast.error('Pick a different account than the transaction’s own')
      return
    }
    const amt = Number(txn.amount) || 0
    // Counterpart gets the opposite flow, converted into its own currency.
    const counterCur = String(counterpart.currency)
    let counterAmt = -amt
    if (String(txn.currency) !== counterCur) {
      if (!fxRates) { toast.error('FX rates unavailable'); return }
      counterAmt = convertBetween(-amt, String(txn.currency), counterCur, fxRates)
    }
    const sourceName = accounts.find((a) => a.id === txn.account_id)?.name ?? 'account'
    const { error: err } = await supabase.from('bank_transactions').insert({
      user_id: user.id, account_id: counterpartAccountId, date: txn.date,
      description: amt < 0 ? `Transfer from ${sourceName}` : `Transfer to ${sourceName}`,
      merchant: null, amount: counterAmt, currency: counterCur,
      category_id: transferCategoryId, source: 'manual' as const, external_id: null,
      notes: `Counterpart of: ${txn.description}`,
    })
    if (err) { toast.error(`Convert failed: ${err.message}`); throw err }
    // Reclassify the original row as a transfer so it leaves income/spending.
    const { error: updErr } = await supabase.from('bank_transactions')
      .update({ category_id: transferCategoryId, updated_at: new Date().toISOString() })
      .eq('id', txnId)
    if (updErr) { toast.error(`Convert failed: ${updErr.message}`); throw updErr }
    await adjustAccountBalance(counterpartAccountId, counterAmt)
    await refreshBankTransactions()
    toast.success(`Marked as transfer ${amt < 0 ? 'to' : 'from'} ${counterpart.name}`)
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

    // Fuzzy dedup: also check existing transactions for same date+amount+description.
    // This catches cross-source duplicates (e.g. CSV import + email webhook) that
    // have different external_ids but are the same transaction.
    const dates = [...new Set(rows.map((r) => r.date))]
    const { data: priorTxns } = await supabase
      .from('bank_transactions')
      .select('id, date, amount, payee_key, description')
      .eq('user_id', user.id)
      .in('date', dates)

    const priorRows = (priorTxns ?? []).map((t) => ({
      id: t.id, date: t.date, amount: t.amount, payee_key: t.payee_key, description: t.description,
    }))

    const seenBatch = new Set<string>()
    const payload = rows
      .filter((r) => {
        // external_id dedup
        if (r.external_id && (existing.has(r.external_id) || seenBatch.has(r.external_id))) return false
        if (r.external_id) seenBatch.add(r.external_id)

        // Fuzzy dedup against existing DB rows
        const dup = findFuzzyDuplicate(
          { date: r.date, amount: r.amount, payee_key: r.payee_key ?? null, description: r.description },
          priorRows,
        )
        if (dup) return false

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

  // AI-powered categorization via the /api/categorize endpoint (OpenRouter
  // free model). Falls back to the sync categorize() if the API call fails.
  const aiCategorize = useCallback(async (
    description: string, merchant: string | null, amount: number, currency?: string,
  ): Promise<string | null> => {
    // Fast path: user rules + keywords first (instant).
    const quick = categorize(description, merchant)
    if (quick) return quick

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null

      const resp = await fetch('/api/categorize', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ description, merchant, amount, currency }),
      })
      if (!resp.ok) return null
      const result = await resp.json()
      if (result.category) {
        return catIdByName[result.category] ?? null
      }
      return null
    } catch {
      return null
    }
  }, [categorize, catIdByName])

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
      addCategory, deleteCategory, addCategoryRule, deleteCategoryRule, applyRuleRetroactively,
      addBankTransaction, updateBankTransaction, deleteBankTransaction, bulkInsertBankTransactions,
      transferBetweenAccounts, convertToTransfer,
      statsForMonth, categorize, aiCategorize,
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

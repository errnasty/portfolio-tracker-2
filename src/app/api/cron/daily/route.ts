import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchQuotes } from '@/lib/server/yahoo'
import { fetchFxRates } from '@/lib/server/fx'
import { insertBankTxnServer } from '@/lib/server/insert-transaction'
import { duePostings, nextDueAfterPostings } from '@/lib/payments'
import { computeCpf, ageInYear, type SalaryBasis } from '@/lib/cpf'
import { convertToBase } from '@/lib/calculations'
import { FUND_PROVIDER_LIST } from '@/lib/fund-providers'
import { CURRENCY_CODES, ASSET_KIND_META } from '@/types'
import type { AssetKind, FxRates } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Daily job (see vercel.json) that moves everything the app used to only do
// client-side-on-load onto a real schedule, so it happens even on days
// nobody opens the app:
//  1. Warm price_cache from Yahoo for every auto-priced ticker in use.
//  2. Warm fx_cache from Frankfurter for every base currency in use.
//  3. Post due recurring bank_transactions (salary/rent/bills).
//  4. Post CPF contributions derived from new Salary income.
//  5. Write today's net-worth snapshot per user.
// Each step is independent and best-effort — one failing step doesn't block
// the rest. Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token
// automatically).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const today = new Date().toISOString().slice(0, 10)

  const report: Record<string, unknown> = {}

  report.prices = await warmPriceCache(db)
  report.fx = await warmFxCache(db)
  report.recurring = await postRecurringPayments(db, today)
  report.cpf = await postCpfContributions(db, today)
  report.snapshots = await writeNetWorthSnapshots(db, today)

  return NextResponse.json({ date: today, ...report })
}

// ── 1. Price cache ──────────────────────────────────────────────────────────
async function warmPriceCache(db: SupabaseClient) {
  try {
    const [{ data: holdings }, { data: txns }] = await Promise.all([
      db.from('holdings').select('ticker').eq('price_source', 'auto'),
      db.from('transactions').select('ticker'),
    ])
    const tickers = Array.from(new Set([
      ...(holdings ?? []).map((h: any) => h.ticker),
      ...(txns ?? []).map((t: any) => t.ticker),
    ].filter(Boolean)))
    if (tickers.length === 0) return { checked: 0 }

    const quotes = await fetchQuotes(tickers)
    const rows = Object.values(quotes)
      .filter((q) => q.price > 0)
      .map((q) => ({
        ticker: q.ticker, price: q.price, currency: q.currency,
        change: q.change, change_percent: q.changePercent,
        long_name: q.longName ?? null, fetched_at: new Date().toISOString(),
      }))
    if (rows.length > 0) {
      const { error } = await db.from('price_cache').upsert(rows, { onConflict: 'ticker' })
      if (error) return { checked: tickers.length, cached: 0, error: error.message }
    }
    return { checked: tickers.length, cached: rows.length }
  } catch (err) {
    return { error: String((err as Error).message ?? err) }
  }
}

// ── 2. FX cache ──────────────────────────────────────────────────────────────
async function warmFxCache(db: SupabaseClient) {
  try {
    const { data: settingsRows } = await db.from('user_settings').select('base_currency')
    const bases = Array.from(new Set((settingsRows ?? []).map((s: any) => s.base_currency).filter(Boolean)))
    if (bases.length === 0) return { checked: 0 }

    const rows = []
    for (const base of bases) {
      const result = await fetchFxRates(base, CURRENCY_CODES as unknown as string[])
      rows.push({ base: result.base, rates: result.rates, fetched_at: new Date().toISOString() })
    }
    const { error } = await db.from('fx_cache').upsert(rows, { onConflict: 'base' })
    if (error) return { checked: bases.length, error: error.message }
    return { checked: bases.length }
  } catch (err) {
    return { error: String((err as Error).message ?? err) }
  }
}

// ── 3. Recurring postings (server-side RecurringPoster) ────────────────────
async function postRecurringPayments(db: SupabaseClient, today: string) {
  try {
    const { data: due } = await db
      .from('planned_payments').select('*')
      .eq('post_as_transaction', true)
      .is('paid_at', null)
      .lte('due_date', today)
    if (!due || due.length === 0) return { checked: 0, posted: 0 }

    let posted = 0
    for (const p of due as any[]) {
      const dates = duePostings(p, today)
      for (const date of dates) {
        const result = await insertBankTxnServer(db, p.user_id, {
          account_id: p.account_id,
          date,
          description: p.name,
          merchant: null,
          amount: (p.flow === 'income' ? 1 : -1) * Math.abs(Number(p.amount) || 0),
          currency: String(p.currency),
          category_id: p.category_id,
          source: 'manual',
          external_id: `pp-${p.id}-${date}`,
          notes: 'Auto-posted from Payments',
        })
        if (result.status === 'inserted') posted++
      }
      const now = new Date().toISOString()
      if (p.repeat === 'none') {
        await db.from('planned_payments').update({ paid_at: now, updated_at: now }).eq('id', p.id)
      } else {
        await db.from('planned_payments')
          .update({ due_date: nextDueAfterPostings(p, today), updated_at: now })
          .eq('id', p.id)
      }
    }
    return { checked: due.length, posted }
  } catch (err) {
    return { error: String((err as Error).message ?? err) }
  }
}

// ── 4. CPF contributions (server-side CpfPoster) ────────────────────────────
async function postCpfContributions(db: SupabaseClient, today: string) {
  try {
    const { data: enabledSettings } = await db
      .from('user_settings')
      .select('user_id, cpf_enabled, cpf_birth_year, cpf_salary_basis, cpf_start')
      .eq('cpf_enabled', true)
      .not('cpf_birth_year', 'is', null)
    if (!enabledSettings || enabledSettings.length === 0) return { checked: 0, posted: 0 }

    let totalPosted = 0
    for (const s of enabledSettings as any[]) {
      const userId = s.user_id
      const { data: cats } = await db.from('categories').select('id, name').eq('user_id', userId).eq('name', 'Salary')
      const salaryIds = new Set((cats ?? []).map((c: any) => c.id))
      if (salaryIds.size === 0) continue

      const start = s.cpf_start ?? '0000-01-01'
      const { data: salaryTxns } = await db
        .from('bank_transactions').select('id, date, amount, description, category_id')
        .eq('user_id', userId).gte('date', start).gt('amount', 0)
      const salaryOnly = (salaryTxns ?? []).filter((t: any) => t.category_id && salaryIds.has(t.category_id))
      if (salaryOnly.length === 0) continue

      const { data: existing } = await db.from('cpf_contributions').select('source_txn_id').eq('user_id', userId)
      const done = new Set((existing ?? []).map((r: any) => r.source_txn_id))
      const toPost = salaryOnly.filter((t: any) => !done.has(t.id))
      if (toPost.length === 0) continue

      const basis = (s.cpf_salary_basis ?? 'take_home') as SalaryBasis
      const birthYear = Number(s.cpf_birth_year)
      const rows = toPost.map((t: any) => {
        const c = computeCpf({ recordedSalary: Number(t.amount), basis, age: ageInYear(birthYear, t.date) })
        return {
          user_id: userId, source_txn_id: t.id, date: t.date,
          gross: c.gross, employee: c.employee, employer: c.employer,
          oa: c.oa, sa: c.sa, ma: c.ma,
          notes: `Auto from salary: ${t.description}`.slice(0, 200),
        }
      })
      const { error: insErr } = await db.from('cpf_contributions').insert(rows)
      if (insErr && insErr.code !== '23505') continue

      const totals = rows.reduce((a: any, r: any) => ({ oa: a.oa + r.oa, sa: a.sa + r.sa, ma: a.ma + r.ma }), { oa: 0, sa: 0, ma: 0 })
      const { data: assets } = await db.from('assets').select('id, kind, balance').eq('user_id', userId)
      const bump = async (kind: AssetKind, name: string, add: number) => {
        if (add <= 0) return
        const existingAsset = (assets ?? []).find((a: any) => a.kind === kind)
        if (existingAsset) {
          await db.from('assets').update({ balance: Math.round((Number(existingAsset.balance) + add) * 100) / 100, updated_at: new Date().toISOString() }).eq('id', existingAsset.id)
        } else {
          await db.from('assets').insert({
            user_id: userId, name, kind, balance: Math.round(add * 100) / 100,
            currency: 'SGD', is_active: true,
          })
        }
      }
      await bump('cpf_oa', 'CPF Ordinary Account', totals.oa)
      await bump('cpf_sa', 'CPF Special Account', totals.sa)
      await bump('cpf_ma', 'CPF MediSave', totals.ma)
      totalPosted += rows.length
    }
    return { checked: enabledSettings.length, posted: totalPosted }
  } catch (err) {
    return { error: String((err as Error).message ?? err) }
  }
}

// ── 5. Net-worth snapshots ──────────────────────────────────────────────────
async function writeNetWorthSnapshots(db: SupabaseClient, today: string) {
  try {
    const { data: settingsRows } = await db.from('user_settings').select('user_id, base_currency')
    if (!settingsRows || settingsRows.length === 0) return { checked: 0, written: 0 }

    const [{ data: priceCache }, { data: fxCache }] = await Promise.all([
      db.from('price_cache').select('ticker, price, currency'),
      db.from('fx_cache').select('base, rates'),
    ])
    const priceByTicker = new Map((priceCache ?? []).map((p: any) => [p.ticker, p]))
    const fxByBase = new Map((fxCache ?? []).map((f: any) => [f.base, f.rates]))

    let written = 0
    for (const s of settingsRows as any[]) {
      const userId = s.user_id
      const base = s.base_currency ?? 'USD'
      const rates = fxByBase.get(base)
      if (!rates) continue // no cached FX for this base yet — skip, client snapshot covers it
      const fxRates: FxRates = { base, rates }

      const [{ data: holdings }, { data: accounts }, { data: assets }, { data: policies }] = await Promise.all([
        db.from('holdings').select('ticker, shares, price_source, custom_price, price_provider').eq('user_id', userId),
        db.from('accounts').select('current_balance, currency, type').eq('user_id', userId).eq('is_active', true),
        db.from('assets').select('balance, currency, kind').eq('user_id', userId).eq('is_active', true),
        db.from('insurance_policies').select('cash_value, invested_value, currency').eq('user_id', userId).eq('is_active', true),
      ])

      const holdingsValueBase = (holdings ?? []).reduce((sum: number, h: any) => {
        let price = 0, currency = base
        if (h.price_source === 'custom' && h.custom_price != null) {
          price = Number(h.custom_price)
          const providerMeta = h.price_provider ? FUND_PROVIDER_LIST.find((p) => p.id === h.price_provider) : null
          currency = providerMeta?.nativeCurrency ?? base
        } else {
          const cached = priceByTicker.get(h.ticker)
          if (cached) { price = Number(cached.price); currency = cached.currency }
        }
        if (price <= 0) return sum
        return sum + convertToBase(Number(h.shares) * price, currency, fxRates)
      }, 0)

      const accountsNetBase = (accounts ?? []).reduce((sum: number, a: any) => {
        const v = convertToBase(Number(a.current_balance) || 0, a.currency, fxRates)
        return sum + (a.type === 'credit' ? -v : v)
      }, 0)

      const assetsBase = (assets ?? [])
        .filter((a: any) => !ASSET_KIND_META[a.kind as AssetKind]?.liability)
        .reduce((sum: number, a: any) => sum + convertToBase(Number(a.balance) || 0, a.currency, fxRates), 0)
      const liabilitiesBase = (assets ?? [])
        .filter((a: any) => ASSET_KIND_META[a.kind as AssetKind]?.liability)
        .reduce((sum: number, a: any) => sum + convertToBase(Number(a.balance) || 0, a.currency, fxRates), 0)

      const policiesBase = (policies ?? []).reduce((sum: number, p: any) => {
        const v = Number(p.cash_value ?? p.invested_value ?? 0) || 0
        return sum + convertToBase(v, p.currency, fxRates)
      }, 0)

      const netWorthBase = holdingsValueBase + accountsNetBase + assetsBase + policiesBase - liabilitiesBase
      if (netWorthBase <= 0) continue

      const r2 = (n: number) => Math.round(n * 100) / 100
      const { error } = await db.from('networth_snapshots').upsert(
        {
          user_id: userId, date: today, net_worth: r2(netWorthBase), currency: base,
          holdings_value: r2(holdingsValueBase), accounts_value: r2(accountsNetBase),
          assets_value: r2(assetsBase + policiesBase), liabilities_value: r2(liabilitiesBase),
        },
        { onConflict: 'user_id,date' },
      )
      if (!error) written++
    }
    return { checked: settingsRows.length, written }
  } catch (err) {
    return { error: String((err as Error).message ?? err) }
  }
}

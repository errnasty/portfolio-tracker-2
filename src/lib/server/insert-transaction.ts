import type { SupabaseClient } from '@supabase/supabase-js'
import { findFuzzyDuplicate } from '@/lib/txn-dedupe'
import type { BankTxnSource } from '@/types'

// Shared insert pipeline for server-side bank_transactions writes (the
// inbound-email webhook, and the daily cron's recurring-payment poster):
// external_id dedupe -> fuzzy dedupe (flags, doesn't block) -> insert ->
// atomic balance bump. One implementation so both callers dedupe and update
// balances identically.

export interface BankTxnDraft {
  account_id: string | null
  date: string
  description: string
  merchant: string | null
  amount: number              // signed: negative = expense, positive = income
  currency: string
  category_id: string | null
  source: BankTxnSource
  external_id: string         // required — this pipeline's whole job is dedupe
  payee_key?: string | null
  needs_review?: boolean
  notes?: string | null
}

export type InsertResult =
  | { status: 'inserted'; id: string }
  | { status: 'skipped'; reason: 'duplicate' | 'duplicate (race)' }
  | { status: 'error'; message: string }

export async function insertBankTxnServer(
  db: SupabaseClient,
  userId: string,
  draft: BankTxnDraft,
): Promise<InsertResult> {
  const { data: existing } = await db
    .from('bank_transactions')
    .select('external_id')
    .eq('user_id', userId)
    .eq('external_id', draft.external_id)
    .maybeSingle()
  if (existing) return { status: 'skipped', reason: 'duplicate' }

  const { data: prior } = await db
    .from('bank_transactions')
    .select('id, date, amount, payee_key, description')
    .eq('user_id', userId)
    .eq('date', draft.date)
  const dup = findFuzzyDuplicate(
    { date: draft.date, amount: draft.amount, payee_key: draft.payee_key ?? null, description: draft.description },
    prior ?? [],
  )

  const row = {
    user_id: userId,
    account_id: draft.account_id,
    date: draft.date,
    description: draft.description,
    merchant: draft.merchant,
    amount: draft.amount,
    currency: draft.currency,
    category_id: draft.category_id,
    source: draft.source,
    external_id: draft.external_id,
    payee_key: draft.payee_key ?? null,
    needs_review: draft.needs_review || !!dup,
    notes: dup ? `possible duplicate of ${dup.id ?? 'existing transaction'}` : (draft.notes ?? null),
  }

  const { data, error } = await db.from('bank_transactions').insert(row).select('id').single()
  if (error) {
    // A unique-constraint violation on external_id is a duplicate that raced
    // between our check and the insert — treat as a skip, not an error.
    if (error.code === '23505') return { status: 'skipped', reason: 'duplicate (race)' }
    return { status: 'error', message: error.message }
  }

  if (draft.account_id) {
    try {
      const { error: rpcErr } = await db.rpc('increment_account_balance', {
        p_account_id: draft.account_id,
        p_delta: draft.amount,
      })
      if (rpcErr) {
        // Fallback: read-modify-write (best-effort; the transaction is already saved).
        const { data: acc } = await db
          .from('accounts').select('current_balance').eq('id', draft.account_id).maybeSingle()
        if (acc) {
          await db.from('accounts')
            .update({
              current_balance: Number(acc.current_balance) + draft.amount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', draft.account_id)
        }
      }
    } catch (balErr) {
      console.warn(`[insert-transaction] Balance update failed for account ${draft.account_id}: ${String(balErr)}`)
      // Transaction is already saved; balance is best-effort.
    }
  }

  return { status: 'inserted', id: data.id }
}

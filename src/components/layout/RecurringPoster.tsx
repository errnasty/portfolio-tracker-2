'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useSpending } from '@/context/SpendingContext'
import { duePostings, nextDueAfterPostings } from '@/lib/payments'
import type { PlannedPayment } from '@/types'

// Posts due recurring transactions (planned payments flagged
// post_as_transaction) once per session — salary, rent, allowance land in
// the ledger without manual entry. Idempotent across devices/sessions via
// external_id `pp-<payment>-<date>` (unique per user in the DB), and the
// fuzzy dedupe in bulkInsertBankTransactions also skips a posting when the
// same amount already arrived that day via a bank email.
export function RecurringPoster() {
  const { loading, bulkInsertBankTransactions } = useSpending()
  const ran = useRef(false)

  useEffect(() => {
    if (loading || ran.current) return
    ran.current = true
    try {
      if (window.sessionStorage.getItem('recurring_posted_v1')) return
      window.sessionStorage.setItem('recurring_posted_v1', '1')
    } catch { return }

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('planned_payments').select('*')
        .eq('user_id', user.id)
        .eq('post_as_transaction', true)
        .is('paid_at', null)
        .lte('due_date', today)
      if (error || !data || data.length === 0) return

      const payments = data as PlannedPayment[]
      const rows = payments.flatMap((p) =>
        duePostings(p, today).map((date) => ({
          account_id: p.account_id,
          date,
          description: p.name,
          merchant: null,
          amount: (p.flow === 'income' ? 1 : -1) * Math.abs(Number(p.amount) || 0),
          currency: String(p.currency),
          category_id: p.category_id,
          source: 'manual' as const,
          external_id: `pp-${p.id}-${date}`,
          notes: 'Auto-posted from Payments',
        })),
      )
      if (rows.length === 0) return

      const { inserted } = await bulkInsertBankTransactions(rows)

      // Advance each payment past everything just posted.
      const now = new Date().toISOString()
      for (const p of payments) {
        if (p.repeat === 'none') {
          await supabase.from('planned_payments')
            .update({ paid_at: now, updated_at: now }).eq('id', p.id)
        } else {
          await supabase.from('planned_payments')
            .update({ due_date: nextDueAfterPostings(p, today), updated_at: now }).eq('id', p.id)
        }
      }

      if (inserted > 0) {
        toast.success(`Posted ${inserted} recurring transaction${inserted === 1 ? '' : 's'} (salary/bills)`)
      }
    })()
  }, [loading, bulkInsertBankTransactions])

  return null
}

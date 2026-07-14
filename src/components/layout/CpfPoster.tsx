'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { computeCpf, ageInYear, type SalaryBasis } from '@/lib/cpf'
import type { Asset, AssetKind } from '@/types'

// Auto-adds CPF contributions from Salary income once per session: for each
// Salary transaction on/after cpf_start that hasn't been processed, computes
// the 37% CPF (20% employee + 17% employer of the gross Ordinary Wage,
// recovered from the recorded take-home), records a cpf_contributions row
// keyed by the source transaction (so it applies exactly once), and bumps the
// OA/SA/MA CPF asset balances. Idempotent across devices/sessions.
export function CpfPoster() {
  const { settings, assets, addAsset, updateAsset, refreshAssets } = usePortfolio()
  const { loading, bankTransactions, categories } = useSpending()
  const ran = useRef(false)

  useEffect(() => {
    if (loading || ran.current) return
    if (!settings?.cpf_enabled || !settings.cpf_birth_year) return
    ran.current = true
    try {
      if (window.sessionStorage.getItem('cpf_posted_v1')) return
      window.sessionStorage.setItem('cpf_posted_v1', '1')
    } catch { return }

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const salaryIds = new Set(categories.filter((c) => c.name === 'Salary').map((c) => c.id))
      if (salaryIds.size === 0) return
      const start = settings.cpf_start ?? '0000-01-01'
      const basis = (settings.cpf_salary_basis ?? 'take_home') as SalaryBasis
      const birthYear = Number(settings.cpf_birth_year)

      const salaryTxns = bankTransactions.filter((t) =>
        t.category_id && salaryIds.has(t.category_id) && Number(t.amount) > 0 && t.date >= start)
      if (salaryTxns.length === 0) return

      // Which sources already contributed?
      const { data: existing, error: exErr } = await supabase
        .from('cpf_contributions').select('source_txn_id').eq('user_id', user.id)
      if (exErr) return  // table missing (migration not run) — silently skip
      const done = new Set((existing ?? []).map((r) => r.source_txn_id))

      const pending = salaryTxns.filter((t) => !done.has(t.id))
      if (pending.length === 0) return

      const rows = pending.map((t) => {
        const c = computeCpf({ recordedSalary: Number(t.amount), basis, age: ageInYear(birthYear, t.date) })
        return {
          user_id: user.id, source_txn_id: t.id, date: t.date,
          gross: c.gross, employee: c.employee, employer: c.employer,
          oa: c.oa, sa: c.sa, ma: c.ma,
          notes: `Auto from salary: ${t.description}`.slice(0, 200),
        }
      })

      const { error: insErr } = await supabase.from('cpf_contributions').insert(rows)
      if (insErr) {
        // Unique-violation race (another device posted first) is fine.
        if (insErr.code !== '23505') return
      }

      // Bump the three CPF asset balances by the totals just added.
      const totals = rows.reduce((a, r) => ({ oa: a.oa + r.oa, sa: a.sa + r.sa, ma: a.ma + r.ma }), { oa: 0, sa: 0, ma: 0 })
      const bump = async (kind: AssetKind, name: string, add: number) => {
        if (add <= 0) return
        const existingAsset = assets.find((a) => a.kind === kind)
        if (existingAsset) await updateAsset(existingAsset.id, { balance: Math.round((Number(existingAsset.balance) + add) * 100) / 100 })
        else await addAsset({ name, kind, balance: Math.round(add * 100) / 100, currency: 'SGD', interest_rate_pct: null, maturity_date: null, monthly_payment: null, notes: null, is_active: true } as Omit<Asset, 'id' | 'user_id' | 'created_at' | 'updated_at'>)
      }
      await bump('cpf_oa', 'CPF Ordinary Account', totals.oa)
      await bump('cpf_sa', 'CPF Special Account', totals.sa)
      await bump('cpf_ma', 'CPF MediSave', totals.ma)
      await refreshAssets()

      const totalAdded = totals.oa + totals.sa + totals.ma
      toast.success(`CPF: added ${totalAdded.toLocaleString('en-SG', { style: 'currency', currency: 'SGD' })} from ${pending.length} salary payment${pending.length === 1 ? '' : 's'}`)
    })()
  }, [loading, settings, bankTransactions, categories, assets, addAsset, updateAsset, refreshAssets])

  return null
}

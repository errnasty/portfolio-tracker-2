import { normalizeMerchant } from '@/lib/subscriptions'

// Anomaly detection over the spending ledger: things worth a second look but
// not necessarily wrong. Pure functions, amounts compared per payee in their
// own currency (a payee's charges are almost always one currency).

export interface AnomalyTxn {
  id: string
  date: string
  description: string
  merchant?: string | null
  payee_key?: string | null
  amount: number               // signed; expenses negative
  currency: string
}

export interface Anomaly {
  kind: 'large_txn' | 'possible_duplicate' | 'price_increase'
  title: string
  sub: string
  txnIds: string[]
}

const RECENT_DAYS = 14

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function payeeOf(t: AnomalyTxn): string {
  return t.payee_key || normalizeMerchant(t.description, t.merchant)
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000))
}

// Recent expense far above this payee's history: > 3× the median of ≥4 prior
// charges, and at least 50 units — small merchants fluctuate, groceries don't
// need an alarm for a big festive run under that floor.
export function detectLargeTransactions(txns: AnomalyTxn[], today: string): Anomaly[] {
  const byPayee = new Map<string, AnomalyTxn[]>()
  for (const t of txns) {
    if (Number(t.amount) >= 0) continue
    const key = payeeOf(t)
    if (!key) continue
    byPayee.set(key, [...(byPayee.get(key) ?? []), t])
  }

  const out: Anomaly[] = []
  for (const [, group] of byPayee) {
    const recent = group.filter((t) => daysBetween(t.date, today) <= RECENT_DAYS)
    for (const t of recent) {
      const prior = group.filter((g) => g.id !== t.id && g.date < t.date).map((g) => -Number(g.amount))
      if (prior.length < 4) continue
      const med = median(prior)
      const amt = -Number(t.amount)
      if (med > 0 && amt > med * 3 && amt >= 50) {
        out.push({
          kind: 'large_txn',
          title: `${t.description.slice(0, 40)} — ${amt.toFixed(2)} ${t.currency}`,
          sub: `~${(amt / med).toFixed(1)}× this payee's usual ${med.toFixed(2)} ${t.currency}.`,
          txnIds: [t.id],
        })
      }
    }
  }
  return out
}

// Same payee, same amount, within 2 days — a double charge the exact-id and
// fuzzy dedupes can miss (e.g. genuinely booked twice by the merchant).
export function detectPossibleDuplicates(txns: AnomalyTxn[], today: string): Anomaly[] {
  const recent = txns.filter((t) => Number(t.amount) < 0 && daysBetween(t.date, today) <= RECENT_DAYS)
  const out: Anomaly[] = []
  const seenPairs = new Set<string>()
  for (let i = 0; i < recent.length; i++) {
    for (let j = i + 1; j < recent.length; j++) {
      const a = recent[i]; const b = recent[j]
      if (a.currency !== b.currency) continue
      if (Math.abs(Number(a.amount) - Number(b.amount)) > 0.005) continue
      if (daysBetween(a.date, b.date) > 2) continue
      if (payeeOf(a) !== payeeOf(b) || !payeeOf(a)) continue
      const pairKey = [a.id, b.id].sort().join('|')
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)
      out.push({
        kind: 'possible_duplicate',
        title: `Possible double charge: ${a.description.slice(0, 40)}`,
        sub: `${(-Number(a.amount)).toFixed(2)} ${a.currency} twice within 2 days (${a.date} & ${b.date}).`,
        txnIds: [a.id, b.id],
      })
    }
  }
  return out
}

// A subscription's latest charge is >15% above its usual monthly amount.
export function detectPriceIncreases(
  subscriptions: { key: string; label: string; monthlyAmount: number }[],
  txns: AnomalyTxn[],
  today: string,
): Anomaly[] {
  const out: Anomaly[] = []
  for (const s of subscriptions) {
    if (s.monthlyAmount <= 0) continue
    const charges = txns
      .filter((t) => Number(t.amount) < 0 && payeeOf(t) === s.key)
      .sort((a, b) => b.date.localeCompare(a.date))
    const latest = charges[0]
    if (!latest || daysBetween(latest.date, today) > 35) continue
    const amt = -Number(latest.amount)
    if (amt > s.monthlyAmount * 1.15 && amt - s.monthlyAmount > 0.5) {
      out.push({
        kind: 'price_increase',
        title: `${s.label} went up: ${amt.toFixed(2)} vs usual ${s.monthlyAmount.toFixed(2)}`,
        sub: `+${(((amt / s.monthlyAmount) - 1) * 100).toFixed(0)}% on the latest charge (${latest.date}).`,
        txnIds: [latest.id],
      })
    }
  }
  return out
}

export function detectAnomalies(
  txns: AnomalyTxn[],
  subscriptions: { key: string; label: string; monthlyAmount: number }[],
  today: string,
): Anomaly[] {
  return [
    ...detectPossibleDuplicates(txns, today),
    ...detectPriceIncreases(subscriptions, txns, today),
    ...detectLargeTransactions(txns, today),
  ]
}

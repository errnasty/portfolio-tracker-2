import { describe, it, expect } from 'vitest'
import { normalizeMerchant, detectSubscriptions } from '../subscriptions'
import type { BankTransaction } from '@/types'

describe('normalizeMerchant', () => {
  it('collapses noisy narratives to a stable key', () => {
    expect(normalizeMerchant('Spotify P437998A6F St SWE 13JUN 5264-7110-2916-5059 000002582261956')).toBe('spotify')
    expect(normalizeMerchant('ANTHROPIC* CLAUDE SUB SA USA 19JUN 5264-7110-2916-5059')).toBe('anthropic claude')
    expect(normalizeMerchant('CIRCLES.LIFE SINGAPORE SGP 03JUN 5264')).toBe('circles life')
    expect(normalizeMerchant('McDonalds 930014 Si SGP 21JUN 5264')).toBe('mcdonalds')
  })

  it('keeps the same key across months (so charges group)', () => {
    const a = normalizeMerchant('Spotify P40531C0AE St SWE 13MAR 5264')
    const b = normalizeMerchant('Spotify P3F4FDC868 St SWE 13FEB 5264')
    expect(a).toBe(b)
  })

  it('does not merge Grab rides with Grab subscription', () => {
    expect(normalizeMerchant('Grab* A-9G3NBL4GX8PVAV Si SGP 20JUN 5264')).toBe('grab')
    expect(normalizeMerchant('Grab Subscription* v4- SI SGP 23JUN 5264')).toBe('grab subscription')
  })
})

let n = 0
function txn(description: string, date: string, amount: number, category_id: string | null): BankTransaction {
  return {
    id: `t${n++}`, user_id: 'u', account_id: 'a', date, description, merchant: null,
    amount, currency: 'SGD', category_id, source: 'csv', external_id: null, notes: null,
    created_at: date, updated_at: date,
  }
}

describe('detectSubscriptions', () => {
  const cats = { bills: 'Bills & Utilities', food: 'Food & Dining', transport: 'Transport' }
  const txns: BankTransaction[] = [
    txn('Spotify P40531C0AE St SWE 13JUN 5264', '2026-06-13', -16.65, 'bills'),
    txn('Spotify P3F4FDC868 St SWE 13MAY 5264', '2026-05-13', -16.65, 'bills'),
    txn('ANTHROPIC* CLAUDE SUB SA USA 19JUN 5264', '2026-06-19', -28.50, 'bills'),
    txn('ANTHROPIC* CLAUDE SUB SA USA 19MAY 5264', '2026-05-19', -28.50, 'bills'),
    txn('McDonalds 930014 Si SGP 21JUN 5264', '2026-06-21', -8.20, 'food'),
    txn('McDonalds 930014 Si SGP 21MAY 5264', '2026-05-21', -8.20, 'food'),
    txn('Grab* A-9G3NBL4GX8PVAV Si SGP 20JUN 5264', '2026-06-20', -12.00, 'transport'),
    txn('Grab* A-9CHFUS3WW36VAV Si SGP 20MAY 5264', '2026-05-20', -12.00, 'transport'),
    txn('NETFLIX.COM SG 10JUN 5264', '2026-06-10', -19.98, 'bills'),  // one-off
  ]

  const subs = detectSubscriptions(txns, cats, null)
  const keys = subs.map((s) => s.key)

  it('detects recurring Bills/known subscriptions', () => {
    expect(keys).toContain('spotify')
    expect(keys).toContain('anthropic claude')
  })

  it('ignores recurring non-subscriptions (groceries/food/transport)', () => {
    expect(keys).not.toContain('mcdonalds')
    expect(keys).not.toContain('grab')
  })

  it('ignores one-off charges', () => {
    expect(keys).not.toContain('netflix com')
    expect(keys).not.toContain('netflix')
  })

  it('reports a representative monthly amount', () => {
    const spotify = subs.find((s) => s.key === 'spotify')!
    expect(spotify.monthlyAmount).toBe(16.65)
    expect(spotify.months).toBe(2)
    expect(spotify.occurrences).toBe(2)
  })
})

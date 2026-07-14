import { describe, it, expect } from 'vitest'
import { detectLargeTransactions, detectPossibleDuplicates, detectPriceIncreases } from '../anomalies'
import type { AnomalyTxn } from '../anomalies'

let seq = 0
function txn(over: Partial<AnomalyTxn>): AnomalyTxn {
  seq += 1
  return {
    id: `t${seq}`, date: '2026-07-10', description: 'NTUC FAIRPRICE', merchant: null,
    payee_key: 'name:ntuc', amount: -30, currency: 'SGD',
    ...over,
  }
}

const TODAY = '2026-07-13'

describe('detectLargeTransactions', () => {
  it('flags a recent charge far above the payee median', () => {
    const history = [-28, -32, -30, -29].map((amount, i) =>
      txn({ amount, date: `2026-06-0${i + 1}` }))
    const spike = txn({ amount: -180, date: '2026-07-12' })
    const out = detectLargeTransactions([...history, spike], TODAY)
    expect(out).toHaveLength(1)
    expect(out[0].txnIds).toEqual([spike.id])
    expect(out[0].sub).toContain('6.1×')
  })

  it('needs ≥4 priors and a 50-unit floor', () => {
    const shortHistory = [-10, -12].map((amount, i) => txn({ amount, date: `2026-06-0${i + 1}` }))
    expect(detectLargeTransactions([...shortHistory, txn({ amount: -200, date: '2026-07-12' })], TODAY)).toHaveLength(0)

    const smallSpike = [-3, -3, -3, -3].map((amount, i) => txn({ amount, date: `2026-06-0${i + 1}` }))
    expect(detectLargeTransactions([...smallSpike, txn({ amount: -20, date: '2026-07-12' })], TODAY)).toHaveLength(0)
  })
})

describe('detectPossibleDuplicates', () => {
  it('flags identical recent charges within 2 days', () => {
    const a = txn({ amount: -59.9, date: '2026-07-10' })
    const b = txn({ amount: -59.9, date: '2026-07-11' })
    const out = detectPossibleDuplicates([a, b], TODAY)
    expect(out).toHaveLength(1)
    expect(out[0].txnIds.sort()).toEqual([a.id, b.id].sort())
  })

  it('ignores different payees, amounts, or wide gaps', () => {
    expect(detectPossibleDuplicates([
      txn({ amount: -59.9, date: '2026-07-10' }),
      txn({ amount: -59.9, date: '2026-07-10', payee_key: 'name:other' }),
    ], TODAY)).toHaveLength(0)
    expect(detectPossibleDuplicates([
      txn({ amount: -59.9, date: '2026-07-01' }),
      txn({ amount: -59.9, date: '2026-07-10' }),
    ], TODAY)).toHaveLength(0)
  })
})

describe('detectPriceIncreases', () => {
  it('flags a latest charge >15% above the usual amount', () => {
    const charges = [
      txn({ payee_key: 'spotify', amount: -11.98, date: '2026-05-13' }),
      txn({ payee_key: 'spotify', amount: -13.98, date: '2026-07-11' }),
    ]
    const out = detectPriceIncreases([{ key: 'spotify', label: 'Spotify', monthlyAmount: 11.98 }], charges, TODAY)
    expect(out).toHaveLength(1)
    expect(out[0].title).toContain('Spotify went up')
  })

  it('stays quiet for normal charges', () => {
    const charges = [txn({ payee_key: 'spotify', amount: -11.98, date: '2026-07-11' })]
    expect(detectPriceIncreases([{ key: 'spotify', label: 'Spotify', monthlyAmount: 11.98 }], charges, TODAY)).toHaveLength(0)
  })
})

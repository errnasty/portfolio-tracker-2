import { describe, it, expect } from 'vitest'
import {
  derivePosition,
  deriveAllPositions,
  totalRealizedGains,
  totalDividendsReceived,
  timeWeightedReturn,
} from '../transactions'
import type { Transaction } from '@/types'

// Test helper — produces a Transaction with sensible defaults.
let idCounter = 0
function txn(partial: Partial<Transaction>): Transaction {
  idCounter += 1
  return {
    id: `t${idCounter}`,
    user_id: 'u1',
    ticker: partial.ticker ?? 'AAPL',
    type: partial.type ?? 'buy',
    date: partial.date ?? '2024-01-01',
    shares: partial.shares ?? 0,
    price_per_share: partial.price_per_share ?? 0,
    amount: partial.amount ?? 0,
    currency: partial.currency ?? 'USD',
    fees: partial.fees ?? 0,
    split_ratio: partial.split_ratio ?? null,
    notes: partial.notes ?? null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }
}

describe('derivePosition', () => {
  it('returns zeros for empty transaction list', () => {
    const pos = derivePosition('AAPL', [])
    expect(pos.shares).toBe(0)
    expect(pos.totalCost).toBe(0)
    expect(pos.avgCostBasis).toBe(0)
    expect(pos.realizedGain).toBe(0)
    expect(pos.totalDividends).toBe(0)
    expect(pos.buyCount).toBe(0)
    expect(pos.sellCount).toBe(0)
  })

  it('computes weighted-average cost basis across multiple buys', () => {
    const pos = derivePosition('AAPL', [
      txn({ type: 'buy', shares: 10, price_per_share: 100, date: '2024-01-01' }),
      txn({ type: 'buy', shares: 10, price_per_share: 200, date: '2024-02-01' }),
    ])
    expect(pos.shares).toBe(20)
    expect(pos.totalCost).toBe(3000)
    expect(pos.avgCostBasis).toBe(150)
    expect(pos.buyCount).toBe(2)
    expect(pos.firstBuyDate).toBe('2024-01-01')
  })

  it('includes fees in total cost', () => {
    const pos = derivePosition('AAPL', [
      txn({ type: 'buy', shares: 10, price_per_share: 100, fees: 5 }),
    ])
    expect(pos.totalCost).toBe(1005)
    expect(pos.avgCostBasis).toBe(100.5)
  })

  it('computes realized gain on sell using running avg cost basis', () => {
    const pos = derivePosition('AAPL', [
      txn({ type: 'buy', shares: 10, price_per_share: 100, date: '2024-01-01' }),
      txn({ type: 'sell', shares: 5, price_per_share: 150, date: '2024-06-01' }),
    ])
    // Avg cost = 100; sell 5 @ 150 → proceeds 750, cost removed 500, gain 250
    expect(pos.shares).toBe(5)
    expect(pos.realizedGain).toBe(250)
    expect(pos.totalCost).toBe(500)
    expect(pos.sellCount).toBe(1)
  })

  it('subtracts sell fees from proceeds', () => {
    const pos = derivePosition('AAPL', [
      txn({ type: 'buy', shares: 10, price_per_share: 100 }),
      txn({ type: 'sell', shares: 10, price_per_share: 150, fees: 10 }),
    ])
    // Proceeds 1500 - 10 fees = 1490; cost basis 1000; gain 490
    expect(pos.realizedGain).toBe(490)
    expect(pos.shares).toBe(0)
  })

  it('caps sells at available share count', () => {
    const pos = derivePosition('AAPL', [
      txn({ type: 'buy', shares: 10, price_per_share: 100 }),
      txn({ type: 'sell', shares: 20, price_per_share: 150 }),
    ])
    // Can only sell 10; remaining shares 0
    expect(pos.shares).toBe(0)
    expect(pos.realizedGain).toBe(500)
  })

  it('applies stock splits to share count, leaving cost basis unchanged', () => {
    const pos = derivePosition('AAPL', [
      txn({ type: 'buy', shares: 10, price_per_share: 200 }),
      txn({ type: 'split', split_ratio: 2 }),
    ])
    expect(pos.shares).toBe(20)
    expect(pos.totalCost).toBe(2000)
    expect(pos.avgCostBasis).toBe(100) // halved
  })

  it('accumulates dividends without affecting share count or cost', () => {
    const pos = derivePosition('AAPL', [
      txn({ type: 'buy', shares: 10, price_per_share: 100 }),
      txn({ type: 'dividend', amount: 25 }),
      txn({ type: 'dividend', amount: 30 }),
    ])
    expect(pos.shares).toBe(10)
    expect(pos.totalCost).toBe(1000)
    expect(pos.totalDividends).toBe(55)
  })

  it('processes transactions in date order regardless of input order', () => {
    const pos = derivePosition('AAPL', [
      txn({ type: 'sell', shares: 5, price_per_share: 150, date: '2024-06-01' }),
      txn({ type: 'buy', shares: 10, price_per_share: 100, date: '2024-01-01' }),
    ])
    // If processed in date order: buy 10 @ 100, then sell 5 @ 150 → realizedGain 250
    expect(pos.realizedGain).toBe(250)
    expect(pos.shares).toBe(5)
  })

  it('tracks lastTransactionDate', () => {
    const pos = derivePosition('AAPL', [
      txn({ type: 'buy', shares: 10, price_per_share: 100, date: '2024-01-01' }),
      txn({ type: 'dividend', amount: 5, date: '2024-09-15' }),
    ])
    expect(pos.lastTransactionDate).toBe('2024-09-15')
  })

  it('prevents totalCost from going negative on overlapping sells', () => {
    const pos = derivePosition('AAPL', [
      txn({ type: 'buy', shares: 10, price_per_share: 100 }),
      txn({ type: 'sell', shares: 10, price_per_share: 150 }),
      txn({ type: 'sell', shares: 5, price_per_share: 200 }), // attempt to sell beyond holdings
    ])
    expect(pos.shares).toBe(0)
    expect(pos.totalCost).toBeGreaterThanOrEqual(0)
  })
})

describe('deriveAllPositions', () => {
  it('groups transactions by ticker (case-insensitive)', () => {
    const positions = deriveAllPositions([
      txn({ ticker: 'AAPL', type: 'buy', shares: 10, price_per_share: 100 }),
      txn({ ticker: 'aapl', type: 'buy', shares: 5, price_per_share: 110 }),
      txn({ ticker: 'MSFT', type: 'buy', shares: 4, price_per_share: 300 }),
    ])
    expect(Object.keys(positions).sort()).toEqual(['AAPL', 'MSFT'])
    expect(positions.AAPL.shares).toBe(15)
  })
})

describe('totalRealizedGains and totalDividendsReceived', () => {
  it('sums across all positions', () => {
    const positions = deriveAllPositions([
      txn({ ticker: 'AAPL', type: 'buy', shares: 10, price_per_share: 100, date: '2024-01-01' }),
      txn({ ticker: 'AAPL', type: 'sell', shares: 10, price_per_share: 150, date: '2024-06-01' }),
      txn({ ticker: 'MSFT', type: 'buy', shares: 4, price_per_share: 200, date: '2024-01-01' }),
      txn({ ticker: 'MSFT', type: 'sell', shares: 4, price_per_share: 300, date: '2024-07-01' }),
      txn({ ticker: 'AAPL', type: 'dividend', amount: 12 }),
      txn({ ticker: 'MSFT', type: 'dividend', amount: 8 }),
    ])
    expect(totalRealizedGains(positions)).toBe(500 + 400)
    expect(totalDividendsReceived(positions)).toBe(20)
  })
})

describe('timeWeightedReturn', () => {
  it('returns 0 for fewer than 2 points', () => {
    expect(timeWeightedReturn([])).toBe(0)
    expect(timeWeightedReturn([{ date: '2024-01-01', value: 100 }])).toBe(0)
  })

  it('chains period returns multiplicatively', () => {
    // 100 → 110 (10%) → 132 (20%) → final compound = 1.1 × 1.2 = 1.32 → 32%
    const r = timeWeightedReturn([
      { date: '2024-01-01', value: 100 },
      { date: '2024-02-01', value: 110 },
      { date: '2024-03-01', value: 132 },
    ])
    expect(r).toBeCloseTo(32, 5)
  })

  it('handles drawdowns', () => {
    const r = timeWeightedReturn([
      { date: '2024-01-01', value: 100 },
      { date: '2024-02-01', value: 50 },   // -50%
      { date: '2024-03-01', value: 100 },  // +100% — net 0
    ])
    expect(r).toBeCloseTo(0, 5)
  })
})

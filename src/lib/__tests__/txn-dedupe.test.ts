import { describe, it, expect } from 'vitest'
import { findFuzzyDuplicate } from '../txn-dedupe'

describe('findFuzzyDuplicate', () => {
  const existing = [{ id: 'a', date: '2026-07-02', amount: -53, payee_key: 'mobile:9989' }]

  it('matches same date + amount + payee_key', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-02', amount: -53, payee_key: 'mobile:9989' }, existing)?.id).toBe('a')
  })
  it('does not match a candidate without payee_key when descriptions are absent', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-02', amount: -53, payee_key: null }, existing)).toBeNull()
  })
  it('does not match a different amount', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-02', amount: -54, payee_key: 'mobile:9989' }, existing)).toBeNull()
  })
  it('does not match a different date', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-03', amount: -53, payee_key: 'mobile:9989' }, existing)).toBeNull()
  })

  // Description-based fuzzy matching (for CSV imports without payee_key)
  const descExisting = [
    { id: 'b', date: '2026-07-05', amount: -12.50, payee_key: null, description: 'GRAB FOOD SINGAPORE' },
    { id: 'c', date: '2026-07-05', amount: -100, payee_key: null, description: 'NTUC FAIRPRICE #123' },
  ]

  it('matches by description similarity when payee_key is null', () => {
    expect(findFuzzyDuplicate(
      { date: '2026-07-05', amount: -12.50, payee_key: null, description: 'grab food' },
      descExisting,
    )?.id).toBe('b')
  })
  it('matches even with word order difference', () => {
    expect(findFuzzyDuplicate(
      { date: '2026-07-05', amount: -100, payee_key: null, description: 'fairprice ntuc' },
      descExisting,
    )?.id).toBe('c')
  })
  it('does not match when description is completely different', () => {
    expect(findFuzzyDuplicate(
      { date: '2026-07-05', amount: -12.50, payee_key: null, description: 'sheng siong supermarket' },
      descExisting,
    )).toBeNull()
  })
  it('does not match when amount differs even if description matches', () => {
    expect(findFuzzyDuplicate(
      { date: '2026-07-05', amount: -99, payee_key: null, description: 'grab food' },
      descExisting,
    )).toBeNull()
  })
  it('ignores ref numbers in description comparison', () => {
    const withRef = [
      { id: 'd', date: '2026-07-10', amount: -5.00, payee_key: null, description: 'STARBUCKS ref:123456789' },
    ]
    expect(findFuzzyDuplicate(
      { date: '2026-07-10', amount: -5.00, payee_key: null, description: 'starbucks' },
      withRef,
    )?.id).toBe('d')
  })
})

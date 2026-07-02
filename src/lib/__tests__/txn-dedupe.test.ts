import { describe, it, expect } from 'vitest'
import { findFuzzyDuplicate } from '../txn-dedupe'

describe('findFuzzyDuplicate', () => {
  const existing = [{ id: 'a', date: '2026-07-02', amount: -53, payee_key: 'mobile:9989' }]

  it('matches same date + amount + payee_key', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-02', amount: -53, payee_key: 'mobile:9989' }, existing)?.id).toBe('a')
  })
  it('never matches a candidate without a payee_key', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-02', amount: -53, payee_key: null }, existing)).toBeNull()
  })
  it('does not match a different amount', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-02', amount: -54, payee_key: 'mobile:9989' }, existing)).toBeNull()
  })
  it('does not match a different date', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-03', amount: -53, payee_key: 'mobile:9989' }, existing)).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { fuzzyScore } from '../fuzzy'

describe('fuzzyScore', () => {
  it('returns null when chars are missing or out of order', () => {
    expect(fuzzyScore('holdings', 'zzz')).toBeNull()
    expect(fuzzyScore('holdings', 'sdh')).toBeNull()
  })
  it('scores subsequence matches, prefix highest', () => {
    const prefix = fuzzyScore('holdings', 'hol')!
    const scattered = fuzzyScore('holdings', 'hds')!
    expect(prefix).toBeGreaterThan(scattered)
  })
  it('empty query matches with base score', () => {
    expect(fuzzyScore('anything', '')).toBe(0)
  })
})

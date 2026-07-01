import { describe, it, expect } from 'vitest'
import { advanceSequence } from '../useKeySequences'

const seqs = { 'g h': '/holdings', 'g s': '/spending' }

describe('advanceSequence', () => {
  it('matches a two-key sequence within the window', () => {
    const s1 = advanceSequence({ buffer: [], at: 0 }, 'g', 1000, seqs)
    expect(s1.match).toBeUndefined()
    const s2 = advanceSequence(s1, 'h', 1200, seqs)
    expect(s2.match).toBe('/holdings')
  })
  it('resets when the gap exceeds the window', () => {
    const s1 = advanceSequence({ buffer: [], at: 0 }, 'g', 1000, seqs)
    const s2 = advanceSequence(s1, 'h', 3000, seqs) // >1500ms later
    expect(s2.match).toBeUndefined()
  })
  it('drops the buffer when the sequence becomes impossible', () => {
    const s1 = advanceSequence({ buffer: [], at: 0 }, 'g', 1000, seqs)
    const s2 = advanceSequence(s1, 'x', 1100, seqs)
    expect(s2.buffer).toEqual(['x'])
    expect(s2.match).toBeUndefined()
  })
})

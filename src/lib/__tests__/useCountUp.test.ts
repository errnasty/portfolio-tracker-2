import { describe, it, expect } from 'vitest'
import { easeOutCubic, countUpValue } from '../useCountUp'

describe('count-up math', () => {
  it('easeOutCubic maps 0->0 and 1->1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })
  it('countUpValue interpolates from->to by eased progress', () => {
    expect(countUpValue(100, 200, 0)).toBe(100)
    expect(countUpValue(100, 200, 1)).toBe(200)
    expect(countUpValue(0, 1000, 0.5)).toBeGreaterThan(500) // ease-out front-loads
  })
})

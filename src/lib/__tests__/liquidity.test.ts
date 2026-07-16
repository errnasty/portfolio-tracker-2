import { describe, it, expect } from 'vitest'
import { isLockedNow, computeLiquidity, type LockCandidate } from '../liquidity'

describe('isLockedNow', () => {
  it('is true for a future date', () => {
    expect(isLockedNow('2027-01-01', '2026-07-15')).toBe(true)
  })
  it('is false for a past date', () => {
    expect(isLockedNow('2026-01-01', '2026-07-15')).toBe(false)
  })
  it('is false for null', () => {
    expect(isLockedNow(null, '2026-07-15')).toBe(false)
  })
})

describe('computeLiquidity', () => {
  const today = '2026-07-15'
  const candidates: LockCandidate[] = [
    { name: 'Locked fund', valueBase: 10000, lockedUntil: '2028-01-01', source: 'holding' },
    { name: 'CPF OA', valueBase: 50000, lockedUntil: null, alwaysLocked: true, source: 'asset' },
    { name: 'Endowment', valueBase: 20000, lockedUntil: '2027-06-01', source: 'policy' },
    { name: 'Matured FD', valueBase: 5000, lockedUntil: '2026-01-01', source: 'asset' }, // already unlocked
    { name: 'Free ETF', valueBase: 30000, lockedUntil: null, source: 'holding' },        // liquid
  ]

  it('sums only currently-locked positive values', () => {
    const r = computeLiquidity(150000, today, candidates)
    // 10000 + 50000 (cpf) + 20000 = 80000
    expect(r.lockedBase).toBe(80000)
    expect(r.liquidBase).toBe(150000 - 80000)
  })

  it('lists locked items soonest-unlock first, undated last', () => {
    const r = computeLiquidity(150000, today, candidates)
    expect(r.items.map((i) => i.name)).toEqual(['Endowment', 'Locked fund', 'CPF OA'])
  })

  it('ignores zero/negative values', () => {
    const r = computeLiquidity(100, today, [{ name: 'x', valueBase: 0, lockedUntil: '2028-01-01', source: 'holding' }])
    expect(r.lockedBase).toBe(0)
    expect(r.items).toHaveLength(0)
  })
})

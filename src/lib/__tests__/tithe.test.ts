import { describe, it, expect } from 'vitest'
import { computeTithe } from '../tithe'

const GIVING = 'cat-giving'
const TRANSFER = 'cat-transfer'
const SALARY = 'cat-salary'

describe('computeTithe', () => {
  it('accrues rate% of income and nets off giving + manual clearances', () => {
    const r = computeTithe({
      txns: [
        { date: '2026-05-01', amount: 3000, category_id: SALARY },     // income
        { date: '2026-05-15', amount: -100, category_id: GIVING },     // tithed
        { date: '2026-06-01', amount: 2000, category_id: null },       // income (uncategorized)
        { date: '2026-06-10', amount: -50, category_id: 'cat-food' },  // ordinary spend, ignored
      ],
      transferCategoryIds: new Set([TRANSFER]),
      givingCategoryIds: new Set([GIVING]),
      ratePct: 10,
      clearances: [{ date: '2026-06-20', amount: 80 }],
    })
    expect(r.totalIncome).toBe(5000)
    expect(r.accrued).toBe(500)
    expect(r.givenViaGiving).toBe(100)
    expect(r.clearedManually).toBe(80)
    expect(r.owed).toBe(320)
  })

  it('excludes transfers from income and respects the start date', () => {
    const r = computeTithe({
      txns: [
        { date: '2026-01-05', amount: 9999, category_id: SALARY },     // before start
        { date: '2026-02-03', amount: 1000, category_id: SALARY },
        { date: '2026-02-04', amount: 500, category_id: TRANSFER },    // own-account move
        { date: '2026-01-20', amount: -200, category_id: GIVING },     // before start
      ],
      transferCategoryIds: new Set([TRANSFER]),
      givingCategoryIds: new Set([GIVING]),
      ratePct: 10,
      startDate: '2026-02-01',
    })
    expect(r.totalIncome).toBe(1000)
    expect(r.accrued).toBe(100)
    expect(r.givenViaGiving).toBe(0)
    expect(r.owed).toBe(100)
  })

  it('can go negative (tithed ahead) and reports per-month buckets', () => {
    const r = computeTithe({
      txns: [
        { date: '2026-03-01', amount: 1000, category_id: SALARY },
        { date: '2026-03-05', amount: -300, category_id: GIVING },
      ],
      transferCategoryIds: new Set(),
      givingCategoryIds: new Set([GIVING]),
      ratePct: 10,
    })
    expect(r.owed).toBe(-200)
    expect(r.byMonth).toEqual([
      { ym: '2026-03', income: 1000, accrued: 100, given: 300 },
    ])
  })

  it('ignores negative/zero clearances and handles empty input', () => {
    const r = computeTithe({
      txns: [],
      transferCategoryIds: new Set(),
      givingCategoryIds: new Set(),
      ratePct: 10,
      clearances: [{ date: '2026-01-01', amount: -50 }, { date: '2026-01-02', amount: 0 }],
    })
    expect(r.accrued).toBe(0)
    expect(r.clearedManually).toBe(0)
    expect(r.owed).toBe(0)
    expect(r.byMonth).toEqual([])
  })
})

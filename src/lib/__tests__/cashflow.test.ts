import { describe, it, expect } from 'vitest'
import { forecastCashflow, trailingDailySpend } from '../cashflow'

describe('forecastCashflow', () => {
  it('burns daily spend and applies scheduled flows on their dates', () => {
    const f = forecastCashflow({
      today: '2026-07-28',
      startBalance: 1000,
      dailySpend: 50,
      scheduled: [
        { date: '2026-07-30', amount: 3000 },   // salary
        { date: '2026-07-31', amount: -200 },   // bill
        { date: '2026-08-05', amount: 999 },    // outside window, ignored
      ],
    })
    // 28th: 1000 · 29th: 950 · 30th: 900+3000=3900 · 31st: 3850−200=3650
    expect(f.series.map((p) => p.value)).toEqual([1000, 950, 3900, 3650])
    expect(f.endOfMonth).toBe(3650)
    expect(f.scheduledNet).toBe(2800)
  })

  it('applies a same-day scheduled flow to the starting point', () => {
    const f = forecastCashflow({
      today: '2026-07-31', startBalance: 100, dailySpend: 10,
      scheduled: [{ date: '2026-07-31', amount: 400 }],
    })
    expect(f.series).toEqual([{ date: '2026-07-31', value: 500 }])
    expect(f.endOfMonth).toBe(500)
  })
})

describe('trailingDailySpend', () => {
  it('averages outflows over the window, ignoring income and old rows', () => {
    const spend = trailingDailySpend([
      { date: '2026-07-10', amountBase: -300 },
      { date: '2026-07-01', amountBase: -300 },
      { date: '2026-07-05', amountBase: 2000 },   // income ignored
      { date: '2026-05-01', amountBase: -999 },   // outside 30d
    ], '2026-07-13', 30)
    expect(spend).toBe(20)
  })
})

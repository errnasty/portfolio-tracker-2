import { describe, it, expect } from 'vitest'
import { buildAttention, type AttentionInput } from '../attention'
import type { UpcomingItem } from '../payments'

const identity = (amt: number) => amt
const fmt = (n: number) => `$${n.toFixed(2)}`

function up(over: Partial<UpcomingItem>): UpcomingItem {
  return {
    id: 'pp-1', source: 'planned', name: 'Rent', amount: 100, currency: 'SGD',
    dueDate: '2026-07-10', repeat: 'monthly', autopay: false, daysUntil: -3,
    ...over,
  }
}

function base(over: Partial<AttentionInput> = {}): AttentionInput {
  return {
    today: '2026-07-13', upcoming: [], ious: [], accounts: [],
    toBase: identity, formatBase: fmt,
    ...over,
  }
}

describe('buildAttention', () => {
  it('flags overdue and due-soon bills separately', () => {
    const items = buildAttention(base({
      upcoming: [
        up({ id: 'a', daysUntil: -3 }),
        up({ id: 'b', name: 'Gym', daysUntil: 3, amount: 50 }),
        up({ id: 'c', name: 'Autopaid', daysUntil: 3, autopay: true }),
        up({ id: 'd', source: 'subscription', daysUntil: -1 }),  // subs never "overdue"
      ],
    }))
    const overdue = items.find((i) => i.tag === 'BILLS')!
    expect(overdue.sev).toBe('high')
    expect(overdue.title).toContain('1 bill overdue')
    const soon = items.find((i) => i.tag === 'DUE SOON')!
    expect(soon.title).toContain('1 due within 7 days · $50.00')
  })

  it('flags maturing deposits and negative balances', () => {
    const items = buildAttention(base({
      upcoming: [up({ id: 'm', source: 'maturity', name: '6m FD matures', daysUntil: 10, amount: 10000 })],
      accounts: [
        { name: 'POSB', type: 'bank', current_balance: -42, currency: 'SGD' },
        { name: 'Card', type: 'credit', current_balance: 500, currency: 'SGD' },  // credit ok
      ],
    }))
    expect(items.find((i) => i.tag === 'MATURING')?.sub).toContain('$10000.00')
    const bal = items.find((i) => i.tag === 'BALANCE')!
    expect(bal.sev).toBe('high')
    expect(bal.title).toBe('POSB is negative')
  })

  it('flags stale IOUs owed to you only', () => {
    const items = buildAttention(base({
      ious: [
        { person: 'Alex', direction: 'owed_to_me', amount: 80, currency: 'SGD', date: '2026-04-01', settled: false },
        { person: 'Ben', direction: 'i_owe', amount: 500, currency: 'SGD', date: '2026-01-01', settled: false },
        { person: 'Cara', direction: 'owed_to_me', amount: 30, currency: 'SGD', date: '2026-07-01', settled: false },
      ],
    }))
    const iou = items.find((i) => i.tag === 'IOU')!
    expect(iou.title).toContain('$80.00')
    expect(iou.sub).toBe('Alex')
  })

  it('flags budget pace breaches only when meaningfully ahead', () => {
    const ahead = buildAttention(base({
      budgetPace: { spentMTD: 800, totalBudget: 1000, dayOfMonth: 15, daysInMonth: 30 },
    }))
    expect(ahead.find((i) => i.tag === 'PACE')?.title).toContain('60% ahead')

    const onTrack = buildAttention(base({
      budgetPace: { spentMTD: 520, totalBudget: 1000, dayOfMonth: 15, daysInMonth: 30 },
    }))
    expect(onTrack.find((i) => i.tag === 'PACE')).toBeUndefined()
  })

  it('returns nothing on a clean book', () => {
    expect(buildAttention(base())).toEqual([])
  })
})

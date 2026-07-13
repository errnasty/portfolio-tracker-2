import { describe, it, expect } from 'vitest'
import { advanceDate, nextOnOrAfter, buildUpcoming, googleCalendarUrl, buildIcs } from '../payments'
import type { PlannedPayment, Subscription } from '@/types'

function pp(over: Partial<PlannedPayment>): PlannedPayment {
  return {
    id: 'id1', user_id: 'u', name: 'Rent', amount: 1200, currency: 'SGD',
    due_date: '2026-08-01', repeat: 'monthly', category_id: null, account_id: null,
    autopay: false, notes: null, paid_at: null, created_at: '', updated_at: '',
    ...over,
  }
}

function sub(over: Partial<Subscription>): Subscription {
  return {
    key: 'spotify', label: 'Spotify', monthlyAmount: 11.98, annualAmount: 143.76,
    occurrences: 5, months: 5, lastDate: '2026-06-13', categoryId: null, status: 'active',
    ...over,
  }
}

describe('advanceDate', () => {
  it('steps weekly/monthly/quarterly/yearly', () => {
    expect(advanceDate('2026-07-01', 'weekly')).toBe('2026-07-08')
    expect(advanceDate('2026-07-15', 'monthly')).toBe('2026-08-15')
    expect(advanceDate('2026-11-15', 'quarterly')).toBe('2027-02-15')
    expect(advanceDate('2026-02-28', 'yearly')).toBe('2027-02-28')
  })

  it('clamps to end of shorter months (and December→January rollover)', () => {
    expect(advanceDate('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(advanceDate('2028-01-31', 'monthly')).toBe('2028-02-29') // leap year
    expect(advanceDate('2026-12-31', 'monthly')).toBe('2027-01-31')
  })

  it("repeat 'none' is a no-op", () => {
    expect(advanceDate('2026-07-01', 'none')).toBe('2026-07-01')
  })
})

describe('nextOnOrAfter', () => {
  it('advances a stale date up to today', () => {
    expect(nextOnOrAfter('2026-03-13', '2026-07-13', 'monthly')).toBe('2026-07-13')
    expect(nextOnOrAfter('2026-03-14', '2026-07-13', 'monthly')).toBe('2026-07-14')
  })
  it('leaves future dates alone', () => {
    expect(nextOnOrAfter('2026-08-01', '2026-07-13', 'monthly')).toBe('2026-08-01')
  })
})

describe('buildUpcoming', () => {
  it('merges planned + subscriptions, sorted by due date, within horizon', () => {
    const items = buildUpcoming({
      planned: [
        pp({ id: 'a', name: 'Rent', due_date: '2026-08-01' }),
        pp({ id: 'b', name: 'Insurance', due_date: '2027-01-01', repeat: 'yearly' }), // beyond 60d
        pp({ id: 'c', name: 'Paid thing', paid_at: '2026-07-01' }),                    // settled
      ],
      subscriptions: [sub({}), sub({ key: 'netflix', label: 'Netflix', status: 'cancelled' })],
      baseCurrency: 'SGD',
      today: '2026-07-13',
    })
    expect(items.map((i) => i.name)).toEqual(['Spotify', 'Rent'])
    expect(items[0].dueDate).toBe('2026-07-13') // 2026-06-13 + 1 month
    expect(items[0].source).toBe('subscription')
  })

  it('keeps overdue items with negative daysUntil', () => {
    const items = buildUpcoming({
      planned: [pp({ due_date: '2026-07-01' })],
      subscriptions: [],
      baseCurrency: 'SGD',
      today: '2026-07-13',
    })
    expect(items[0].daysUntil).toBe(-12)
  })
})

describe('calendar exports', () => {
  const item = { id: 'pp-1', name: 'Rent', amount: 1200, currency: 'SGD', dueDate: '2026-08-01' }

  it('builds an all-day Google Calendar link', () => {
    const url = googleCalendarUrl(item)
    expect(url).toContain('https://calendar.google.com/calendar/render?')
    expect(url).toContain('dates=20260801%2F20260802')
    expect(url).toContain(encodeURIComponent('Pay: Rent').replace(/%20/g, '+'))
  })

  it('builds a valid multi-event ICS with escaping', () => {
    const ics = buildIcs(
      [item, { id: 'pp-2', name: 'Gym; monthly, fee', amount: 50, currency: 'SGD', dueDate: '2026-08-05' }],
      '2026-07-13T00:00:00.000Z',
    )
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260801')
    expect(ics).toContain('DTEND;VALUE=DATE:20260802')
    expect(ics).toContain('Gym\\; monthly\\, fee')
    expect(ics).toContain('DTSTAMP:20260713T000000Z')
  })
})

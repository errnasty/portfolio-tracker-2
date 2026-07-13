import { describe, it, expect } from 'vitest'
import { aggregateIous, distinctTags } from '../ious'
import type { Iou } from '@/types'

let seq = 0
function iou(over: Partial<Iou>): Iou {
  seq += 1
  return {
    id: `iou-${seq}`, user_id: 'u', person: 'Alex', direction: 'owed_to_me',
    amount: 10, currency: 'SGD', tag: null, date: '2026-07-01', notes: null,
    settled: false, settled_at: null, created_at: '', updated_at: '',
    ...over,
  }
}

const identity = (amt: number) => amt

describe('aggregateIous', () => {
  it('nets both directions per person', () => {
    const r = aggregateIous([
      iou({ person: 'Alex', direction: 'owed_to_me', amount: 30 }),
      iou({ person: 'Alex', direction: 'i_owe', amount: 10 }),
      iou({ person: 'Ben', direction: 'i_owe', amount: 25 }),
    ], identity)
    const alex = r.people.find((p) => p.person === 'Alex')!
    expect(alex.net).toBe(20)
    expect(alex.owedToMe).toBe(30)
    expect(alex.iOwe).toBe(10)
    expect(r.totalOwedToMe).toBe(30)
    expect(r.totalIOwe).toBe(35)
    expect(r.net).toBe(-5)
  })

  it('ignores settled entries and merges person names case-insensitively', () => {
    const r = aggregateIous([
      iou({ person: 'alex', amount: 15 }),
      iou({ person: 'Alex ', amount: 5 }),
      iou({ person: 'Alex', amount: 100, settled: true }),
    ], identity)
    expect(r.people).toHaveLength(1)
    expect(r.people[0].owedToMe).toBe(20)
    expect(r.people[0].openCount).toBe(2)
  })

  it('converts currencies via the provided converter', () => {
    const toBase = (amt: number, cur: string) => (cur === 'USD' ? amt * 1.3 : amt)
    const r = aggregateIous([iou({ amount: 10, currency: 'USD' })], toBase)
    expect(r.totalOwedToMe).toBe(13)
  })

  it('collects tags and sorts people by |net|', () => {
    const r = aggregateIous([
      iou({ person: 'Ben', amount: 5, tag: 'JB trip' }),
      iou({ person: 'Cara', direction: 'i_owe', amount: 50, tag: 'JB trip' }),
      iou({ person: 'Ben', amount: 2, tag: 'dinner' }),
    ], identity)
    expect(r.people.map((p) => p.person)).toEqual(['Cara', 'Ben'])
    expect(r.people[1].tags.sort()).toEqual(['JB trip', 'dinner'].sort())
  })
})

describe('distinctTags', () => {
  it('returns sorted distinct tags including settled entries', () => {
    expect(distinctTags([
      iou({ tag: 'dinner' }), iou({ tag: 'JB trip', settled: true }), iou({ tag: 'dinner' }), iou({}),
    ])).toEqual(['JB trip', 'dinner'])
  })
})

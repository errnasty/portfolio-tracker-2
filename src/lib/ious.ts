import type { Iou } from '@/types'

// IOU aggregation: net position per person over unsettled entries.
// "They owe me 30, I owe them 10" nets to +20 in your favour.

export interface PersonBalance {
  person: string               // display name (first spelling seen)
  owedToMe: number             // base currency
  iOwe: number                 // base currency
  net: number                  // owedToMe - iOwe (positive = they owe you)
  openCount: number
  tags: string[]               // distinct tags across open entries
  lastDate: string
  entries: Iou[]               // open entries, newest first
}

export interface IouSummary {
  people: PersonBalance[]      // sorted by |net| descending
  totalOwedToMe: number
  totalIOwe: number
  net: number
}

export function aggregateIous(
  ious: Iou[],
  toBase: (amount: number, currency: string) => number,
): IouSummary {
  const byPerson = new Map<string, PersonBalance>()

  for (const iou of ious) {
    if (iou.settled) continue
    const display = iou.person.trim()
    const key = display.toLowerCase()
    let p = byPerson.get(key)
    if (!p) {
      p = { person: display, owedToMe: 0, iOwe: 0, net: 0, openCount: 0, tags: [], lastDate: iou.date, entries: [] }
      byPerson.set(key, p)
    }
    const amt = toBase(Number(iou.amount) || 0, String(iou.currency))
    if (iou.direction === 'owed_to_me') p.owedToMe += amt
    else p.iOwe += amt
    p.openCount += 1
    if (iou.tag && !p.tags.includes(iou.tag)) p.tags.push(iou.tag)
    if (iou.date > p.lastDate) p.lastDate = iou.date
    p.entries.push(iou)
  }

  let totalOwedToMe = 0
  let totalIOwe = 0
  for (const p of byPerson.values()) {
    p.net = p.owedToMe - p.iOwe
    p.entries.sort((a, b) => b.date.localeCompare(a.date))
    totalOwedToMe += p.owedToMe
    totalIOwe += p.iOwe
  }

  return {
    people: Array.from(byPerson.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
    totalOwedToMe,
    totalIOwe,
    net: totalOwedToMe - totalIOwe,
  }
}

// Distinct tags across all entries (settled included), for the filter chips.
export function distinctTags(ious: Iou[]): string[] {
  const tags = new Set<string>()
  for (const iou of ious) if (iou.tag) tags.add(iou.tag)
  return Array.from(tags).sort()
}

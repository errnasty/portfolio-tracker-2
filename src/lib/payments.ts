import type { PaymentRepeat, PlannedPayment, Subscription } from '@/types'

// Upcoming-payment helpers: recurrence date math (UTC, timezone-safe),
// subscription next-charge prediction, and calendar exports (Google
// Calendar template URLs + a downloadable .ics).

const DAY_MS = 86_400_000

function parseIso(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number)
  return { y, m, d }
}

function fmt(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}

function daysInMonth(y: number, m: number): number {
  // m is 1-based; day 0 of the next month = last day of this month.
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// One recurrence step forward. Month-based steps clamp to the end of the
// target month (Jan 31 + 1 month = Feb 28/29).
export function advanceDate(date: string, repeat: PaymentRepeat): string {
  const { y, m, d } = parseIso(date)
  switch (repeat) {
    case 'weekly':
      return fmt(new Date(Date.UTC(y, m - 1, d) + 7 * DAY_MS))
    case 'monthly':
    case 'quarterly': {
      const step = repeat === 'monthly' ? 1 : 3
      const total = y * 12 + (m - 1) + step
      const ny = Math.floor(total / 12)
      const nm = (total % 12) + 1
      return fmt(new Date(Date.UTC(ny, nm - 1, Math.min(d, daysInMonth(ny, nm)))))
    }
    case 'yearly':
      return fmt(new Date(Date.UTC(y + 1, m - 1, Math.min(d, daysInMonth(y + 1, m)))))
    default:
      return date
  }
}

// First occurrence on/after `today`, stepping `repeat` from `date`.
// Bounded so bad data can't loop forever.
export function nextOnOrAfter(date: string, today: string, repeat: PaymentRepeat): string {
  if (repeat === 'none') return date
  let cur = date
  for (let i = 0; cur < today && i < 600; i++) cur = advanceDate(cur, repeat)
  return cur
}

export interface UpcomingItem {
  id: string                   // 'pp-<uuid>' or 'sub-<merchant key>'
  source: 'planned' | 'subscription'
  name: string
  amount: number               // native currency for planned; base for subs
  currency: string
  dueDate: string
  repeat: PaymentRepeat
  autopay: boolean
  daysUntil: number            // negative = overdue
  planned?: PlannedPayment     // present for source='planned'
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = parseIso(fromIso); const b = parseIso(toIso)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS)
}

// Merge manual planned payments with predicted subscription charges into one
// due-date-sorted list. Subscriptions predict lastDate + monthly cadence.
export function buildUpcoming(opts: {
  planned: PlannedPayment[]
  subscriptions: Subscription[]
  baseCurrency: string
  today: string                // YYYY-MM-DD
  horizonDays?: number         // include items due within N days (default 60)
}): UpcomingItem[] {
  const { planned, subscriptions, baseCurrency, today, horizonDays = 60 } = opts
  const items: UpcomingItem[] = []

  for (const p of planned) {
    if (p.paid_at) continue    // settled one-offs drop off the list
    // Overdue items keep their real (past) due date; recurring items that were
    // never marked paid still show as overdue rather than silently advancing.
    items.push({
      id: `pp-${p.id}`,
      source: 'planned',
      name: p.name,
      amount: Number(p.amount) || 0,
      currency: String(p.currency),
      dueDate: p.due_date,
      repeat: p.repeat,
      autopay: p.autopay,
      daysUntil: daysBetween(today, p.due_date),
      planned: p,
    })
  }

  for (const s of subscriptions) {
    if (s.status === 'cancelled') continue
    const due = nextOnOrAfter(s.lastDate, today, 'monthly')
    items.push({
      id: `sub-${s.key}`,
      source: 'subscription',
      name: s.label,
      amount: s.monthlyAmount,
      currency: baseCurrency,
      dueDate: due,
      repeat: 'monthly',
      autopay: true,           // subscriptions charge themselves
      daysUntil: daysBetween(today, due),
    })
  }

  return items
    .filter((i) => i.daysUntil <= horizonDays)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name))
}

// ── Recurring posting ──────────────────────────────────────────────────────

// Every due date of a payment that has already passed (inclusive of today),
// oldest first — these become posted transactions. Bounded so bad data can't
// flood the ledger. For repeat 'none' there is at most one posting.
export function duePostings(
  p: Pick<PlannedPayment, 'due_date' | 'repeat'>,
  today: string,
  max = 24,
): string[] {
  const out: string[] = []
  let cur = p.due_date
  while (cur <= today && out.length < max) {
    out.push(cur)
    if (p.repeat === 'none') break
    const next = advanceDate(cur, p.repeat)
    if (next <= cur) break     // safety: never loop on a non-advancing date
    cur = next
  }
  return out
}

// The due date a recurring payment should carry after posting everything due.
export function nextDueAfterPostings(
  p: Pick<PlannedPayment, 'due_date' | 'repeat'>,
  today: string,
): string {
  const next = nextOnOrAfter(p.due_date, today, p.repeat)
  // An occurrence landing exactly on today gets posted, so advance past it.
  return next <= today ? advanceDate(next, p.repeat) : next
}

// ── Calendar exports ───────────────────────────────────────────────────────

// All-day Google Calendar event link (no API/OAuth needed).
export function googleCalendarUrl(item: Pick<UpcomingItem, 'name' | 'amount' | 'currency' | 'dueDate'>): string {
  const start = item.dueDate.replace(/-/g, '')
  const { y, m, d } = parseIso(item.dueDate)
  const end = fmt(new Date(Date.UTC(y, m - 1, d) + DAY_MS)).replace(/-/g, '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Pay: ${item.name}`,
    dates: `${start}/${end}`,
    details: `${item.currency} ${item.amount.toFixed(2)} due — added from Aureus`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// RFC 5545 calendar with one all-day event per upcoming item. Importable
// into Google Calendar, Apple Calendar, Outlook.
export function buildIcs(items: Pick<UpcomingItem, 'id' | 'name' | 'amount' | 'currency' | 'dueDate'>[], nowIso?: string): string {
  const stamp = (nowIso ?? new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aureus//Payments//EN',
    'CALSCALE:GREGORIAN',
  ]
  for (const item of items) {
    const { y, m, d } = parseIso(item.dueDate)
    const end = fmt(new Date(Date.UTC(y, m - 1, d) + DAY_MS)).replace(/-/g, '')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.id}-${item.dueDate}@aureus`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${item.dueDate.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEscape(`Pay: ${item.name} (${item.currency} ${item.amount.toFixed(2)})`)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

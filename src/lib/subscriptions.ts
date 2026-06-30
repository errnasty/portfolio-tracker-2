import { convertToBase } from '@/lib/calculations'
import type { BankTransaction, FxRates } from '@/types'

// Subscriptions aren't stored — they're detected from recurring bank
// transactions. We group charges by a normalized merchant key, keep those that
// recur across ≥2 months, and limit to things that look like subscriptions
// (Bills & Utilities category, or a known subscription brand).

const MONTHS = new Set(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])
const NOISE = new Set([
  'si', 'sgp', 'sg', 'sgd', 'usd', 'usa', 'us', 'sa', 'swe', 'deu', 'mys', 'myr', 'au', 'my',
  'mp', 'ms', 'st', 'singapore', 'pte', 'ltd', 'the', 'nets', 'contactless', 'qr', 'payment',
  'paynow', 'transfer', 'othr', 'ref', 'incoming', 'com', 'www', 'global', 'bill',
])
const KNOWN_SUBS = [
  'spotify', 'netflix', 'disney', 'youtube', 'anthropic', 'claude', 'openai', 'chatgpt',
  'canva', 'microsoft', 'adobe', 'netlify', 'google', 'icloud', 'apple', 'notion', 'github',
  'circles', 'singtel', 'starhub', 'simba', 'grab subscription', 'prime', 'dropbox', 'figma',
  'vercel', 'linkedin', 'amazon', 'realms', 'minecraft', 'm1',
]

export interface DetectedSubscription {
  key: string
  label: string
  monthlyAmount: number   // base currency
  occurrences: number
  months: number
  lastDate: string
  categoryId: string | null
}

// Normalize a transaction narrative down to a stable merchant key, e.g.
// "Spotify P437998A6F St SWE 13JUN 5264-..." -> "spotify".
export function normalizeMerchant(description: string, merchant?: string | null): string {
  let s = (merchant && merchant.trim() ? merchant : description || '').toLowerCase()
  s = s.replace(/^.*?\bto:\s*/, '').replace(/^.*?\bfrom:\s*/, '')   // drop PayNow prefixes
  s = s.replace(/\b\d{1,2}[a-z]{3}\b/g, ' ')                        // dates like 13jun
  s = s.replace(/[*_/.,()\-]/g, ' ')
  const words = s.split(/\s+/).filter((w) => {
    if (w.length < 2) return false
    if (/^\d+$/.test(w)) return false       // pure number
    if (/\d.*\d/.test(w)) return false      // 2+ digits → ref/card/code
    if (NOISE.has(w)) return false
    if (MONTHS.has(w)) return false
    return true
  })
  return words.slice(0, 2).join(' ')
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function detectSubscriptions(
  txns: BankTransaction[],
  catNameById: Record<string, string>,
  fxRates: FxRates | null,
): DetectedSubscription[] {
  const groups = new Map<string, { amts: number[]; months: Set<string>; last: string; cats: Map<string, number> }>()

  for (const t of txns) {
    if (Number(t.amount) >= 0) continue            // expenses only
    const key = normalizeMerchant(t.description, t.merchant)
    if (!key) continue
    const base = fxRates ? convertToBase(-Number(t.amount), t.currency, fxRates) : -Number(t.amount)
    let g = groups.get(key)
    if (!g) { g = { amts: [], months: new Set(), last: '', cats: new Map() }; groups.set(key, g) }
    g.amts.push(base)
    g.months.add(t.date.slice(0, 7))
    if (t.date > g.last) g.last = t.date
    const cid = t.category_id ?? '__none__'
    g.cats.set(cid, (g.cats.get(cid) ?? 0) + 1)
  }

  const out: DetectedSubscription[] = []
  for (const [key, g] of groups) {
    if (g.months.size < 2) continue                // must recur
    let domId = '__none__', domN = 0
    for (const [cid, n] of g.cats) if (n > domN) { domN = n; domId = cid }
    const categoryId = domId === '__none__' ? null : domId
    const catName = categoryId ? catNameById[categoryId] : undefined
    const isSub = catName === 'Bills & Utilities' || KNOWN_SUBS.some((k) => key.includes(k))
    if (!isSub) continue
    out.push({
      key,
      label: titleCase(key),
      monthlyAmount: median(g.amts),
      occurrences: g.amts.length,
      months: g.months.size,
      lastDate: g.last,
      categoryId,
    })
  }
  return out.sort((a, b) => b.monthlyAmount - a.monthlyAmount)
}

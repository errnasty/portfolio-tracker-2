// Smart parsing for the global quick-add box: one line of natural text
// becomes a transaction. Examples:
//   "14.50 lunch grab"      → expense 14.50, "lunch grab"
//   "grab lunch 14.5"       → expense 14.50, "grab lunch"
//   "+2500 july salary"     → income 2500, "july salary"
//   "coffee 4"              → expense 4.00, "coffee"

export interface QuickEntry {
  amount: number | null        // absolute; null when no number found
  description: string
  kind: 'expense' | 'income'
}

// Matches a money token: optional +/-, digits with optional thousands commas
// and decimals. Standalone token only (so "7-eleven" isn't an amount).
const AMOUNT_RE = /(?:^|\s)([+-]?)\$?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?=\s|$)/

export function parseQuickEntry(text: string): QuickEntry {
  const trimmed = text.trim()
  if (!trimmed) return { amount: null, description: '', kind: 'expense' }

  const m = trimmed.match(AMOUNT_RE)
  if (!m) return { amount: null, description: trimmed, kind: 'expense' }

  const sign = m[1]
  const amount = parseFloat(m[2].replace(/,/g, ''))
  const description = (
    trimmed.slice(0, m.index ?? 0) + ' ' +
    trimmed.slice((m.index ?? 0) + m[0].length)
  ).replace(/\s+/g, ' ').trim()

  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    description,
    kind: sign === '+' ? 'income' : 'expense',
  }
}

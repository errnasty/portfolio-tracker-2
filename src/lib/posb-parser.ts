import { splitCsvLine, parseNumber } from '@/lib/ibkr-parser'

// DBS / POSB digibank exports transaction history as a CSV with a small
// preamble (account name / number / date range) followed by a header row that
// always contains "Transaction Date", then the data rows. Column layouts vary
// slightly between exports, so we locate columns by fuzzy header matching
// rather than fixed positions.
//
// Sign convention for the imported amount: credit = positive (income/refund),
// debit = negative (spend). This matches BankTransaction.amount.

export interface BankImportRow {
  date: string                 // YYYY-MM-DD
  description: string
  merchant: string | null
  amount: number               // signed: credit +, debit -
  currency: string
  external_id: string          // stable dedupe key for re-imports
  source: 'csv'
}

export interface ParsedBankRow {
  raw: string
  txn: BankImportRow | null
  reason?: string
}

export interface BankParseResult {
  rows: ParsedBankRow[]
  meta: { account?: string; accountNumber?: string }
  headerFound: boolean
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// Accepts: "15 Jun 2025", "15-Jun-25", "15/06/2025", "2025-06-15".
export function parsePosbDate(s: string): string | null {
  if (!s) return null
  const t = s.trim().replace(/^"|"$/g, '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t

  let m = t.match(/^(\d{1,2})[\s/-]([A-Za-z]{3})[\s/-](\d{2,4})$/)
  if (m) {
    const day = m[1].padStart(2, '0')
    const mon = MONTHS[m[2].toLowerCase()]
    let year = m[3]
    if (year.length === 2) year = `20${year}`
    if (mon) return `${year}-${mon}-${day}`
  }

  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) // DD/MM/YYYY
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

// Stable, dependency-free hash (djb2) → base36. Used to dedupe re-imports.
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function findHeaderIndex(lines: string[]): number {
  return lines.findIndex((l) => /transaction\s*date/i.test(l) || /^\s*"?date"?\s*,/i.test(l))
}

function colFinder(headers: string[]) {
  const lower = headers.map((h) => h.toLowerCase().trim())
  return (...needles: string[]): number => {
    for (const n of needles) {
      const idx = lower.findIndex((h) => h.includes(n))
      if (idx >= 0) return idx
    }
    return -1
  }
}

export function parsePosbCsv(text: string): BankParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const meta: BankParseResult['meta'] = {}

  // Scrape a couple of preamble fields for display (best-effort).
  for (const l of lines.slice(0, 12)) {
    const cols = splitCsvLine(l)
    const key = (cols[0] ?? '').toLowerCase()
    if (key.includes('account') && key.includes('number')) meta.accountNumber = cols[1]
    else if (key.includes('account')) meta.account = cols[1]
  }

  const headerIdx = findHeaderIndex(lines)
  if (headerIdx < 0) {
    return { rows: [], meta, headerFound: false }
  }

  const headers = splitCsvLine(lines[headerIdx])
  const find = colFinder(headers)
  const dateIdx = find('transaction date', 'date')
  const debitIdx = find('debit', 'withdrawal')
  const creditIdx = find('credit', 'deposit')
  // A single signed "amount" column is an alternative layout.
  const amountIdx = debitIdx < 0 && creditIdx < 0 ? find('amount') : -1
  // Description: prefer explicit reference columns, else any "ref"/"description".
  const refIdxs = headers
    .map((h, i) => ({ h: h.toLowerCase(), i }))
    .filter(({ h }) => /ref|description|narrative|particular|details/.test(h)
      && !/transaction date/.test(h))
    .map(({ i }) => i)

  const rows: ParsedBankRow[] = []
  const seen = new Map<string, number>() // (date|amount|desc) → occurrence count

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    const raw = cols.join(',')
    if (cols.length < 2) continue

    const date = parsePosbDate(dateIdx >= 0 ? cols[dateIdx] : '')
    if (!date) {
      rows.push({ raw, txn: null, reason: 'No valid transaction date' })
      continue
    }

    let amount: number
    if (amountIdx >= 0) {
      amount = parseNumber(cols[amountIdx])
    } else {
      const debit = debitIdx >= 0 ? parseNumber(cols[debitIdx]) : 0
      const credit = creditIdx >= 0 ? parseNumber(cols[creditIdx]) : 0
      amount = credit - debit
    }
    if (amount === 0) {
      rows.push({ raw, txn: null, reason: 'Zero / unparseable amount' })
      continue
    }

    const description = (refIdxs.length > 0 ? refIdxs.map((i) => cols[i]) : cols)
      .map((c) => (c ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 300)

    const key = `${date}|${amount}|${description}`
    const occ = seen.get(key) ?? 0
    seen.set(key, occ + 1)

    rows.push({
      raw,
      txn: {
        date,
        description: description || 'Bank transaction',
        merchant: null,
        amount,
        currency: 'SGD',
        external_id: `posb-${hash(`${key}#${occ}`)}`,
        source: 'csv',
      },
    })
  }

  return { rows, meta, headerFound: true }
}

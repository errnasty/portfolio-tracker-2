import { parsePosbDate } from '@/lib/posb-parser'

// Parses DBS / POSB transaction alert emails into a spending row. Templates
// vary (card swipe, PayLah!, PayNow, GIRO), so we lean on tolerant regexes over
// the combined subject + plaintext body rather than a fixed layout.
//
// Sign convention matches BankTransaction.amount: debit/payment = negative,
// credit/received/refund = positive.

export interface ParsedEmailTxn {
  date: string | null          // YYYY-MM-DD, or null if not found (caller fills from message date)
  description: string
  merchant: string | null
  amount: number               // signed
  currency: string
  payeeKey: string | null      // stable grouping key (see derivePayeeKey)
  confidence: 'high' | 'low'   // 'low' when no counterparty could be extracted
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function findDate(text: string): string | null {
  const patterns = [
    /(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}-[A-Za-z]{3}-\d{2,4})/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      const d = parsePosbDate(m[1])
      if (d) return d
    }
  }
  return null
}

// Stop capture at the next field label, trailing boilerplate, or punctuation.
const STOP = '(?=\\s+(?:to|from|on|ref|dear|thank|didn|via|account|your|if|kindly|please)\\b|[.,;]|$)'

// Values that are never a real counterparty.
function rejectValue(v: string): boolean {
  return !v
    || /^your\b/i.test(v)
    || /your\b[\s\S]*account ending/i.test(v)
    || /view transaction|login|digibank/i.test(v)
}

// Pull a counterparty after a label. `strict` requires a colon (real field
// lines like "To:"), which structurally skips decoys ("refer to your",
// "To view details"). `loose` allows a bare word ("at NTUC", "from JOHN").
// We scan ALL matches and return the first that isn't a rejected value, so one
// decoy no longer aborts the search.
function extractField(text: string, labels: string[], mode: 'strict' | 'loose'): string | null {
  const sep = mode === 'strict' ? ':\\s*' : '\\s+'
  for (const label of labels) {
    const re = new RegExp(`\\b${label}${sep}([A-Za-z0-9][\\s\\S]{1,80}?)${STOP}`, 'ig')
    for (const m of text.matchAll(re)) {
      const v = m[1].trim().replace(/\s+/g, ' ')
      if (!rejectValue(v)) return v
    }
  }
  return null
}

// Drop a trailing "(MOBILE ending 9989)" / "(account ending 0152)" /
// "A/C ending 0152" so the merchant is just the name (keeps category-rule
// substring matching stable).
export function cleanMerchant(raw: string): string {
  return raw
    .replace(/\s*\((?:mobile|account|a\/c)\s+ending\s+\d+\)\s*$/i, '')
    .replace(/\s+(?:a\/c|account)\s+ending\s+\d+\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Stable per-payee grouping key. Mobile-ending is the most stable identifier
// (masked names vary run to run), then account-ending, then a normalized name.
export function derivePayeeKey(raw: string | null): string | null {
  if (!raw) return null
  const mobile = raw.match(/mobile\s+ending\s+(\d{3,})/i)
  if (mobile) return `mobile:${mobile[1]}`
  const acct = raw.match(/(?:account|a\/c)\s+ending\s+(\d{3,})/i)
  if (acct) return `acct:${acct[1]}`
  const name = cleanMerchant(raw).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return name ? `name:${name}` : null
}

const CUR_MAP: Record<string, string> = { 'S$': 'SGD', 'US$': 'USD', '$': 'SGD' }

export function parseDbsAlert(subject: string, body: string): ParsedEmailTxn | null {
  const text = `${subject}\n${stripHtml(body)}`

  // Amount + currency. Accepts "SGD 25.50", "S$25.50", "$25.50".
  const m = text.match(/(SGD|USD|EUR|US\$|S\$|\$)\s?([\d,]+\.\d{2})/i)
  if (!m) return null
  const rawCur = m[1].toUpperCase()
  const currency = CUR_MAP[rawCur] ?? (rawCur.length === 3 ? rawCur : 'SGD')
  const magnitude = parseFloat(m[2].replace(/,/g, ''))
  if (isNaN(magnitude) || magnitude === 0) return null

  const isCredit = /credited|received|incoming|refund|deposit|inward|salary/i.test(text)
  const amount = isCredit ? magnitude : -magnitude

  // Credit = money in → counterparty is the sender (From). Debit = money out →
  // recipient (To). Colon-anchored field lines first, then bare-word forms.
  const counterparty =
    extractField(text, isCredit ? ['from'] : ['to'], 'strict') ??
    extractField(text, isCredit ? ['from', 'at'] : ['at', 'merchant'], 'loose')

  const confidence: 'high' | 'low' = counterparty ? 'high' : 'low'
  const description = counterparty
    ? counterparty.slice(0, 300)
    : (subject.trim() || 'DBS transaction alert')

  return {
    date: findDate(text),
    description,
    merchant: counterparty ? cleanMerchant(counterparty) : null,
    amount,
    currency,
    payeeKey: derivePayeeKey(counterparty),
    confidence,
  }
}

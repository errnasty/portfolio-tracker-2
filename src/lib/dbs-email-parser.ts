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

// Pull a counterparty after a label (From/To/at/merchant). The body is a single
// line after stripHtml, so we stop the capture at the next field label or
// punctuation to avoid swallowing the rest of the email.
const STOP = '(?=\\s+(?:to|from|on|ref|dear|thank|didn|via|account|your)\\b|[.,;]|$)'
function extractField(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`\\b${label}[:\\s]+([A-Za-z0-9][\\s\\S]{1,60}?)${STOP}`, 'i')
    const m = text.match(re)
    if (m) {
      const v = m[1].trim().replace(/\s+/g, ' ')
      if (v && !/^your\b/i.test(v)) return v
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
  // recipient/merchant (To / at).
  const merchant = isCredit
    ? extractField(text, ['from', 'at'])
    : extractField(text, ['to', 'at', 'merchant'])
  const description = merchant
    ? `${isCredit ? 'Received from' : 'Paid'} ${merchant}`
    : subject.trim() || 'DBS transaction alert'

  return {
    date: findDate(text),
    description: description.slice(0, 300),
    merchant,
    amount,
    currency,
  }
}

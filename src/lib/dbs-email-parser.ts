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

function findMerchant(text: string): string | null {
  const patterns = [
    /\bat\s+([A-Za-z0-9][^\n.,;]{2,40})/i,
    /\bto\s+([A-Za-z0-9][^\n.,;]{2,40})/i,
    /\bfrom\s+([A-Za-z0-9][^\n.,;]{2,40})/i,
    /merchant[:\s]+([A-Za-z0-9][^\n.,;]{2,40})/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[1].trim().replace(/\s+/g, ' ')
  }
  return null
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

  const merchant = findMerchant(text)
  const description = merchant
    ? `${isCredit ? 'Received' : 'Paid'} ${merchant}`
    : subject.trim() || 'DBS transaction alert'

  return {
    date: findDate(text),
    description: description.slice(0, 300),
    merchant,
    amount,
    currency,
  }
}

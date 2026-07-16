// Extracts a transaction draft from free-form text (a pasted bank SMS/email)
// or, later, a receipt image. The regex-first path reuses parseDbsAlert; this
// module holds the LLM fallback's prompt builder + a strict response
// validator, kept pure so they can be unit-tested without network calls.

export interface TxnDraft {
  amount: number                 // signed: negative = expense, positive = income
  currency: string
  date: string | null            // YYYY-MM-DD
  merchant: string | null
  description: string
  confidence: 'high' | 'low'
}

// Free models on OpenRouter for text extraction (tried in order).
export const EXTRACT_TEXT_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.2-3b-instruct:free',
]

// Free vision-capable models on OpenRouter (for receipt/screenshot capture).
export const EXTRACT_VISION_MODELS = [
  'qwen/qwen2.5-vl-72b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
]

const SCHEMA_INSTRUCTION = `Respond with ONLY a JSON object (no markdown, no prose) of this exact shape:
{
  "amount": number,        // POSITIVE magnitude of the transaction
  "direction": "debit" | "credit",  // debit = money out/spent, credit = money in/received
  "currency": string,      // ISO code, e.g. "SGD", "USD"; default "SGD" if unclear
  "date": string | null,   // "YYYY-MM-DD" if a date is present, else null
  "merchant": string | null, // the counterparty/merchant name, else null
  "description": string    // a short human description of the transaction
}`

// Small deterministic string hash (djb2) — enough to build a stable
// external_id so re-pasting the same SMS dedupes, without pulling in crypto
// on the client.
export function stableHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// Stable dedup key for a pasted/scanned draft. Same source + date + amount
// always yields the same id, so re-capturing the same transaction is caught
// by the (user_id, external_id) unique constraint.
export function captureExternalId(prefix: 'paste' | 'receipt', seed: string, date: string, amount: number): string {
  return `${prefix}-${stableHash(`${seed}|${date}|${amount}`)}`
}

export function buildExtractPrompt(text: string): string {
  return `You extract a single financial transaction from a bank SMS or email notification.

Text:
"""
${text.slice(0, 2000)}
"""

${SCHEMA_INSTRUCTION}

Rules:
- amount is always a positive number; use "direction" for the sign.
- If it's a card spend/payment/transfer out, direction is "debit".
- If it's a salary/refund/received/credit, direction is "credit".
- If no amount can be found, respond with {"amount": 0, "direction": "debit", "currency": "SGD", "date": null, "merchant": null, "description": ""}.`
}

export const VISION_EXTRACT_PROMPT = `You extract a single purchase from a photo of a receipt or a screenshot of a bank notification.
${SCHEMA_INSTRUCTION}
For a receipt, amount is the GRAND TOTAL (not subtotal), direction is "debit", merchant is the shop name, and date is the receipt date.`

// Validate + coerce an LLM JSON response into a TxnDraft. Returns null when
// no usable amount is present so the caller can 422. `raw` may be the parsed
// object or a JSON string (possibly wrapped in ```json fences).
export function validateExtractResponse(raw: unknown): TxnDraft | null {
  let obj: any = raw
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    try { obj = JSON.parse(cleaned) } catch { return null }
  }
  if (!obj || typeof obj !== 'object') return null

  const magnitude = Math.abs(Number(obj.amount))
  if (!Number.isFinite(magnitude) || magnitude === 0) return null

  const direction = String(obj.direction ?? 'debit').toLowerCase()
  const isCredit = direction === 'credit'
  const amount = isCredit ? magnitude : -magnitude

  let currency = String(obj.currency ?? 'SGD').toUpperCase().trim()
  if (!/^[A-Z]{3}$/.test(currency)) currency = 'SGD'

  let date: string | null = null
  if (obj.date && /^\d{4}-\d{2}-\d{2}$/.test(String(obj.date))) {
    const d = new Date(String(obj.date))
    if (!isNaN(d.getTime())) date = String(obj.date)
  }

  const merchant = obj.merchant ? String(obj.merchant).slice(0, 200).trim() || null : null
  const description = (obj.description ? String(obj.description) : merchant ?? 'Transaction')
    .slice(0, 300).trim() || 'Transaction'

  return { amount, currency, date, merchant, description, confidence: 'low' }
}

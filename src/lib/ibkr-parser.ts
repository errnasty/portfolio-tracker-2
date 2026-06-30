import type { Currency, Transaction, TransactionType } from '@/types'

// IBKR Activity Statement is a multi-section CSV. Each row begins with the
// section name, followed by either "Header" (column names) or "Data" (a row).
// We parse the relevant sections — Trades, Dividends, Corporate Actions —
// and translate each into our Transaction shape.

export interface ParsedRow {
  source: 'trades' | 'dividends' | 'corporate_actions'
  // Original CSV row text for the preview
  raw: string
  // Mapped transaction (or null if we couldn't map)
  txn: Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'> | null
  // Why we couldn't map (if applicable)
  reason?: string
}

export interface ParseResult {
  rows: ParsedRow[]
  // Detected statement metadata for display
  meta: {
    accountId?: string
    period?: string
    statementType?: string
  }
  // Raw section detection for debugging
  sectionsFound: string[]
}

// Robust-enough CSV line splitter. Handles quoted fields with embedded commas
// and escaped double-quotes ("").
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuote = false }
      } else {
        cur += c
      }
    } else {
      if (c === '"') inQuote = true
      else if (c === ',') { out.push(cur); cur = '' }
      else cur += c
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

// Map an IBKR Date/Time string to our YYYY-MM-DD date.
// IBKR formats: "2024-08-15, 10:23:45" or "2024-08-15"
function parseIbkrDate(s: string): string | null {
  if (!s) return null
  const trimmed = s.trim().replace(/^"|"$/g, '')
  // Take whatever's before any comma or space
  const datePart = trimmed.split(/[, ]/)[0]
  // Validate basic ISO date shape
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart
  // Some IBKR exports use YYYYMMDD
  if (/^\d{8}$/.test(datePart)) {
    return `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`
  }
  return null
}

export function parseNumber(s: string): number {
  if (!s) return 0
  const cleaned = s.replace(/[",\s]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

// IBKR symbols sometimes need adjustment. SGX names come through as
// "D05" but we need "D05.SI" for Yahoo lookups.  That mapping is
// exchange-specific and best handled when the user reviews — we leave
// the symbol as-is.
function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

function asCurrency(c: string): Currency {
  const upper = c.toUpperCase()
  if (upper === 'SGD' || upper === 'EUR' || upper === 'USD') return upper
  return 'USD'
}

// ── Trades ────────────────────────────────────────────────────────────────
// Header (typical):
//   Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,
//   Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
function mapTradeRow(headers: string[], cols: string[]): ParsedRow {
  const get = (h: string) => {
    const idx = headers.indexOf(h)
    return idx >= 0 ? cols[idx] : ''
  }
  const raw = cols.join(',')

  // Skip subtotal / total rows — they have DataDiscriminator like "SubTotal"
  const dd = get('DataDiscriminator')
  if (dd && dd !== 'Order' && dd !== 'Trade' && dd !== 'ClosedLot') {
    return { source: 'trades', raw, txn: null, reason: `Skipped ${dd} row` }
  }
  if (dd === 'ClosedLot') {
    return { source: 'trades', raw, txn: null, reason: 'Lot-matching row (skipped)' }
  }

  const assetCategory = get('Asset Category')
  if (assetCategory && !/Stocks|ETF|Equity/i.test(assetCategory)) {
    return { source: 'trades', raw, txn: null, reason: `Unsupported asset: ${assetCategory}` }
  }

  const symbol = normalizeSymbol(get('Symbol'))
  const date = parseIbkrDate(get('Date/Time'))
  const quantity = parseNumber(get('Quantity'))
  const price = parseNumber(get('T. Price'))
  const fees = Math.abs(parseNumber(get('Comm/Fee')))
  const currency = asCurrency(get('Currency'))

  if (!symbol) return { source: 'trades', raw, txn: null, reason: 'Missing symbol' }
  if (!date)   return { source: 'trades', raw, txn: null, reason: 'Missing or invalid date' }
  if (quantity === 0) return { source: 'trades', raw, txn: null, reason: 'Zero-quantity trade' }
  if (price <= 0) return { source: 'trades', raw, txn: null, reason: 'Missing price' }

  const type: TransactionType = quantity > 0 ? 'buy' : 'sell'
  const shares = Math.abs(quantity)

  return {
    source: 'trades',
    raw,
    txn: {
      ticker: symbol,
      type,
      date,
      shares,
      price_per_share: price,
      amount: 0,
      currency,
      fees,
      split_ratio: null,
      notes: 'IBKR import',
    },
  }
}

// ── Dividends ─────────────────────────────────────────────────────────────
// Typical header:
//   Dividends,Header,Currency,Date,Description,Amount
// Description looks like:
//   "VWRA(IE00BK5BQT80) Cash Dividend USD 0.49 per share..."
function mapDividendRow(headers: string[], cols: string[]): ParsedRow {
  const get = (h: string) => {
    const idx = headers.indexOf(h)
    return idx >= 0 ? cols[idx] : ''
  }
  const raw = cols.join(',')

  const description = get('Description')
  // Total rows include "Total" in currency or no description
  if (!description || /^total/i.test(get('Currency'))) {
    return { source: 'dividends', raw, txn: null, reason: 'Subtotal row' }
  }

  const date = parseIbkrDate(get('Date'))
  const amount = parseNumber(get('Amount'))
  const currency = asCurrency(get('Currency'))

  // Pull the symbol — it's the part before the first parenthesis or space.
  const symMatch = description.match(/^([A-Z0-9.]+)/)
  const symbol = symMatch ? normalizeSymbol(symMatch[1]) : ''

  if (!symbol) return { source: 'dividends', raw, txn: null, reason: 'Could not extract symbol' }
  if (!date)   return { source: 'dividends', raw, txn: null, reason: 'Missing date' }
  if (amount <= 0) return { source: 'dividends', raw, txn: null, reason: 'Non-positive amount' }

  return {
    source: 'dividends',
    raw,
    txn: {
      ticker: symbol,
      type: 'dividend',
      date,
      shares: 0,
      price_per_share: 0,
      amount,
      currency,
      fees: 0,
      split_ratio: null,
      notes: description.length > 200 ? description.slice(0, 200) : description,
    },
  }
}

// ── Corporate Actions (splits only) ───────────────────────────────────────
// Typical header:
//   Corporate Actions,Header,Asset Category,Currency,Report Date,Date/Time,
//   Description,Quantity,Proceeds,Value,Realized P/L,Code
function mapCorporateActionRow(headers: string[], cols: string[]): ParsedRow {
  const get = (h: string) => {
    const idx = headers.indexOf(h)
    return idx >= 0 ? cols[idx] : ''
  }
  const raw = cols.join(',')

  const description = get('Description')
  if (!description) return { source: 'corporate_actions', raw, txn: null, reason: 'Empty description' }

  // Detect splits — descriptions look like:
  //   "AAPL(US0378331005) SPLIT 4 for 1 (AAPL, APPLE INC, US0378331005)"
  const splitMatch = description.match(/SPLIT\s+(\d+)\s+for\s+(\d+)/i)
  if (!splitMatch) {
    return { source: 'corporate_actions', raw, txn: null, reason: 'Non-split corporate action' }
  }

  const numerator = parseInt(splitMatch[1], 10)
  const denominator = parseInt(splitMatch[2], 10)
  if (!numerator || !denominator) {
    return { source: 'corporate_actions', raw, txn: null, reason: 'Could not parse split ratio' }
  }
  const ratio = numerator / denominator

  const symMatch = description.match(/^([A-Z0-9.]+)/)
  const symbol = symMatch ? normalizeSymbol(symMatch[1]) : ''
  const date = parseIbkrDate(get('Date/Time') || get('Report Date'))
  const currency = asCurrency(get('Currency'))

  if (!symbol || !date) {
    return { source: 'corporate_actions', raw, txn: null, reason: 'Missing symbol or date' }
  }

  return {
    source: 'corporate_actions',
    raw,
    txn: {
      ticker: symbol,
      type: 'split',
      date,
      shares: 0,
      price_per_share: 0,
      amount: 0,
      currency,
      fees: 0,
      split_ratio: ratio,
      notes: description,
    },
  }
}

// ── Main parser ───────────────────────────────────────────────────────────
export function parseIbkrCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  const rows: ParsedRow[] = []
  const sectionsFound = new Set<string>()
  const meta: ParseResult['meta'] = {}

  // Track headers per section as we encounter them
  const headers: Record<string, string[]> = {}

  for (const line of lines) {
    const cols = splitCsvLine(line)
    if (cols.length < 2) continue
    const section = cols[0]
    const kind = cols[1]
    sectionsFound.add(section)

    if (kind === 'Header') {
      headers[section] = cols
      continue
    }
    if (kind !== 'Data') continue

    const sectionHeaders = headers[section]
    if (!sectionHeaders) continue

    if (section === 'Statement') {
      // Statement,Data,Field Name,Field Value
      const fieldName = cols[2]
      const fieldValue = cols[3]
      if (/^Account$/i.test(fieldName)) meta.accountId = fieldValue
      if (/Period|Date Range/i.test(fieldName)) meta.period = fieldValue
      if (/^Type$/i.test(fieldName)) meta.statementType = fieldValue
    } else if (section === 'Trades') {
      rows.push(mapTradeRow(sectionHeaders, cols))
    } else if (section === 'Dividends') {
      rows.push(mapDividendRow(sectionHeaders, cols))
    } else if (section === 'Corporate Actions') {
      rows.push(mapCorporateActionRow(sectionHeaders, cols))
    }
  }

  return {
    rows,
    meta,
    sectionsFound: Array.from(sectionsFound).sort(),
  }
}

// Generic CSV parser fallback for non-IBKR exports. Expects columns:
// ticker, type, date, shares, price, amount, currency, fees, notes
export function parseGenericCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
  const idx = (name: string) => header.indexOf(name)
  const tickerIdx = idx('ticker')
  const typeIdx = idx('type')
  const dateIdx = idx('date')
  const sharesIdx = idx('shares')
  const priceIdx = idx('price')
  const amountIdx = idx('amount')
  const currencyIdx = idx('currency')
  const feesIdx = idx('fees')
  const notesIdx = idx('notes')

  const out: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    if (cols.length === 0) continue
    const raw = cols.join(',')

    const ticker = (tickerIdx >= 0 ? cols[tickerIdx] : '').toUpperCase().trim()
    const typeStr = (typeIdx >= 0 ? cols[typeIdx] : 'buy').toLowerCase().trim()
    const date = parseIbkrDate(dateIdx >= 0 ? cols[dateIdx] : '') ?? ''
    const shares = sharesIdx >= 0 ? parseNumber(cols[sharesIdx]) : 0
    const price = priceIdx >= 0 ? parseNumber(cols[priceIdx]) : 0
    const amount = amountIdx >= 0 ? parseNumber(cols[amountIdx]) : 0
    const currency = asCurrency(currencyIdx >= 0 ? cols[currencyIdx] : 'USD')
    const fees = feesIdx >= 0 ? parseNumber(cols[feesIdx]) : 0
    const notes = notesIdx >= 0 ? cols[notesIdx] : null

    if (!ticker || !date) {
      out.push({ source: 'trades', raw, txn: null, reason: 'Missing ticker or date' })
      continue
    }

    const validTypes: TransactionType[] = ['buy', 'sell', 'dividend', 'split']
    const type = (validTypes.includes(typeStr as TransactionType) ? typeStr : 'buy') as TransactionType

    out.push({
      source: 'trades',
      raw,
      txn: {
        ticker, type, date, shares, price_per_share: price, amount, currency, fees,
        split_ratio: null, notes,
      },
    })
  }
  return out
}

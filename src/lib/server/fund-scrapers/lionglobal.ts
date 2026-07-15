import type { FundQuote } from '@/types'

// Fetches the daily NAV for a Lion Global Investors unit trust from their
// public fund page, e.g.
//   https://www.lionglobalinvestors.com/en/fund.html?officialNav=SST6
// (SST6 = LionGlobal Singapore Trust Fund Class O SGD). The `ref` is that
// `officialNav` code — copy it from the fund's URL on lionglobalinvestors.com.
//
// This is a best-effort HTML scrape, not an official API — Lion Global
// doesn't publish one. The regexes below are intentionally tolerant (several
// label variants, "as at" date nearby) so small markup changes don't break
// extraction, but a real site redesign can still break this. On failure the
// caller keeps the last known custom_price rather than clearing it.

const FUND_URL = (ref: string) =>
  `https://www.lionglobalinvestors.com/en/fund.html?officialNav=${encodeURIComponent(ref)}`

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// Parses "12 Jul 2026", "12/07/2026", or "12-07-2026" into YYYY-MM-DD.
// Returns null if the shape isn't recognized rather than guessing.
function parseFundDate(raw: string): string | null {
  const monthName = raw.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/)
  if (monthName) {
    const [, day, mon, year] = monthName
    const mm = MONTHS[mon.slice(0, 3).toLowerCase()]
    if (mm) return `${year}-${mm}-${day.padStart(2, '0')}`
  }
  const slash = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (slash) {
    const [, d, m, y] = slash
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

// Pure parsing over an already-fetched HTML string — kept separate from the
// network call so it's directly unit-testable against fixture HTML.
export function parseLionGlobalHtml(html: string, ref: string): FundQuote {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const name = titleMatch
    ? titleMatch[1].replace(/\s*\|\s*Lion Global Investors.*$/i, '').trim()
    : null

  const text = stripHtml(html)

  // Try several label variants, in order of specificity. Each looks for a
  // decimal number within ~40 characters after the label.
  const priceLabels = [
    /NAV\s*(?:per\s*Unit)?[^0-9]{0,40}?([0-9]+\.[0-9]{2,6})/i,
    /(?:Bid|Selling|Offer|Redemption)\s*Price[^0-9]{0,40}?([0-9]+\.[0-9]{2,6})/i,
  ]
  let price: number | null = null
  for (const re of priceLabels) {
    const m = text.match(re)
    if (m) { price = parseFloat(m[1]); break }
  }
  if (price === null || !Number.isFinite(price) || price <= 0) {
    throw new Error(`lionglobal: could not find a NAV price for ${ref}`)
  }

  const dateMatch = text.match(/as\s+at\s+([0-9A-Za-z\/\-\s]{6,20}?)(?:\.|,|\s{2}|$)/i)
  const asOf = dateMatch ? parseFundDate(dateMatch[1]) : null

  return { price, asOf, name }
}

export async function fetchLionGlobalQuote(ref: string): Promise<FundQuote> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  let html: string
  try {
    const res = await fetch(FUND_URL(ref), { headers: BROWSER_HEADERS, signal: controller.signal })
    if (!res.ok) throw new Error(`lionglobal: HTTP ${res.status} fetching ${ref}`)
    html = await res.text()
  } finally {
    clearTimeout(timeout)
  }
  return parseLionGlobalHtml(html, ref)
}

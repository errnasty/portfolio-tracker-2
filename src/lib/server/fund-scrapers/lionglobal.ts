import type { FundQuoteWithCurrency } from './yahoo-fund'

// LionGlobal's fundlist endpoint returns XML (not JSON). Tag values are
// sometimes CDATA-wrapped (eng_lgi, currency) and sometimes bare (nav,
// dealdate). Pull each tag's inner text and strip a CDATA wrapper if present.
function tagText(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  if (!m) return null
  const inner = m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()
  return inner || null
}

export function parseLionGlobalFundlist(xml: string): FundQuoteWithCurrency | null {
  const price = Number(tagText(xml, 'nav'))
  if (!(price > 0)) return null
  return {
    price,
    asOf: tagText(xml, 'dealdate'),
    name: tagText(xml, 'eng_lgi'),
    currency: tagText(xml, 'currency'),
  }
}

const LG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/xml, text/xml, */*',
}

// `ref` is a LionGlobal fund code, e.g. "SST6". Fetches the latest NAV from
// the public fundlist endpoint (returns XML). Signature matches the other
// scrapers so it slots straight into the FUND_PROVIDERS registry.
export async function fetchLionGlobalQuote(ref: string): Promise<FundQuoteWithCurrency> {
  const code = ref.trim().toUpperCase()
  if (!code) throw new Error('LionGlobal: no fund code provided')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const url = `https://api.lionglobalinvestors.com/fundlist?fname=&fcode=${encodeURIComponent(code)}&ftype=&cpage=&ctotal=`
    const res = await fetch(url, { headers: LG_HEADERS, signal: controller.signal })
    if (!res.ok) throw new Error(`LionGlobal: HTTP ${res.status} for "${code}"`)
    const xml = await res.text()
    const quote = parseLionGlobalFundlist(xml)
    if (!quote) throw new Error(`LionGlobal: no NAV for fund code "${code}". Check the code (e.g. SST6) on lionglobalinvestors.com.`)
    return quote
  } finally {
    clearTimeout(timeout)
  }
}

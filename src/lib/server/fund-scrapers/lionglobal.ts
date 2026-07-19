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

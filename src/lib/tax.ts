// Tax helpers focused on Singapore-resident investors. The dominant
// considerations for a typical SG retail portfolio are:
//
//   1. Dividend Withholding Tax (DWT)
//      - SG has no income tax on overseas dividends *received* by individuals,
//        but the source country withholds at its own rate.
//      - US-domiciled funds: 30% DWT (no SG-US tax treaty for individuals).
//      - Irish-domiciled UCITS: 15% DWT on US holdings inside the fund
//        (US-Ireland treaty), then nothing further to SG. Effective ~15%.
//      - SG-listed funds/stocks: 0% (one-tier dividend system).
//      - UK / HK: 0%. Canada: 25%. Japan: 15% (via treaty). Australia: 30%
//        unless franked.
//
//   2. US Estate Tax
//      - US-domiciled assets (stocks, ETFs) held by non-resident aliens are
//        subject to US estate tax above ~$60k. Rates climb to 40%.
//      - Irish-domiciled UCITS are NOT US-situs assets → no US estate tax.
//      - This is a major reason SG investors choose VWRA / CSPX over
//        VT / VOO for long-term holdings.
//
//   3. Capital gains
//      - SG has no capital gains tax for personal investments. No action needed.

export type Domicile = 'US' | 'IE' | 'SG' | 'UK' | 'CA' | 'AU' | 'JP' | 'HK' | 'unknown'

// Known Irish-domiciled UCITS by ticker. Many list across multiple European
// exchanges (.L London, .AS Amsterdam, .DE Xetra, .MI Milan) — the same root
// ticker is a reliable indicator. This list is a starter set focused on
// what SG investors typically hold via IBKR / Saxo.
const IRISH_UCITS_TICKERS = new Set([
  // Vanguard FTSE All-World
  'VWRA', 'VWRD', 'VWRL', 'VWRP', 'VWCE', 'VWRE',
  // iShares Core S&P 500
  'CSPX', 'IUSA', 'CSP1', 'CSSPX',
  // iShares Core MSCI World
  'SWDA', 'IWDA', 'EUNL', 'SWLD',
  // iShares Core MSCI Emerging Markets
  'EIMI', 'IEMG', 'EMIM',
  // Bond UCITS
  'AGGG', 'AGGH', 'AGGU', 'VAGG', 'VAGE', 'VAGS',
  // Other common UCITS held in SG
  'EQQQ', 'QQQ3', // Invesco / iShares NASDAQ 100 UCITS
  'VHYL', 'VHYD', // Vanguard FTSE All-World High Dividend Yield
  'VUSA', 'VUSD', // Vanguard S&P 500 UCITS
  'VUKE', 'VUKG', // Vanguard FTSE 100 UCITS
  'IGLN', 'SGLN', // iShares Physical Gold ETC (UK domiciled but treated similarly for DWT)
])

// Detect a ticker's likely domicile from suffix + known UCITS list.
// This is heuristic — not authoritative — and users can override per-holding.
export function detectDomicile(ticker: string): Domicile {
  const upper = ticker.toUpperCase().trim()
  // Strip any exchange suffix when checking the UCITS list (e.g. "CSPX.L" → "CSPX")
  const root = upper.split('.')[0]
  if (IRISH_UCITS_TICKERS.has(root)) return 'IE'

  if (upper.endsWith('.SI')) return 'SG'
  if (upper.endsWith('.HK')) return 'HK'
  if (upper.endsWith('.T') || upper.endsWith('.TO')) {
    return upper.endsWith('.T') ? 'JP' : 'CA'
  }
  if (upper.endsWith('.V')) return 'CA'
  if (upper.endsWith('.AX') || upper.endsWith('.NZ')) return 'AU'
  // London-listed ETFs are typically Irish UCITS even when not in our list
  if (upper.endsWith('.L')) return 'IE'
  // Other European listings are usually Irish UCITS too for ETFs — but for
  // individual European stocks they're domestic. Without quoteType info we
  // make the cautious assumption that .AS/.PA/.DE/.MI tickers are UCITS
  // (most retail SG portfolios on IBKR use these for UCITS).
  if (upper.endsWith('.AS') || upper.endsWith('.PA') || upper.endsWith('.DE')
      || upper.endsWith('.MI') || upper.endsWith('.SW')) {
    return 'IE'
  }
  // Unsuffixed = likely US-listed
  return 'US'
}

// Dividend withholding tax rate for an SG-resident investor on a fund with
// the given domicile. Returns a fraction (0.30 = 30%).
export function singaporeDwtRate(domicile: Domicile): number {
  switch (domicile) {
    case 'US': return 0.30
    case 'IE': return 0.15  // internal (Ireland-US treaty); fund passes through net
    case 'SG': return 0
    case 'HK': return 0
    case 'UK': return 0
    case 'CA': return 0.25
    case 'AU': return 0.30
    case 'JP': return 0.15
    case 'unknown': return 0.15  // best-guess average
  }
}

// US-situs flag. True = held subject to US estate tax for non-resident SG
// investors. Irish UCITS are explicitly not US-situs even though they hold
// US stocks internally — the fund itself is the asset.
export function isUsSitus(domicile: Domicile): boolean {
  return domicile === 'US'
}

// US estate tax threshold for non-resident aliens (currently US$60,000).
// Above this, the estate is exposed to a tiered rate up to 40%.
export const US_ESTATE_TAX_THRESHOLD_USD = 60_000

export const DOMICILE_LABEL: Record<Domicile, string> = {
  US: 'United States',
  IE: 'Ireland (UCITS)',
  SG: 'Singapore',
  UK: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  JP: 'Japan',
  HK: 'Hong Kong',
  unknown: 'Unknown',
}

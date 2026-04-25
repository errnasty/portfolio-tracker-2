// Curated ETF country/region composition data.
// Weights are approximate (late-2024/2025 fact sheets) and sum to ~1.
// Used for look-through portfolio analytics — multiplied by the ETF's
// weight in the user's portfolio so each underlying country / region
// gets credited proportionally.

export type CountryWeights = Record<string, number>
export type SectorWeights = Record<string, number>

interface EtfComposition {
  countries: CountryWeights
  sectors?: SectorWeights
  // Optional human-readable summary, used in tooltips.
  description?: string
}

// Common sector profiles — sums to ~1
const SECTORS_SP500: SectorWeights = {
  Technology: 0.30, 'Financial Services': 0.13, Healthcare: 0.12,
  'Consumer Cyclical': 0.10, 'Communication Services': 0.09, Industrials: 0.08,
  'Consumer Defensive': 0.06, Energy: 0.04, 'Real Estate': 0.025,
  Utilities: 0.025, 'Basic Materials': 0.02,
}
const SECTORS_NASDAQ: SectorWeights = {
  Technology: 0.50, 'Communication Services': 0.16, 'Consumer Cyclical': 0.14,
  Healthcare: 0.07, 'Consumer Defensive': 0.06, Industrials: 0.05,
  Utilities: 0.01, 'Financial Services': 0.01,
}
const SECTORS_WORLD: SectorWeights = {
  Technology: 0.25, 'Financial Services': 0.15, Healthcare: 0.11,
  'Consumer Cyclical': 0.11, Industrials: 0.11, 'Communication Services': 0.07,
  'Consumer Defensive': 0.06, Energy: 0.04, 'Basic Materials': 0.04,
  Utilities: 0.03, 'Real Estate': 0.03,
}
const SECTORS_EUROPE: SectorWeights = {
  'Financial Services': 0.18, Industrials: 0.16, Healthcare: 0.15,
  'Consumer Cyclical': 0.11, 'Consumer Defensive': 0.10, Technology: 0.08,
  'Basic Materials': 0.07, 'Communication Services': 0.05, Utilities: 0.05,
  Energy: 0.04, 'Real Estate': 0.01,
}
const SECTORS_EM: SectorWeights = {
  Technology: 0.23, 'Financial Services': 0.22, 'Consumer Cyclical': 0.13,
  'Communication Services': 0.09, Industrials: 0.07, 'Basic Materials': 0.07,
  Energy: 0.05, 'Consumer Defensive': 0.05, Healthcare: 0.04,
  Utilities: 0.03, 'Real Estate': 0.02,
}
const SECTORS_REIT: SectorWeights = { 'Real Estate': 1 }
const SECTORS_DEV_EX_US: SectorWeights = {
  'Financial Services': 0.18, Industrials: 0.16, Healthcare: 0.12,
  'Consumer Cyclical': 0.12, 'Basic Materials': 0.08, Technology: 0.09,
  'Consumer Defensive': 0.09, 'Communication Services': 0.05, Energy: 0.05,
  Utilities: 0.04, 'Real Estate': 0.02,
}

// Helper to express the same composition under multiple ticker aliases
// (e.g. London / Amsterdam / NYSE listings of the same ETF).
function alias<T>(map: T, ...keys: string[]): Record<string, T> {
  const out: Record<string, T> = {}
  for (const k of keys) out[k.toUpperCase()] = map
  return out
}

const US_ONLY: EtfComposition = {
  countries: { 'United States': 1 },
  sectors: SECTORS_SP500,
  description: 'Tracks US equities only',
}
const NASDAQ_US: EtfComposition = {
  countries: { 'United States': 1 },
  sectors: SECTORS_NASDAQ,
}

const SG_ONLY: EtfComposition = {
  countries: { Singapore: 1 },
  sectors: {
    'Financial Services': 0.45, Industrials: 0.18, 'Real Estate': 0.13,
    'Communication Services': 0.08, 'Consumer Cyclical': 0.06,
    Utilities: 0.04, 'Consumer Defensive': 0.03, Other: 0.03,
  },
}

// Vanguard FTSE All-World (VWRL/VWRA/VT/VWRD)
const FTSE_ALL_WORLD: EtfComposition = {
  countries: {
    'United States': 0.62,
    Japan: 0.055,
    'United Kingdom': 0.04,
    China: 0.03,
    Canada: 0.03,
    France: 0.03,
    Switzerland: 0.025,
    India: 0.02,
    Germany: 0.02,
    Australia: 0.02,
    Taiwan: 0.02,
    Netherlands: 0.012,
    'South Korea': 0.012,
    Other: 0.061,
  },
  sectors: SECTORS_WORLD,
  description: 'FTSE All-World — global developed + emerging',
}

// MSCI World (developed markets)
const MSCI_WORLD: EtfComposition = {
  countries: {
    'United States': 0.70,
    Japan: 0.06,
    'United Kingdom': 0.04,
    Canada: 0.03,
    France: 0.03,
    Switzerland: 0.03,
    Germany: 0.025,
    Australia: 0.02,
    Netherlands: 0.013,
    Other: 0.062,
  },
  sectors: SECTORS_WORLD,
  description: 'MSCI World — developed markets',
}

// Developed ex-US
const DEVELOPED_EX_US: EtfComposition = {
  countries: {
    Japan: 0.22,
    'United Kingdom': 0.13,
    France: 0.10,
    Canada: 0.09,
    Switzerland: 0.09,
    Germany: 0.08,
    Australia: 0.07,
    Netherlands: 0.04,
    Sweden: 0.03,
    Other: 0.15,
  },
  sectors: SECTORS_DEV_EX_US,
}

// Emerging Markets
const EMERGING_MARKETS: EtfComposition = {
  countries: {
    China: 0.28,
    India: 0.20,
    Taiwan: 0.19,
    'South Korea': 0.12,
    Brazil: 0.05,
    'Saudi Arabia': 0.04,
    'South Africa': 0.03,
    Mexico: 0.02,
    Other: 0.07,
  },
  sectors: SECTORS_EM,
}

const EUROPE: EtfComposition = {
  countries: {
    'United Kingdom': 0.24,
    France: 0.18,
    Switzerland: 0.16,
    Germany: 0.15,
    Netherlands: 0.07,
    Sweden: 0.05,
    Spain: 0.04,
    Italy: 0.04,
    Denmark: 0.03,
    Other: 0.04,
  },
  sectors: SECTORS_EUROPE,
}

const ASIA_EX_JAPAN: EtfComposition = {
  countries: {
    China: 0.32,
    Taiwan: 0.20,
    India: 0.18,
    'South Korea': 0.13,
    'Hong Kong': 0.05,
    Singapore: 0.04,
    Other: 0.08,
  },
  sectors: SECTORS_EM,
}

const ASIA_REIT: EtfComposition = {
  countries: {
    Singapore: 0.70,
    'Hong Kong': 0.15,
    Australia: 0.08,
    Other: 0.07,
  },
  sectors: SECTORS_REIT,
  description: 'Asia ex-Japan REITs (Singapore-heavy)',
}

const HIGH_DIV_WORLD: EtfComposition = {
  countries: {
    'United States': 0.40,
    'United Kingdom': 0.08,
    Japan: 0.07,
    Switzerland: 0.05,
    Canada: 0.04,
    France: 0.04,
    Australia: 0.03,
    Germany: 0.03,
    Other: 0.26,
  },
  sectors: SECTORS_WORLD,
}

const CHINA: EtfComposition = { countries: { China: 1 }, sectors: SECTORS_EM }
const INDIA: EtfComposition = { countries: { India: 1 }, sectors: SECTORS_EM }
const JAPAN: EtfComposition = { countries: { Japan: 1 }, sectors: SECTORS_DEV_EX_US }
const UK: EtfComposition = { countries: { 'United Kingdom': 1 }, sectors: SECTORS_EUROPE }

export const ETF_COMPOSITIONS: Record<string, EtfComposition> = {
  // S&P 500 / total US
  ...alias(US_ONLY, 'SPY', 'IVV', 'VOO', 'VTI', 'ITOT', 'SPLG', 'VUSA.L', 'VUSA.AS', 'VUSD.L', 'CSPX.L', 'CSPX.AS', 'SXR8.DE', 'IUSA.L'),
  // Nasdaq
  ...alias(NASDAQ_US, 'QQQ', 'QQQM', 'CNDX.L', 'EQQQ.L'),
  // FTSE All-World
  ...alias(FTSE_ALL_WORLD, 'VT', 'VWRL.L', 'VWRL.AS', 'VWRA.L', 'VWRD.L', 'VWRP.L', 'FWRA.L'),
  // MSCI World
  ...alias(MSCI_WORLD, 'URTH', 'IWDA.L', 'IWDA.AS', 'SWDA.L', 'SWDA.MI', 'EUNL.DE', 'XDWD.DE', 'XDWD.L'),
  // Developed ex-US
  ...alias(DEVELOPED_EX_US, 'VEA', 'VXUS', 'IEFA', 'EFA', 'VEU', 'IXUS'),
  // Emerging markets
  ...alias(EMERGING_MARKETS, 'VWO', 'IEMG', 'EEM', 'EIMI.L', 'EIMI.AS', 'EMIM.L', 'VFEM.L', 'VWOC.L'),
  // Europe
  ...alias(EUROPE, 'VGK', 'IEUR', 'IEUS', 'VEUR.L', 'VEUR.AS', 'IMEU.L'),
  // Asia ex-Japan
  ...alias(ASIA_EX_JAPAN, 'AAXJ', 'IAEX.L', 'CPXJ.L'),
  // Asia REITs
  ...alias(ASIA_REIT, 'GSD.SI', 'CFA.SI'),
  // High dividend world
  ...alias(HIGH_DIV_WORLD, 'VHYL.L', 'VHYL.AS', 'VYM'),
  // Country specific
  ...alias(CHINA, 'MCHI', 'FXI', 'KWEB', 'CSI300.L'),
  ...alias(INDIA, 'INDA', 'INDY', 'NDIA.L'),
  ...alias(JAPAN, 'EWJ', 'DXJ', 'JPN.L'),
  ...alias(UK, 'EWU', 'ISF.L', 'VUKE.L'),
  // Singapore (STI / SG-only)
  ...alias(SG_ONLY, 'EWS', 'ES3.SI', 'G3B.SI', 'CLR.SI', 'SPY.SI'),
}

export function getEtfComposition(ticker: string): EtfComposition | undefined {
  return ETF_COMPOSITIONS[ticker.toUpperCase()]
}

// Map a country to its primary trading currency — used to derive
// underlying currency exposure for ETFs by look-through.
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  'United States': 'USD',
  Canada: 'CAD',
  'United Kingdom': 'GBP',
  France: 'EUR',
  Germany: 'EUR',
  Netherlands: 'EUR',
  Spain: 'EUR',
  Italy: 'EUR',
  Belgium: 'EUR',
  Ireland: 'EUR',
  Finland: 'EUR',
  Austria: 'EUR',
  Portugal: 'EUR',
  Switzerland: 'CHF',
  Sweden: 'SEK',
  Denmark: 'DKK',
  Norway: 'NOK',
  Japan: 'JPY',
  China: 'CNY',
  'Hong Kong': 'HKD',
  Taiwan: 'TWD',
  'South Korea': 'KRW',
  India: 'INR',
  Singapore: 'SGD',
  Australia: 'AUD',
  'New Zealand': 'NZD',
  Brazil: 'BRL',
  Mexico: 'MXN',
  'South Africa': 'ZAR',
  'Saudi Arabia': 'SAR',
  Indonesia: 'IDR',
  Thailand: 'THB',
  Malaysia: 'MYR',
  Philippines: 'PHP',
  Vietnam: 'VND',
  Turkey: 'TRY',
  Poland: 'PLN',
  Israel: 'ILS',
  UAE: 'AED',
  Other: 'USD',
}

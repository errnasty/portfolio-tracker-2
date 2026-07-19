import type { FundProviderMeta } from '@/types'

// Shared by every physical-metal provider — same weight units, same
// conversion (see src/lib/server/fund-scrapers/precious-metals.ts).
const WEIGHT_UNIT_OPTIONS = [
  { value: 'gram', label: 'Gram (g)' },
  { value: 'oz_troy', label: 'Troy ounce (oz t)' },
  { value: 'tael', label: 'Tael — HK/SG gold-market standard, ≈37.429 g' },
  { value: 'kg', label: 'Kilogram (kg)' },
]

function metalProvider(id: string, label: string): FundProviderMeta {
  return {
    id,
    label: `Live ${label} spot price (physical ${label.toLowerCase()})`,
    helpText: `Tracks the live global ${label.toLowerCase()} spot price, converted to whichever weight unit you hold. Dealers usually charge a premium over spot — after fetching, feel free to edit the price to match your dealer's buyback quote exactly.`,
    nativeCurrency: 'USD',
    refOptions: WEIGHT_UNIT_OPTIONS,
  }
}

// Client-safe metadata for fund-price providers (labels/help text only — the
// actual fetch implementations are server-only, see
// src/lib/server/fund-scrapers). Used by the holdings dialog to populate the
// provider picker without bundling scraper/fetch code into the client.
export const FUND_PROVIDER_LIST: FundProviderMeta[] = [
  {
    id: 'sgfund',
    label: 'Unit trust / mutual fund (auto, via Yahoo Finance)',
    helpText: 'Many unit trusts are on Yahoo Finance under a Morningstar code like "0P00006G00.SI" — search your fund at finance.yahoo.com and copy the code from the URL. IMPORTANT: each share class has its own code and price (an Accumulation class and a monthly-distribution "MDist" class of the same fund differ — e.g. 0P00006G00.SI is ~6.86 while LionGlobal Singapore Trust Class O SGD MDist is ~1.05). Test-fetch and confirm the price matches your statement before saving. If your exact class isn\'t on Yahoo (common for MDist classes), use "Manual price" instead.',
  },
  {
    id: 'lionglobal',
    label: 'LionGlobal unit trust (auto, by fund code)',
    helpText: 'Enter your LionGlobal fund code exactly as it appears on your statement — e.g. "SST6" for LionGlobal Singapore Trust Class O SGD (MDist). The NAV is pulled straight from LionGlobal daily, so MDist classes that aren\'t on Yahoo Finance still auto-price. Test-fetch and confirm the price matches your statement before saving.',
  },
  metalProvider('gold', 'Gold'),
  metalProvider('silver', 'Silver'),
  metalProvider('platinum', 'Platinum'),
  metalProvider('palladium', 'Palladium'),
]

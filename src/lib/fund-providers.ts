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
    id: 'lionglobal',
    label: 'Lion Global Investors',
    helpText: 'Paste the fund code from the end of its lionglobalinvestors.com URL, e.g. "SST6" for LionGlobal Singapore Trust Fund Class O SGD (?officialNav=SST6).',
  },
  metalProvider('gold', 'Gold'),
  metalProvider('silver', 'Silver'),
  metalProvider('platinum', 'Platinum'),
  metalProvider('palladium', 'Palladium'),
]

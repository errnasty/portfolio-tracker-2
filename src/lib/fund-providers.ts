import type { FundProviderMeta } from '@/types'

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
]

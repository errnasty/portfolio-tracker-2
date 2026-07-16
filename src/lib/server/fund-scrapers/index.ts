import type { FundProviderMeta, FundQuote } from '@/types'
import { FUND_PROVIDER_LIST } from '@/lib/fund-providers'
import { fetchYahooFundQuote } from './yahoo-fund'
import { fetchGoldQuote, fetchSilverQuote, fetchPlatinumQuote, fetchPalladiumQuote } from './precious-metals'

export interface FundProvider extends FundProviderMeta {
  fetchQuote(ref: string): Promise<FundQuote>
}

const IMPLS: Record<string, FundProvider['fetchQuote']> = {
  sgfund: fetchYahooFundQuote,
  // Back-compat: an early build shipped a 'lionglobal' provider that scraped
  // the fund house's site (never worked — JS-rendered NAV). Map it to the
  // Yahoo fetcher so any holding saved with that id still refreshes.
  lionglobal: fetchYahooFundQuote,
  gold: fetchGoldQuote,
  silver: fetchSilverQuote,
  platinum: fetchPlatinumQuote,
  palladium: fetchPalladiumQuote,
}

// Registry of fund houses we can auto-refresh a NAV for. Each holding with
// price_source='custom' can optionally set price_provider to one of these
// ids + price_provider_ref (a provider-specific fund code) to keep its price
// current automatically (daily cron + manual "Refresh" button) instead of
// requiring the user to type in a new NAV by hand. Server-only (does live
// network fetches) — the client uses src/lib/fund-providers.ts for metadata.
export const FUND_PROVIDERS: Record<string, FundProvider> = Object.fromEntries(
  FUND_PROVIDER_LIST.map((meta) => [meta.id, { ...meta, fetchQuote: IMPLS[meta.id] }]),
)

// Back-compat: expose IMPLS-only provider ids (e.g. the deprecated
// 'lionglobal') that aren't in the user-facing list, so stored holdings
// referencing them can still be refreshed.
for (const [id, fetchQuote] of Object.entries(IMPLS)) {
  if (!FUND_PROVIDERS[id]) {
    FUND_PROVIDERS[id] = { id, label: id, helpText: '', fetchQuote }
  }
}

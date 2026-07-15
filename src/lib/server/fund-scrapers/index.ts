import type { FundProviderMeta, FundQuote } from '@/types'
import { FUND_PROVIDER_LIST } from '@/lib/fund-providers'
import { fetchLionGlobalQuote } from './lionglobal'
import { fetchGoldQuote, fetchSilverQuote, fetchPlatinumQuote, fetchPalladiumQuote } from './precious-metals'

export interface FundProvider extends FundProviderMeta {
  fetchQuote(ref: string): Promise<FundQuote>
}

const IMPLS: Record<string, FundProvider['fetchQuote']> = {
  lionglobal: fetchLionGlobalQuote,
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

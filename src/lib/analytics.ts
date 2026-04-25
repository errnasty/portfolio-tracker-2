import type { EnrichedHolding } from '@/types'
import type { TickerAnalytics } from '@/app/api/analytics/route'

export interface BreakdownSlice {
  label: string
  value: number // base currency value
  pct: number // 0..100
}

// ── Region inference from ticker suffix / ETF category ───────────────────
// Used as a fallback when summaryProfile.country is missing (e.g. ETFs).
const SUFFIX_REGION: Record<string, string> = {
  SI: 'Singapore',
  HK: 'Hong Kong',
  T: 'Japan',
  TO: 'Canada',
  V: 'Canada',
  L: 'United Kingdom',
  AS: 'Netherlands',
  PA: 'France',
  DE: 'Germany',
  F: 'Germany',
  MI: 'Italy',
  MC: 'Spain',
  SW: 'Switzerland',
  ST: 'Sweden',
  HE: 'Finland',
  CO: 'Denmark',
  OL: 'Norway',
  AX: 'Australia',
  NZ: 'New Zealand',
  KS: 'South Korea',
  KQ: 'South Korea',
  TW: 'Taiwan',
  BO: 'India',
  NS: 'India',
  SS: 'China',
  SZ: 'China',
}

function regionFromSuffix(ticker: string): string | undefined {
  const idx = ticker.lastIndexOf('.')
  if (idx === -1) return 'United States' // default for no-suffix tickers
  const suffix = ticker.slice(idx + 1).toUpperCase()
  return SUFFIX_REGION[suffix]
}

// Best-effort region from ETF category name
function regionFromCategory(category?: string): string | undefined {
  if (!category) return undefined
  const c = category.toLowerCase()
  if (c.includes('global') || c.includes('world')) return 'Global'
  if (c.includes('emerging')) return 'Emerging Markets'
  if (c.includes('europe')) return 'Europe'
  if (c.includes('china')) return 'China'
  if (c.includes('japan')) return 'Japan'
  if (c.includes('india')) return 'India'
  if (c.includes('asia')) return 'Asia'
  if (c.includes('singapore')) return 'Singapore'
  if (c.includes('uk') || c.includes('united kingdom')) return 'United Kingdom'
  if (c.includes('us ') || c.includes('u.s.') || c.startsWith('us') || c.includes('america') || c.includes('s&p') || c.includes('nasdaq'))
    return 'United States'
  return undefined
}

function pctOfTotal(slices: { label: string; value: number }[]): BreakdownSlice[] {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total <= 0) return []
  return slices
    .map((s) => ({ ...s, pct: (s.value / total) * 100 }))
    .sort((a, b) => b.value - a.value)
}

function aggregate(map: Map<string, number>): BreakdownSlice[] {
  const arr = Array.from(map.entries()).map(([label, value]) => ({ label, value }))
  return pctOfTotal(arr)
}

export function geographicBreakdown(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
): BreakdownSlice[] {
  const map = new Map<string, number>()
  for (const h of enriched) {
    const a = analytics[h.ticker]
    let region: string | undefined
    if (a?.quoteType === 'EQUITY' && a.country) {
      region = a.country
    } else if (a?.quoteType === 'ETF' || a?.quoteType === 'MUTUALFUND') {
      region = regionFromCategory(a.category) ?? regionFromSuffix(h.ticker)
    } else {
      region = regionFromSuffix(h.ticker)
    }
    region = region ?? 'Unknown'
    map.set(region, (map.get(region) ?? 0) + h.currentValueBase)
  }
  return aggregate(map)
}

export function sectorBreakdown(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
): BreakdownSlice[] {
  const map = new Map<string, number>()
  for (const h of enriched) {
    const a = analytics[h.ticker]
    if (a?.quoteType === 'EQUITY' && a.sector) {
      map.set(a.sector, (map.get(a.sector) ?? 0) + h.currentValueBase)
    } else if (a?.sectorWeightings && Object.keys(a.sectorWeightings).length > 0) {
      // Distribute the holding's value across the ETF's sector weightings
      for (const [sector, weight] of Object.entries(a.sectorWeightings)) {
        const label = humanizeSector(sector)
        map.set(label, (map.get(label) ?? 0) + h.currentValueBase * weight)
      }
    } else {
      map.set('Unclassified', (map.get('Unclassified') ?? 0) + h.currentValueBase)
    }
  }
  return aggregate(map)
}

function humanizeSector(s: string): string {
  // Yahoo returns keys like "realestate", "consumer_cyclical"
  const map: Record<string, string> = {
    realestate: 'Real Estate',
    consumer_cyclical: 'Consumer Cyclical',
    consumer_defensive: 'Consumer Defensive',
    basic_materials: 'Basic Materials',
    communication_services: 'Communication Services',
    financial_services: 'Financial Services',
    healthcare: 'Healthcare',
    technology: 'Technology',
    industrials: 'Industrials',
    energy: 'Energy',
    utilities: 'Utilities',
  }
  return map[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function currencyBreakdown(enriched: EnrichedHolding[]): BreakdownSlice[] {
  const map = new Map<string, number>()
  for (const h of enriched) {
    const cur = (h.priceCurrency || 'USD').toUpperCase()
    map.set(cur, (map.get(cur) ?? 0) + h.currentValueBase)
  }
  return aggregate(map)
}

export function assetTypeBreakdown(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
): BreakdownSlice[] {
  const map = new Map<string, number>()
  for (const h of enriched) {
    const t = analytics[h.ticker]?.quoteType ?? 'UNKNOWN'
    const label =
      t === 'EQUITY' ? 'Stock'
        : t === 'ETF' ? 'ETF'
          : t === 'MUTUALFUND' ? 'Mutual Fund'
            : t === 'INDEX' ? 'Index'
              : 'Other'
    map.set(label, (map.get(label) ?? 0) + h.currentValueBase)
  }
  return aggregate(map)
}

export interface ConcentrationMetrics {
  hhi: number // 0..10000 (sum of pct² where pct in 0..100)
  effectiveHoldings: number // 1 / Σpᵢ² where pᵢ is fraction
  top5Pct: number
  top10Pct: number
  largestPct: number
}

export function concentrationMetrics(enriched: EnrichedHolding[]): ConcentrationMetrics {
  if (enriched.length === 0) {
    return { hhi: 0, effectiveHoldings: 0, top5Pct: 0, top10Pct: 0, largestPct: 0 }
  }
  const total = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  if (total <= 0) return { hhi: 0, effectiveHoldings: 0, top5Pct: 0, top10Pct: 0, largestPct: 0 }

  const fractions = enriched
    .map((h) => h.currentValueBase / total)
    .sort((a, b) => b - a)

  const sumSq = fractions.reduce((s, f) => s + f * f, 0)
  const hhi = sumSq * 10000
  const effective = sumSq > 0 ? 1 / sumSq : 0
  const top5 = fractions.slice(0, 5).reduce((s, f) => s + f, 0) * 100
  const top10 = fractions.slice(0, 10).reduce((s, f) => s + f, 0) * 100
  const largest = (fractions[0] ?? 0) * 100

  return {
    hhi,
    effectiveHoldings: effective,
    top5Pct: top5,
    top10Pct: top10,
    largestPct: largest,
  }
}

export function topHoldingsList(enriched: EnrichedHolding[], n = 10) {
  return [...enriched]
    .sort((a, b) => b.currentValueBase - a.currentValueBase)
    .slice(0, n)
}

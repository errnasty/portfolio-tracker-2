import type { EnrichedHolding } from '@/types'
import type { TickerAnalytics } from '@/app/api/analytics/route'
import { getEtfComposition, COUNTRY_TO_CURRENCY } from '@/lib/etf-composition'

export interface BreakdownSlice {
  label: string
  value: number // base currency value
  pct: number // 0..100
}

// ── Region inference fallback (only used when no curated data) ────────────
const SUFFIX_REGION: Record<string, string> = {
  SI: 'Singapore', HK: 'Hong Kong', T: 'Japan', TO: 'Canada', V: 'Canada',
  L: 'United Kingdom', AS: 'Netherlands', PA: 'France', DE: 'Germany',
  F: 'Germany', MI: 'Italy', MC: 'Spain', SW: 'Switzerland', ST: 'Sweden',
  HE: 'Finland', CO: 'Denmark', OL: 'Norway', AX: 'Australia', NZ: 'New Zealand',
  KS: 'South Korea', KQ: 'South Korea', TW: 'Taiwan', BO: 'India', NS: 'India',
  SS: 'China', SZ: 'China',
}

function regionFromSuffix(ticker: string): string {
  const idx = ticker.lastIndexOf('.')
  if (idx === -1) return 'United States'
  const suffix = ticker.slice(idx + 1).toUpperCase()
  return SUFFIX_REGION[suffix] ?? 'Unknown'
}

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

function aggregate(map: Map<string, number>): BreakdownSlice[] {
  const total = Array.from(map.values()).reduce((s, v) => s + v, 0)
  if (total <= 0) return []
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value, pct: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value)
}

function isFund(quoteType?: string): boolean {
  return quoteType === 'ETF' || quoteType === 'MUTUALFUND'
}

// ── Geographic breakdown (LOOK-THROUGH) ───────────────────────────────────
// For each ETF holding, distribute its market value across the underlying
// countries using the curated composition map. Stocks contribute their full
// value to their country of origin.
export function geographicBreakdown(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
): BreakdownSlice[] {
  const map = new Map<string, number>()
  const add = (country: string, v: number) => {
    if (v <= 0) return
    map.set(country, (map.get(country) ?? 0) + v)
  }

  for (const h of enriched) {
    const a = analytics[h.ticker]
    const value = h.currentValueBase

    if (a?.quoteType === 'EQUITY') {
      add(a.country ?? regionFromSuffix(h.ticker), value)
      continue
    }

    if (isFund(a?.quoteType) || !a) {
      // Try curated look-through composition first
      const comp = getEtfComposition(h.ticker)
      if (comp) {
        for (const [country, weight] of Object.entries(comp.countries)) {
          add(country, value * weight)
        }
        continue
      }
      // Fall back to category-derived region or suffix
      const region = regionFromCategory(a?.category) ?? regionFromSuffix(h.ticker)
      add(region ?? 'Unknown', value)
      continue
    }

    add('Unknown', value)
  }
  return aggregate(map)
}

// ── Sector breakdown (LOOK-THROUGH) ───────────────────────────────────────
// Stocks contribute to a single sector. ETFs use Yahoo's sectorWeightings,
// distributed proportionally across the holding's value.
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

// ── Currency exposure (LOOK-THROUGH) ──────────────────────────────────────
// Stocks contribute their value to their trading currency. ETFs are
// decomposed into underlying countries (via curated composition) and each
// country mapped to its primary currency.
export function currencyBreakdown(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
): BreakdownSlice[] {
  const map = new Map<string, number>()
  const add = (cur: string, v: number) => {
    if (v <= 0) return
    map.set(cur, (map.get(cur) ?? 0) + v)
  }

  for (const h of enriched) {
    const a = analytics[h.ticker]
    const value = h.currentValueBase

    if (isFund(a?.quoteType)) {
      const comp = getEtfComposition(h.ticker)
      if (comp) {
        for (const [country, weight] of Object.entries(comp.countries)) {
          const cur = COUNTRY_TO_CURRENCY[country] ?? 'USD'
          add(cur, value * weight)
        }
        continue
      }
    }
    // Stocks (and ETFs without curated data) — use trading currency
    const cur = (h.priceCurrency || 'USD').toUpperCase()
    add(cur, value)
  }
  return aggregate(map)
}

// ── Asset type breakdown (NOT look-through — structural view) ─────────────
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

// ── Look-through stock concentration ──────────────────────────────────────
// Aggregates underlying single-stock exposures across all holdings:
//  - direct stocks contribute their full value
//  - ETFs contribute their top-N holdings × ETF weight in portfolio
// Note: ETF top-holdings from Yahoo cover the largest 10 (~30-50% of fund),
// so the "Coverage" % shown indicates how much of the portfolio is mapped.
export interface LookThroughStock {
  symbol: string
  name: string
  value: number
  pct: number // % of total portfolio
  sources: { ticker: string; weight: number }[] // which holdings contributed
}

export function lookThroughStocks(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
): { stocks: LookThroughStock[]; coveragePct: number; totalValue: number } {
  const total = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  const map = new Map<string, LookThroughStock>()
  let mapped = 0

  const add = (symbol: string, name: string, value: number, src: { ticker: string; weight: number }) => {
    if (value <= 0 || !symbol) return
    const key = symbol.toUpperCase()
    const existing = map.get(key)
    if (existing) {
      existing.value += value
      existing.sources.push(src)
    } else {
      map.set(key, { symbol: key, name: name || key, value, pct: 0, sources: [src] })
    }
    mapped += value
  }

  for (const h of enriched) {
    const a = analytics[h.ticker]
    if (a?.quoteType === 'EQUITY') {
      add(h.ticker, h.name ?? a.longName ?? h.ticker, h.currentValueBase, { ticker: h.ticker, weight: 1 })
    } else if (isFund(a?.quoteType) && a?.topHoldings && a.topHoldings.length > 0) {
      for (const th of a.topHoldings) {
        add(th.symbol || th.name, th.name, h.currentValueBase * th.weight, {
          ticker: h.ticker,
          weight: th.weight,
        })
      }
    }
  }

  const stocks = Array.from(map.values())
    .map((s) => ({ ...s, pct: total > 0 ? (s.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)

  return {
    stocks,
    coveragePct: total > 0 ? (mapped / total) * 100 : 0,
    totalValue: total,
  }
}

// ── Concentration metrics ─────────────────────────────────────────────────
export interface ConcentrationMetrics {
  hhi: number
  effectiveHoldings: number
  top5Pct: number
  top10Pct: number
  largestPct: number
}

export function concentrationMetrics(enriched: EnrichedHolding[]): ConcentrationMetrics {
  if (enriched.length === 0) return { hhi: 0, effectiveHoldings: 0, top5Pct: 0, top10Pct: 0, largestPct: 0 }
  const total = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  if (total <= 0) return { hhi: 0, effectiveHoldings: 0, top5Pct: 0, top10Pct: 0, largestPct: 0 }

  const fractions = enriched.map((h) => h.currentValueBase / total).sort((a, b) => b - a)
  const sumSq = fractions.reduce((s, f) => s + f * f, 0)
  return {
    hhi: sumSq * 10000,
    effectiveHoldings: sumSq > 0 ? 1 / sumSq : 0,
    top5Pct: fractions.slice(0, 5).reduce((s, f) => s + f, 0) * 100,
    top10Pct: fractions.slice(0, 10).reduce((s, f) => s + f, 0) * 100,
    largestPct: (fractions[0] ?? 0) * 100,
  }
}

export function topHoldingsList(enriched: EnrichedHolding[], n = 10) {
  return [...enriched].sort((a, b) => b.currentValueBase - a.currentValueBase).slice(0, n)
}

import type { EnrichedHolding } from '@/types'
import type { TickerAnalytics } from '@/app/api/analytics/route'
import { countryToCurrency } from '@/lib/etf-composition'

export interface BreakdownSlice {
  label: string
  value: number
  pct: number
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
// Uses the API-derived `countries` map (1.0-summing dict). For ETFs this is
// derived from each fund's top holdings + their countries. For stocks it's
// just { country: 1 }.
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
    if (a?.countries && Object.keys(a.countries).length > 0) {
      for (const [country, weight] of Object.entries(a.countries)) {
        add(country, value * weight)
      }
    } else {
      add('Unknown', value)
    }
  }
  return aggregate(map)
}

// ── Sector breakdown (LOOK-THROUGH) ───────────────────────────────────────
// Uses Yahoo's sectorWeightings for ETFs (look-through) and the equity's
// `sector` for stocks.
export function sectorBreakdown(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
): BreakdownSlice[] {
  const map = new Map<string, number>()
  const add = (sector: string, v: number) => {
    if (v <= 0) return
    map.set(sector, (map.get(sector) ?? 0) + v)
  }

  for (const h of enriched) {
    const a = analytics[h.ticker]
    const value = h.currentValueBase

    if (a?.sectorWeightings && Object.keys(a.sectorWeightings).length > 0) {
      for (const [sector, weight] of Object.entries(a.sectorWeightings)) {
        add(humanizeSector(sector), value * weight)
      }
      continue
    }
    if (a?.quoteType === 'EQUITY' && a.sector) {
      add(a.sector, value)
      continue
    }
    add('Unclassified', value)
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
// Uses the country composition mapped through to each country's primary
// currency — so a EUR-listed all-world ETF correctly shows as mostly USD.
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
    if (a?.countries && Object.keys(a.countries).length > 0) {
      for (const [country, weight] of Object.entries(a.countries)) {
        add(countryToCurrency(country), value * weight)
      }
    } else {
      add((h.priceCurrency || 'USD').toUpperCase(), value)
    }
  }
  return aggregate(map)
}

// ── Asset type breakdown (structural, not look-through) ───────────────────
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
              : t === 'CRYPTOCURRENCY' ? 'Crypto'
                // Custom-priced holdings (e.g. Singapore unit trusts) aren't
                // on Yahoo, so there's no quoteType to classify them by.
                : h.price_source === 'custom' ? 'Fund'
                  : 'Other'
    map.set(label, (map.get(label) ?? 0) + h.currentValueBase)
  }
  return aggregate(map)
}

// ── Look-through stock concentration ──────────────────────────────────────
export interface LookThroughStock {
  symbol: string
  name: string
  value: number
  pct: number
  sources: { ticker: string; weight: number }[]
}

export function lookThroughStocks(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
): { stocks: LookThroughStock[]; coveragePct: number; totalValue: number } {
  const total = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  const map = new Map<string, LookThroughStock>()
  let mapped = 0

  const add = (
    symbol: string,
    name: string,
    value: number,
    src: { ticker: string; weight: number },
  ) => {
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
    if (isFund(a?.quoteType) && a?.topHoldings && a.topHoldings.length > 0) {
      for (const th of a.topHoldings) {
        add(th.symbol || th.name, th.name, h.currentValueBase * th.weight, {
          ticker: h.ticker,
          weight: th.weight,
        })
      }
    } else if (a?.quoteType === 'EQUITY') {
      add(h.ticker, h.name ?? a.longName ?? h.ticker, h.currentValueBase, {
        ticker: h.ticker,
        weight: 1,
      })
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

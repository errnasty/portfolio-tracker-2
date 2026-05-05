import { describe, it, expect } from 'vitest'
import {
  generateSuggestions,
  DEFAULT_PREFERENCES,
  type SuggestionPreferences,
} from '../suggestions'
import type { EnrichedHolding, Currency } from '@/types'
import type { TickerAnalytics } from '@/app/api/analytics/route'

// Test helpers ──────────────────────────────────────────────────────────────
let idCounter = 0
function holding(partial: Partial<EnrichedHolding>): EnrichedHolding {
  idCounter += 1
  const value = partial.currentValueBase ?? 1000
  return {
    id: `h${idCounter}`,
    user_id: 'u1',
    ticker: partial.ticker ?? 'AAPL',
    name: partial.name ?? null,
    shares: partial.shares ?? 1,
    cost_basis_per_share: partial.cost_basis_per_share ?? 100,
    cost_basis_currency: (partial.cost_basis_currency ?? 'USD') as Currency,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    currentPrice: partial.currentPrice ?? 100,
    priceCurrency: partial.priceCurrency ?? 'USD',
    currentValueBase: value,
    costBasisBase: partial.costBasisBase ?? value * 0.9,
    gainLoss: partial.gainLoss ?? value * 0.1,
    gainLossPct: partial.gainLossPct ?? 10,
    dayChange: partial.dayChange ?? 0,
    dayChangePct: partial.dayChangePct ?? 0,
    allocationPct: partial.allocationPct ?? 0,
  }
}

function withAllocation(holdings: EnrichedHolding[]): EnrichedHolding[] {
  const total = holdings.reduce((s, h) => s + h.currentValueBase, 0)
  return holdings.map((h) => ({
    ...h,
    allocationPct: total > 0 ? (h.currentValueBase / total) * 100 : 0,
  }))
}

function analytics(map: Record<string, Partial<TickerAnalytics>>): Record<string, TickerAnalytics> {
  const out: Record<string, TickerAnalytics> = {}
  for (const [ticker, partial] of Object.entries(map)) {
    out[ticker] = {
      ticker,
      quoteType: partial.quoteType ?? 'EQUITY',
      ...partial,
    } as TickerAnalytics
  }
  return out
}

const PREFS: SuggestionPreferences = { ...DEFAULT_PREFERENCES }

// ── Tests ─────────────────────────────────────────────────────────────────
describe('generateSuggestions — empty portfolio', () => {
  it('returns empty result when no holdings', () => {
    const result = generateSuggestions([], {}, 'USD', PREFS)
    expect(result.suggestions).toHaveLength(0)
    expect(result.score).toBe(0)
    expect(result.scoreLabel).toBe('No data')
  })
})

describe('generateSuggestions — concentration rules', () => {
  it('flags single-position concentration above the cap', () => {
    const holdings = withAllocation([
      holding({ ticker: 'AAPL', currentValueBase: 8000 }),  // 80%
      holding({ ticker: 'MSFT', currentValueBase: 1000 }),
      holding({ ticker: 'GOOGL', currentValueBase: 1000 }),
    ])
    const result = generateSuggestions(holdings, {}, 'USD', PREFS)
    const conc = result.suggestions.find((s) => s.id === 'conc-single')
    expect(conc).toBeDefined()
    expect(conc?.severity).toBe('critical') // 80% > 2× cap (10%)
    expect(conc?.actions[0].apply).toMatchObject({
      kind: 'set',
      ticker: 'AAPL',
      pct: PREFS.maxSinglePositionPct,
    })
  })

  it('does not flag concentration when under the cap', () => {
    const n = 15
    const holdings = withAllocation(
      Array.from({ length: n }, (_, i) => holding({
        ticker: `T${i}`,
        currentValueBase: 1000,
      })),
    )
    const result = generateSuggestions(holdings, {}, 'USD', PREFS)
    expect(result.suggestions.find((s) => s.id === 'conc-single')).toBeUndefined()
    // Should produce a positive concentration suggestion instead
    const positive = result.suggestions.find((s) => s.id === 'conc-good')
    expect(positive?.severity).toBe('positive')
  })

  it('flags HHI > 2500 as concentrated', () => {
    const holdings = withAllocation([
      holding({ ticker: 'A', currentValueBase: 6000 }),  // 60%
      holding({ ticker: 'B', currentValueBase: 4000 }),  // 40%
    ])
    const result = generateSuggestions(holdings, {}, 'USD', PREFS)
    const hhi = result.suggestions.find((s) => s.id === 'conc-hhi')
    expect(hhi).toBeDefined()
    expect(['warning', 'critical']).toContain(hhi?.severity)
  })
})

describe('generateSuggestions — holdings count rules', () => {
  it('flags too few holdings as critical at <= 2', () => {
    const holdings = withAllocation([
      holding({ ticker: 'A', currentValueBase: 5000 }),
      holding({ ticker: 'B', currentValueBase: 5000 }),
    ])
    const result = generateSuggestions(holdings, {}, 'USD', PREFS)
    const count = result.suggestions.find((s) => s.id === 'count-low')
    expect(count?.severity).toBe('critical')
  })

  it('flags too many holdings as info', () => {
    const holdings = withAllocation(
      Array.from({ length: 30 }, (_, i) => holding({
        ticker: `T${i}`, currentValueBase: 1000,
      })),
    )
    const result = generateSuggestions(holdings, {}, 'USD', PREFS)
    const count = result.suggestions.find((s) => s.id === 'count-high')
    expect(count?.severity).toBe('info')
  })
})

describe('generateSuggestions — geographic rules', () => {
  it('flags single-country dominance', () => {
    const holdings = withAllocation([
      holding({ ticker: 'VTI', currentValueBase: 9500 }),
      holding({ ticker: 'VEA', currentValueBase: 500 }),
    ])
    const a = analytics({
      VTI: { quoteType: 'ETF', countries: { 'United States': 1.0 } },
      VEA: { quoteType: 'ETF', countries: { Japan: 0.5, 'United Kingdom': 0.5 } },
    })
    const result = generateSuggestions(holdings, a, 'USD', PREFS)
    const geo = result.suggestions.find((s) => s.id === 'geo-single')
    expect(geo).toBeDefined()
    expect(geo?.summary.toLowerCase()).toContain('united states')
  })

  it('flags missing emerging markets when home bias is global', () => {
    const holdings = withAllocation([
      holding({ ticker: 'VTI', currentValueBase: 5000 }),
      holding({ ticker: 'VEA', currentValueBase: 5000 }),
    ])
    const a = analytics({
      VTI: { quoteType: 'ETF', countries: { 'United States': 1.0 } },
      VEA: { quoteType: 'ETF', countries: { Japan: 0.5, 'United Kingdom': 0.5 } },
    })
    const result = generateSuggestions(holdings, a, 'USD', PREFS)
    const em = result.suggestions.find((s) => s.id === 'geo-em-missing')
    expect(em).toBeDefined()
    expect(em?.severity).toBe('info')
  })

  it('skips EM rule when home bias is set to a region', () => {
    const holdings = withAllocation([
      holding({ ticker: 'VTI', currentValueBase: 5000 }),
      holding({ ticker: 'VEA', currentValueBase: 5000 }),
    ])
    const a = analytics({
      VTI: { quoteType: 'ETF', countries: { 'United States': 1.0 } },
      VEA: { quoteType: 'ETF', countries: { Japan: 1.0 } },
    })
    const result = generateSuggestions(
      holdings, a, 'USD',
      { ...PREFS, homeBias: 'us' },
    )
    expect(result.suggestions.find((s) => s.id === 'geo-em-missing')).toBeUndefined()
  })

  it('flags US bias gap when below threshold', () => {
    const holdings = withAllocation([
      holding({ ticker: 'VEA', currentValueBase: 7000 }),
      holding({ ticker: 'VTI', currentValueBase: 3000 }),
    ])
    const a = analytics({
      VEA: { quoteType: 'ETF', countries: { Japan: 1.0 } },
      VTI: { quoteType: 'ETF', countries: { 'United States': 1.0 } },
    })
    const result = generateSuggestions(
      holdings, a, 'USD',
      { ...PREFS, homeBias: 'us' },
    )
    expect(result.suggestions.find((s) => s.id === 'geo-us-bias')).toBeDefined()
  })
})

describe('generateSuggestions — sector rules', () => {
  it('flags sector concentration', () => {
    const holdings = withAllocation([
      holding({ ticker: 'XLK', currentValueBase: 7000 }),
      holding({ ticker: 'XLV', currentValueBase: 1500 }),
      holding({ ticker: 'XLF', currentValueBase: 1500 }),
    ])
    const a = analytics({
      XLK: { quoteType: 'ETF', sectorWeightings: { technology: 1.0 } },
      XLV: { quoteType: 'ETF', sectorWeightings: { healthcare: 1.0 } },
      XLF: { quoteType: 'ETF', sectorWeightings: { financial_services: 1.0 } },
    })
    const result = generateSuggestions(holdings, a, 'USD', PREFS)
    const sec = result.suggestions.find((s) => s.id === 'sec-single')
    expect(sec).toBeDefined()
    expect(sec?.summary.toLowerCase()).toContain('technology')
  })

  it('flags low defensive allocation when conservative', () => {
    const holdings = withAllocation([
      holding({ ticker: 'QQQ', currentValueBase: 10000 }),
    ])
    const a = analytics({
      QQQ: { quoteType: 'ETF', sectorWeightings: { technology: 0.6, communication_services: 0.4 } },
    })
    const result = generateSuggestions(
      holdings, a, 'USD',
      { ...PREFS, riskProfile: 'conservative' },
    )
    expect(result.suggestions.find((s) => s.id === 'sec-defensive')).toBeDefined()
  })
})

describe('generateSuggestions — currency rules', () => {
  it('flags base-currency mismatch when most exposure is foreign', () => {
    const holdings = withAllocation([
      holding({ ticker: 'VTI', currentValueBase: 9500, priceCurrency: 'USD' }),
      holding({ ticker: 'D05.SI', currentValueBase: 500, priceCurrency: 'SGD' }),
    ])
    const a = analytics({
      VTI: { quoteType: 'ETF', countries: { 'United States': 1.0 } },
      'D05.SI': { quoteType: 'EQUITY', country: 'Singapore', countries: { Singapore: 1.0 } },
    })
    const result = generateSuggestions(holdings, a, 'SGD', PREFS)
    const cur = result.suggestions.find((s) => s.id === 'cur-base-mismatch')
    expect(cur).toBeDefined()
    expect(cur?.summary).toContain('SGD')
  })
})

describe('generateSuggestions — focus areas filter', () => {
  it('only returns suggestions in active focus areas', () => {
    const holdings = withAllocation([
      holding({ ticker: 'AAPL', currentValueBase: 8000 }),
      holding({ ticker: 'MSFT', currentValueBase: 1000 }),
      holding({ ticker: 'GOOGL', currentValueBase: 1000 }),
    ])
    const result = generateSuggestions(
      holdings, {}, 'USD',
      { ...PREFS, focusAreas: ['holdings_count'] },
    )
    expect(result.suggestions.every((s) => s.category === 'holdings_count')).toBe(true)
    // Score is computed from ALL suggestions, not just filtered
    expect(result.counts.critical + result.counts.warning).toBeGreaterThan(0)
  })
})

describe('generateSuggestions — score', () => {
  it('a healthy diversified portfolio scores higher than a concentrated one', () => {
    const concentrated = withAllocation([
      holding({ ticker: 'AAPL', currentValueBase: 9000 }),
      holding({ ticker: 'MSFT', currentValueBase: 1000 }),
    ])
    const concResult = generateSuggestions(concentrated, {}, 'USD', PREFS)

    const diversified = withAllocation(
      Array.from({ length: 12 }, (_, i) => holding({
        ticker: `T${i}`, currentValueBase: 1000,
      })),
    )
    const divResult = generateSuggestions(diversified, {}, 'USD', PREFS)

    expect(divResult.score).toBeGreaterThan(concResult.score)
  })

  it('score is bounded to [0, 100]', () => {
    const holdings = withAllocation(Array.from({ length: 30 }, (_, i) => holding({
      ticker: `T${i}`, currentValueBase: 1000,
    })))
    const result = generateSuggestions(holdings, {}, 'USD', PREFS)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})

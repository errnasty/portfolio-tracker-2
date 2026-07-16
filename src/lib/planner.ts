import type { Currency, EnrichedHolding, FxRates, PriceQuote } from '@/types'
import type { BreakdownSlice } from '@/lib/analytics'
import type { ConcentrationMetrics } from '@/lib/analytics'
import { convertToBase } from '@/lib/calculations'

export interface PlannedPosition {
  id: string
  ticker: string
  name: string
  pct: number
}

export interface ComparisonRow {
  label: string
  currentPct: number
  plannedPct: number
  currentValue: number
  plannedValue: number
  deltaPct: number
}

export interface ConcentrationDelta {
  label: string
  current: number
  planned: number
  delta: number
  format: (v: number) => string
}

// Convert planner positions into objects shaped like EnrichedHolding so the
// existing analytics functions (geo / sector / currency / look-through /
// concentration) work without modification.
export function buildPlannerEnriched(
  positions: PlannedPosition[],
  totalValueBase: number,
  prices: Record<string, PriceQuote>,
  fxRates: FxRates | null,
  baseCurrency: Currency,
): EnrichedHolding[] {
  if (totalValueBase <= 0) return []
  return positions
    .filter((p) => p.ticker.trim() && p.pct > 0)
    .map((p) => {
      const quote = prices[p.ticker]
      const currentPrice = quote?.price ?? 0
      const priceCurrency = quote?.currency ?? baseCurrency
      const valueBase = (totalValueBase * p.pct) / 100

      // Implied share count, if we know the price. Inverse of convertToBase.
      let shares = 0
      if (currentPrice > 0 && fxRates) {
        const valueInPriceCurrency =
          priceCurrency === fxRates.base
            ? valueBase
            : valueBase * (fxRates.rates[priceCurrency] ?? 1)
        shares = valueInPriceCurrency / currentPrice
      }

      return {
        id: `planned-${p.id}`,
        user_id: '',
        ticker: p.ticker.toUpperCase().trim(),
        name: p.name || null,
        shares,
        cost_basis_per_share: 0,
        cost_basis_currency: baseCurrency,
        price_source: 'auto',
        custom_price: null,
        custom_price_asof: null,
        price_provider: null,
        price_provider_ref: null,
        locked_until: null,
        created_at: '',
        updated_at: '',
        currentPrice,
        priceCurrency,
        currentValueBase: valueBase,
        costBasisBase: 0,
        gainLoss: 0,
        gainLossPct: 0,
        dayChange: 0,
        dayChangePct: 0,
        allocationPct: p.pct,
      }
    })
}

export function compareBreakdowns(
  current: BreakdownSlice[],
  planned: BreakdownSlice[],
): ComparisonRow[] {
  const map = new Map<string, ComparisonRow>()
  for (const s of current) {
    map.set(s.label, {
      label: s.label,
      currentPct: s.pct,
      plannedPct: 0,
      currentValue: s.value,
      plannedValue: 0,
      deltaPct: -s.pct,
    })
  }
  for (const s of planned) {
    const row = map.get(s.label)
    if (row) {
      row.plannedPct = s.pct
      row.plannedValue = s.value
      row.deltaPct = s.pct - row.currentPct
    } else {
      map.set(s.label, {
        label: s.label,
        currentPct: 0,
        plannedPct: s.pct,
        currentValue: 0,
        plannedValue: s.value,
        deltaPct: s.pct,
      })
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => Math.max(b.currentPct, b.plannedPct) - Math.max(a.currentPct, a.plannedPct),
  )
}

export function compareConcentration(
  current: ConcentrationMetrics,
  planned: ConcentrationMetrics,
): ConcentrationDelta[] {
  const pct = (v: number) => `${v.toFixed(1)}%`
  const num = (v: number) => v.toFixed(1)
  const int = (v: number) => v.toFixed(0)
  return [
    { label: 'Largest position', current: current.largestPct, planned: planned.largestPct, delta: planned.largestPct - current.largestPct, format: pct },
    { label: 'Top 5 holdings', current: current.top5Pct, planned: planned.top5Pct, delta: planned.top5Pct - current.top5Pct, format: pct },
    { label: 'Top 10 holdings', current: current.top10Pct, planned: planned.top10Pct, delta: planned.top10Pct - current.top10Pct, format: pct },
    { label: 'Effective holdings', current: current.effectiveHoldings, planned: planned.effectiveHoldings, delta: planned.effectiveHoldings - current.effectiveHoldings, format: num },
    { label: 'HHI', current: current.hhi, planned: planned.hhi, delta: planned.hhi - current.hhi, format: int },
  ]
}

// Suggest a default total value: existing portfolio value if non-zero,
// otherwise a sensible round number per base currency.
export function defaultPlannerTotalValue(
  existingTotal: number,
  baseCurrency: Currency,
): number {
  if (existingTotal > 0) return Math.round(existingTotal)
  if (baseCurrency === 'SGD') return 100_000
  if (baseCurrency === 'EUR') return 50_000
  return 100_000
}

// Auto-normalize: scale all positions so they sum to 100. If everything is 0,
// distribute equally.
export function normalizeAllocations(positions: PlannedPosition[]): PlannedPosition[] {
  const total = positions.reduce((s, p) => s + (p.pct || 0), 0)
  if (positions.length === 0) return positions
  if (total === 0) {
    const each = 100 / positions.length
    return positions.map((p) => ({ ...p, pct: parseFloat(each.toFixed(2)) }))
  }
  return positions.map((p) => ({
    ...p,
    pct: parseFloat(((p.pct / total) * 100).toFixed(2)),
  }))
}

// Used by the editor to compute the implied amount in base currency for a
// position given the total portfolio value.
export function impliedAmount(pct: number, totalValue: number): number {
  return (pct / 100) * totalValue
}

// Inverse: given an amount, return what % it represents.
export function impliedPct(amount: number, totalValue: number): number {
  if (totalValue <= 0) return 0
  return (amount / totalValue) * 100
}

// Re-export for type-only consumers
export type { PriceQuote, FxRates }
export { convertToBase }

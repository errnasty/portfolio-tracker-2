import type { Holding, PriceQuote, FxRates, EnrichedHolding, PortfolioStats, Currency, RebalanceRecommendation, TargetAllocation } from '@/types'

export function convertToBase(amount: number, fromCurrency: string, fxRates: FxRates): number {
  if (fromCurrency === fxRates.base) return amount
  const rate = fxRates.rates[fromCurrency]
  if (!rate) return amount
  // rates are base→target, so to convert fromCurrency→base: divide by rate
  return amount / rate
}

export function enrichHoldings(
  holdings: Holding[],
  prices: Record<string, PriceQuote>,
  fxRates: FxRates,
): EnrichedHolding[] {
  const totalPortfolioValue = holdings.reduce((sum, h) => {
    const quote = prices[h.ticker]
    if (!quote) return sum
    const valueInPrice = h.shares * quote.price
    return sum + convertToBase(valueInPrice, quote.currency, fxRates)
  }, 0)

  return holdings.map((h) => {
    const quote = prices[h.ticker]
    const currentPrice = quote?.price ?? 0
    const priceCurrency = quote?.currency ?? h.cost_basis_currency

    const currentValueInPriceCurrency = h.shares * currentPrice
    const currentValueBase = convertToBase(currentValueInPriceCurrency, priceCurrency, fxRates)

    const costBasisTotal = h.shares * h.cost_basis_per_share
    const costBasisBase = convertToBase(costBasisTotal, h.cost_basis_currency, fxRates)

    const gainLoss = currentValueBase - costBasisBase
    const gainLossPct = costBasisBase > 0 ? (gainLoss / costBasisBase) * 100 : 0

    const dayChange = quote ? convertToBase(h.shares * (quote.change ?? 0), priceCurrency, fxRates) : 0
    const dayChangePct = quote?.changePercent ?? 0

    const allocationPct = totalPortfolioValue > 0 ? (currentValueBase / totalPortfolioValue) * 100 : 0

    return {
      ...h,
      currentPrice,
      priceCurrency,
      currentValueBase,
      costBasisBase,
      gainLoss,
      gainLossPct,
      dayChange,
      dayChangePct,
      allocationPct,
    }
  })
}

export function calcPortfolioStats(
  enriched: EnrichedHolding[],
  baseCurrency: Currency,
  cashValueBase = 0,
): PortfolioStats {
  const holdingsValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  const totalValue = holdingsValue + cashValueBase
  const totalCost = enriched.reduce((s, h) => s + h.costBasisBase, 0)
  const totalGainLoss = holdingsValue - totalCost
  const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0
  const totalDayChange = enriched.reduce((s, h) => s + h.dayChange, 0)
  const totalDayChangePct = holdingsValue > 0
    ? (totalDayChange / (holdingsValue - totalDayChange)) * 100
    : 0

  return {
    totalValue, holdingsValue, cashValue: cashValueBase,
    totalCost, totalGainLoss, totalGainLossPct,
    totalDayChange, totalDayChangePct, baseCurrency,
  }
}

export type RebalanceMode = 'full' | 'buy-only'

export interface RebalanceResult {
  recommendations: RebalanceRecommendation[]
  // Buy-only specific: cash that couldn't be deployed because all underweight
  // gaps were filled and adding more would push overweight positions further
  // out of band. Zero for 'full' mode.
  unallocatedCash: number
  totalBuy: number
  totalSell: number
}

export function calcRebalance(
  enriched: EnrichedHolding[],
  targets: TargetAllocation[],
  newCash: number,
  prices: Record<string, PriceQuote>,
  fxRates: FxRates,
  mode: RebalanceMode = 'full',
): RebalanceResult {
  const totalCurrentValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  const totalTarget = totalCurrentValue + newCash
  const currentMap = new Map(enriched.map((h) => [h.ticker, h]))

  // First pass: compute target dollar values + raw gaps
  const rows = targets.map((t) => {
    const holding = currentMap.get(t.ticker)
    const currentValue = holding?.currentValueBase ?? 0
    const targetValue = (t.target_pct / 100) * totalTarget
    const fullDelta = targetValue - currentValue
    const currentPct = totalCurrentValue > 0 ? (currentValue / totalCurrentValue) * 100 : 0
    const quote = prices[t.ticker]
    const priceBase = quote ? convertToBase(quote.price, quote.currency, fxRates) : 0
    return {
      target: t,
      holding,
      currentValue,
      targetValue,
      fullDelta,
      currentPct,
      priceBase,
    }
  })

  let recommendations: RebalanceRecommendation[]
  let unallocatedCash = 0

  if (mode === 'buy-only') {
    // Allocate `newCash` only to underweight positions, proportional to their
    // shortfall. Overweight positions get hold (no sell). If we have more cash
    // than the total underweight gap, leftover is reported as unallocated —
    // depositing it into already-overweight names would make drift worse.
    const underweight = rows.filter((r) => r.fullDelta > 0)
    const totalGap = underweight.reduce((s, r) => s + r.fullDelta, 0)

    let remaining = newCash
    const buys = new Map<string, number>()

    if (totalGap > 0 && newCash > 0) {
      if (newCash >= totalGap) {
        // Fill every gap exactly; remainder cannot be deployed without
        // pushing already-overweight positions further out of band.
        for (const r of underweight) buys.set(r.target.ticker, r.fullDelta)
        remaining = newCash - totalGap
      } else {
        // Pro-rata: each underweight position gets cash × (its gap / total gap)
        for (const r of underweight) {
          buys.set(r.target.ticker, newCash * (r.fullDelta / totalGap))
        }
        remaining = 0
      }
    }
    unallocatedCash = remaining

    recommendations = rows.map((r) => {
      const delta = buys.get(r.target.ticker) ?? 0
      const sharesToTrade = r.priceBase > 0 ? delta / r.priceBase : 0
      const action: 'buy' | 'sell' | 'hold' =
        delta > 0.005 ? 'buy' : 'hold'
      return {
        ticker: r.target.ticker,
        name: r.holding?.name ?? r.target.ticker,
        currentValue: r.currentValue,
        targetValue: r.targetValue,
        currentPct: r.currentPct,
        targetPct: r.target.target_pct,
        delta,
        sharesToTrade,
        action,
        currentPrice: r.priceBase,
      }
    })
  } else {
    // Full rebalance — original behavior. May recommend selling overweight
    // positions to fund underweight ones.
    recommendations = rows.map((r) => {
      const sharesToTrade = r.priceBase > 0 ? r.fullDelta / r.priceBase : 0
      const action: 'buy' | 'sell' | 'hold' =
        Math.abs(sharesToTrade) < 0.001 ? 'hold' : sharesToTrade > 0 ? 'buy' : 'sell'
      return {
        ticker: r.target.ticker,
        name: r.holding?.name ?? r.target.ticker,
        currentValue: r.currentValue,
        targetValue: r.targetValue,
        currentPct: r.currentPct,
        targetPct: r.target.target_pct,
        delta: r.fullDelta,
        sharesToTrade,
        action,
        currentPrice: r.priceBase,
      }
    })
  }

  const totalBuy = recommendations.filter((r) => r.action === 'buy').reduce((s, r) => s + r.delta, 0)
  const totalSell = recommendations.filter((r) => r.action === 'sell').reduce((s, r) => s + Math.abs(r.delta), 0)

  return { recommendations, unallocatedCash, totalBuy, totalSell }
}

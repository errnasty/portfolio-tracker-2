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

export function calcPortfolioStats(enriched: EnrichedHolding[], baseCurrency: Currency): PortfolioStats {
  const totalValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  const totalCost = enriched.reduce((s, h) => s + h.costBasisBase, 0)
  const totalGainLoss = totalValue - totalCost
  const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0
  const totalDayChange = enriched.reduce((s, h) => s + h.dayChange, 0)
  const totalDayChangePct = totalValue > 0 ? (totalDayChange / (totalValue - totalDayChange)) * 100 : 0

  return { totalValue, totalCost, totalGainLoss, totalGainLossPct, totalDayChange, totalDayChangePct, baseCurrency }
}

export function calcRebalance(
  enriched: EnrichedHolding[],
  targets: TargetAllocation[],
  newCash: number,
  prices: Record<string, PriceQuote>,
  fxRates: FxRates,
): RebalanceRecommendation[] {
  const totalCurrentValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  const totalTarget = totalCurrentValue + newCash

  // Build a map of current values by ticker
  const currentMap = new Map(enriched.map((h) => [h.ticker, h]))

  return targets.map((t) => {
    const holding = currentMap.get(t.ticker)
    const currentValue = holding?.currentValueBase ?? 0
    const targetValue = (t.target_pct / 100) * totalTarget
    const delta = targetValue - currentValue
    const currentPct = totalCurrentValue > 0 ? (currentValue / totalCurrentValue) * 100 : 0

    const quote = prices[t.ticker]
    const priceBase = quote ? convertToBase(quote.price, quote.currency, fxRates) : 0
    const sharesToTrade = priceBase > 0 ? delta / priceBase : 0

    const action: 'buy' | 'sell' | 'hold' =
      Math.abs(sharesToTrade) < 0.001 ? 'hold' : sharesToTrade > 0 ? 'buy' : 'sell'

    return {
      ticker: t.ticker,
      name: holding?.name ?? t.ticker,
      currentValue,
      targetValue,
      currentPct,
      targetPct: t.target_pct,
      delta,
      sharesToTrade,
      action,
      currentPrice: priceBase,
    }
  })
}

import type { Currency, DerivedPosition, Transaction } from '@/types'

// Derive a current position from a transaction log.
// Cost basis uses weighted-average (the default at most retail brokers).
// Splits scale shares; total cost stays constant. Sells use the running
// avg cost basis to compute realized gain.
export function derivePosition(ticker: string, txns: Transaction[]): DerivedPosition {
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date))

  let shares = 0
  let totalCost = 0
  let realizedGain = 0
  let totalDividends = 0
  let costCurrency: Currency | string = 'USD'
  let buyCount = 0
  let sellCount = 0
  let firstBuyDate: string | null = null
  let lastTransactionDate: string | null = null

  for (const t of sorted) {
    lastTransactionDate = t.date
    switch (t.type) {
      case 'buy': {
        const cost = t.shares * t.price_per_share + t.fees
        totalCost += cost
        shares += t.shares
        costCurrency = t.currency
        buyCount += 1
        if (!firstBuyDate) firstBuyDate = t.date
        break
      }
      case 'sell': {
        const avgCost = shares > 0 ? totalCost / shares : 0
        const sellShares = Math.min(t.shares, shares)
        const proceeds = sellShares * t.price_per_share - t.fees
        const costRemoved = avgCost * sellShares
        realizedGain += proceeds - costRemoved
        shares -= sellShares
        totalCost = Math.max(0, totalCost - costRemoved)
        sellCount += 1
        break
      }
      case 'split': {
        const ratio = t.split_ratio ?? 1
        if (ratio > 0) shares *= ratio
        break
      }
      case 'dividend': {
        // amount is the cash received in the transaction's currency
        totalDividends += t.amount
        break
      }
    }
  }

  return {
    ticker,
    shares: roundShares(shares),
    totalCost: round2(totalCost),
    avgCostBasis: shares > 0 ? round4(totalCost / shares) : 0,
    realizedGain: round2(realizedGain),
    totalDividends: round2(totalDividends),
    costCurrency,
    buyCount,
    sellCount,
    firstBuyDate,
    lastTransactionDate,
  }
}

// Group transactions by ticker and derive each position.
export function deriveAllPositions(txns: Transaction[]): Record<string, DerivedPosition> {
  const byTicker = new Map<string, Transaction[]>()
  for (const t of txns) {
    const key = t.ticker.toUpperCase()
    const arr = byTicker.get(key)
    if (arr) arr.push(t)
    else byTicker.set(key, [t])
  }
  const out: Record<string, DerivedPosition> = {}
  byTicker.forEach((list, ticker) => {
    out[ticker] = derivePosition(ticker, list)
  })
  return out
}

// Total realized gains across all tickers (in their respective currencies —
// caller should convert to base via fxRates).
export function totalRealizedGains(positions: Record<string, DerivedPosition>): number {
  return Object.values(positions).reduce((s, p) => s + p.realizedGain, 0)
}

export function totalDividendsReceived(positions: Record<string, DerivedPosition>): number {
  return Object.values(positions).reduce((s, p) => s + p.totalDividends, 0)
}

// Time-weighted return — partial implementation: takes daily portfolio
// values and treats new contributions/withdrawals as zero-impact (chains
// daily returns ignoring cashflow). For a fuller implementation we'd need
// per-day cashflow tagging. Useful for performance page.
export function timeWeightedReturn(dailyValues: { date: string; value: number }[]): number {
  if (dailyValues.length < 2) return 0
  const sorted = [...dailyValues].sort((a, b) => a.date.localeCompare(b.date))
  let r = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].value
    const curr = sorted[i].value
    if (prev > 0) r *= curr / prev
  }
  return (r - 1) * 100
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function round4(n: number): number { return Math.round(n * 10000) / 10000 }
function roundShares(n: number): number { return Math.round(n * 1e8) / 1e8 }

// Apply scenario shocks to a portfolio. Each holding is decomposed into
// a weighted mix of "asset class buckets" via geographic + asset-type
// look-through, and each bucket gets shocked by a percentage. The portfolio
// impact is the value-weighted sum of bucket impacts per holding.

import type { EnrichedHolding } from '@/types'
import type { TickerAnalytics } from '@/app/api/analytics/route'

export type ShockBucket =
  | 'us_equity'
  | 'developed_ex_us_equity'
  | 'em_equity'
  | 'sg_equity'
  | 'bond'
  | 'gold'
  | 'commodity'
  | 'crypto'
  | 'cash'

// Each bucket's shock is expressed as a fraction (-0.20 = -20%).
export type ScenarioShocks = Partial<Record<ShockBucket, number>>

export interface Scenario {
  id: string
  name: string
  description: string
  shocks: ScenarioShocks
}

// Curated historical scenarios. Numbers are peak-to-trough drawdowns
// during the named episode for the dominant index in each bucket.
// Sources: standard reference data (S&P 500, MSCI EAFE, MSCI EM, AGG, GLD).
export const PRESET_SCENARIOS: Scenario[] = [
  {
    id: '2008-gfc',
    name: '2008 Global Financial Crisis',
    description: 'Lehman collapse, credit freeze, Oct 2007–Mar 2009. Severe across all equity, mild rally in bonds and gold.',
    shocks: {
      us_equity: -0.55,
      developed_ex_us_equity: -0.55,
      em_equity: -0.62,
      sg_equity: -0.55,
      bond: 0.05,
      gold: 0.05,
      commodity: -0.40,
      crypto: 0,
      cash: 0,
    },
  },
  {
    id: '2020-covid',
    name: '2020 COVID Crash',
    description: 'Feb–Mar 2020. Sharp 5-week drawdown across all risk assets, then a fast recovery.',
    shocks: {
      us_equity: -0.34,
      developed_ex_us_equity: -0.32,
      em_equity: -0.31,
      sg_equity: -0.30,
      bond: -0.05,
      gold: 0.10,
      commodity: -0.45,
      crypto: -0.50,
      cash: 0,
    },
  },
  {
    id: '2022-inflation',
    name: '2022 Inflation / rate-hike',
    description: 'Full-year 2022. Stocks AND bonds fell as the Fed hiked aggressively. Worst year for 60/40 in decades.',
    shocks: {
      us_equity: -0.19,
      developed_ex_us_equity: -0.16,
      em_equity: -0.20,
      sg_equity: -0.05,
      bond: -0.13,
      gold: 0,
      commodity: 0.16,
      crypto: -0.65,
      cash: 0,
    },
  },
  {
    id: 'dotcom',
    name: 'Dot-com bust 2000–2002',
    description: 'Tech-heavy drawdown, 30+ months. Value held up; bonds rallied.',
    shocks: {
      us_equity: -0.49,
      developed_ex_us_equity: -0.45,
      em_equity: -0.47,
      sg_equity: -0.40,
      bond: 0.20,
      gold: 0.15,
      commodity: 0.10,
      crypto: 0,
      cash: 0,
    },
  },
  {
    id: 'china-crisis',
    name: 'China-specific crisis',
    description: 'Sharp re-rating of Chinese assets; spillover to EM but limited to developed markets.',
    shocks: {
      us_equity: -0.05,
      developed_ex_us_equity: -0.08,
      em_equity: -0.30,
      sg_equity: -0.15,
      bond: 0.02,
      gold: 0.05,
      commodity: -0.10,
      crypto: -0.10,
      cash: 0,
    },
  },
  {
    id: 'mild-correction',
    name: 'Mild correction (-10%)',
    description: 'A standard stock-market correction without recession; bonds stable.',
    shocks: {
      us_equity: -0.10,
      developed_ex_us_equity: -0.10,
      em_equity: -0.12,
      sg_equity: -0.08,
      bond: 0.01,
      gold: 0.03,
      commodity: -0.05,
      crypto: -0.20,
      cash: 0,
    },
  },
]

// Country → bucket mapping (for equity holdings). Uses geographic look-through.
const COUNTRY_TO_REGION: Record<string, ShockBucket> = {
  'United States': 'us_equity',
  Singapore: 'sg_equity',
  // Developed-ex-US
  Japan: 'developed_ex_us_equity',
  'United Kingdom': 'developed_ex_us_equity',
  France: 'developed_ex_us_equity',
  Germany: 'developed_ex_us_equity',
  Netherlands: 'developed_ex_us_equity',
  Switzerland: 'developed_ex_us_equity',
  Canada: 'developed_ex_us_equity',
  Australia: 'developed_ex_us_equity',
  'New Zealand': 'developed_ex_us_equity',
  Sweden: 'developed_ex_us_equity',
  Denmark: 'developed_ex_us_equity',
  Norway: 'developed_ex_us_equity',
  Finland: 'developed_ex_us_equity',
  Ireland: 'developed_ex_us_equity',
  Spain: 'developed_ex_us_equity',
  Italy: 'developed_ex_us_equity',
  Belgium: 'developed_ex_us_equity',
  Portugal: 'developed_ex_us_equity',
  Austria: 'developed_ex_us_equity',
  'Hong Kong': 'developed_ex_us_equity',
  // Emerging markets
  China: 'em_equity',
  India: 'em_equity',
  Taiwan: 'em_equity',
  'South Korea': 'em_equity',
  Brazil: 'em_equity',
  Mexico: 'em_equity',
  'South Africa': 'em_equity',
  Indonesia: 'em_equity',
  Thailand: 'em_equity',
  Malaysia: 'em_equity',
  Philippines: 'em_equity',
  Vietnam: 'em_equity',
  Turkey: 'em_equity',
  Poland: 'em_equity',
  'Saudi Arabia': 'em_equity',
  // Region fallbacks
  'Emerging Markets': 'em_equity',
  Europe: 'developed_ex_us_equity',
  Asia: 'developed_ex_us_equity',
  Global: 'us_equity', // Global ETFs are typically ~60% US-weighted
}

// Detect if a ticker / fund is bond / gold / crypto / commodity by name.
const BOND_KEYWORDS = /bond|aggregate|treasur|fixed.income|corporate|t-bond|tlt|agg|bnd|govt|gilts/i
const GOLD_KEYWORDS = /\bgold\b|gld|iau|sgol|gldm/i
const COMMODITY_KEYWORDS = /commodit|oil|crude|wti|natgas|silver|platinum|copper|dba|dbc|gsg/i
const CRYPTO_KEYWORDS = /bitcoin|ethereum|btc|eth|crypto|coinbase/i

function classifyByName(ticker: string, analytics?: TickerAnalytics): ShockBucket | null {
  const name = `${ticker} ${analytics?.longName ?? ''} ${analytics?.category ?? ''}`
  if (BOND_KEYWORDS.test(name)) return 'bond'
  if (GOLD_KEYWORDS.test(name)) return 'gold'
  if (COMMODITY_KEYWORDS.test(name)) return 'commodity'
  if (CRYPTO_KEYWORDS.test(name)) return 'crypto'
  return null
}

// Decompose a holding into bucket weights summing to 1.
function bucketWeights(
  holding: EnrichedHolding,
  analytics: Record<string, TickerAnalytics>,
): Record<ShockBucket, number> {
  const out: Record<ShockBucket, number> = {
    us_equity: 0, developed_ex_us_equity: 0, em_equity: 0, sg_equity: 0,
    bond: 0, gold: 0, commodity: 0, crypto: 0, cash: 0,
  }
  const a = analytics[holding.ticker]

  // Asset-class detection via name first — bonds/gold/commodity/crypto don't
  // get the geographic decomposition (they go 100% to their bucket).
  const classed = classifyByName(holding.ticker, a)
  if (classed) { out[classed] = 1; return out }

  // Equity: use geographic look-through
  if (a?.countries && Object.keys(a.countries).length > 0) {
    for (const [country, weight] of Object.entries(a.countries)) {
      const bucket = COUNTRY_TO_REGION[country] ?? 'developed_ex_us_equity'
      out[bucket] += weight
    }
    return out
  }

  // Fallback: use ticker domicile as a coarse proxy
  if (holding.ticker.toUpperCase().endsWith('.SI')) { out.sg_equity = 1; return out }
  if (holding.ticker.toUpperCase().endsWith('.HK')) { out.developed_ex_us_equity = 1; return out }
  // Default unknowns to US equity (most common)
  out.us_equity = 1
  return out
}

export interface StressTestResult {
  totalImpactPct: number          // overall portfolio % change
  totalImpactDollars: number      // overall $ change in base currency
  newPortfolioValue: number       // post-shock portfolio value
  startingValue: number
  perHolding: {
    ticker: string
    name: string | null
    valueBefore: number
    valueAfter: number
    impactPct: number
    impactDollars: number
    dominantBucket: ShockBucket
  }[]
  byBucket: {
    bucket: ShockBucket
    weight: number                // % of portfolio in this bucket
    shock: number                 // shock applied (fraction)
    contribution: number          // contribution to total impact (% of portfolio)
  }[]
}

export const BUCKET_LABELS: Record<ShockBucket, string> = {
  us_equity: 'US equities',
  developed_ex_us_equity: 'Developed ex-US equities',
  em_equity: 'Emerging markets',
  sg_equity: 'Singapore equities',
  bond: 'Bonds',
  gold: 'Gold',
  commodity: 'Commodities',
  crypto: 'Crypto',
  cash: 'Cash',
}

export function runStressTest(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
  shocks: ScenarioShocks,
  cashValueBase = 0,
): StressTestResult {
  const startingValue = enriched.reduce((s, h) => s + h.currentValueBase, 0) + cashValueBase
  if (startingValue <= 0) {
    return {
      totalImpactPct: 0, totalImpactDollars: 0, newPortfolioValue: 0, startingValue: 0,
      perHolding: [], byBucket: [],
    }
  }

  const bucketTotals: Record<ShockBucket, { weight: number; shockedValue: number }> = {
    us_equity: { weight: 0, shockedValue: 0 },
    developed_ex_us_equity: { weight: 0, shockedValue: 0 },
    em_equity: { weight: 0, shockedValue: 0 },
    sg_equity: { weight: 0, shockedValue: 0 },
    bond: { weight: 0, shockedValue: 0 },
    gold: { weight: 0, shockedValue: 0 },
    commodity: { weight: 0, shockedValue: 0 },
    crypto: { weight: 0, shockedValue: 0 },
    cash: { weight: cashValueBase, shockedValue: cashValueBase },
  }

  const perHolding: StressTestResult['perHolding'] = []
  let totalNewValue = cashValueBase

  for (const h of enriched) {
    const weights = bucketWeights(h, analytics)
    let valueAfter = 0
    let dominantBucket: ShockBucket = 'us_equity'
    let dominantWeight = 0
    for (const bucket of Object.keys(weights) as ShockBucket[]) {
      const w = weights[bucket]
      if (w <= 0) continue
      const valueInBucket = h.currentValueBase * w
      const shock = shocks[bucket] ?? 0
      const shocked = valueInBucket * (1 + shock)
      valueAfter += shocked
      bucketTotals[bucket].weight += valueInBucket
      bucketTotals[bucket].shockedValue += shocked
      if (w > dominantWeight) { dominantWeight = w; dominantBucket = bucket }
    }
    totalNewValue += valueAfter
    const impactDollars = valueAfter - h.currentValueBase
    const impactPct = h.currentValueBase > 0 ? (impactDollars / h.currentValueBase) * 100 : 0
    perHolding.push({
      ticker: h.ticker,
      name: h.name,
      valueBefore: h.currentValueBase,
      valueAfter,
      impactPct,
      impactDollars,
      dominantBucket,
    })
  }

  perHolding.sort((a, b) => a.impactDollars - b.impactDollars)

  const byBucket = (Object.keys(bucketTotals) as ShockBucket[])
    .filter((b) => bucketTotals[b].weight > 0)
    .map((b) => {
      const before = bucketTotals[b].weight
      const after = bucketTotals[b].shockedValue
      const shock = before > 0 ? (after - before) / before : 0
      return {
        bucket: b,
        weight: (before / startingValue) * 100,
        shock,
        contribution: ((after - before) / startingValue) * 100,
      }
    })
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))

  const totalImpactDollars = totalNewValue - startingValue
  const totalImpactPct = (totalImpactDollars / startingValue) * 100

  return {
    totalImpactPct,
    totalImpactDollars,
    newPortfolioValue: totalNewValue,
    startingValue,
    perHolding,
    byBucket,
  }
}

import type { Currency, EnrichedHolding } from '@/types'
import type { TickerAnalytics } from '@/app/api/analytics/route'
import {
  geographicBreakdown,
  sectorBreakdown,
  currencyBreakdown,
  assetTypeBreakdown,
  concentrationMetrics,
  lookThroughStocks,
} from '@/lib/analytics'
import { countryToCurrency } from '@/lib/etf-composition'

// ── Types ─────────────────────────────────────────────────────────────────
export type SuggestionSeverity = 'positive' | 'info' | 'warning' | 'critical'

export type SuggestionCategory =
  | 'concentration'
  | 'geographic'
  | 'sector'
  | 'currency'
  | 'asset_mix'
  | 'look_through'
  | 'overlap'
  | 'coverage'
  | 'holdings_count'

export const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  concentration: 'Concentration',
  geographic: 'Geographic',
  sector: 'Sector',
  currency: 'Currency',
  asset_mix: 'Asset Mix',
  look_through: 'Look-through',
  overlap: 'ETF Overlap',
  coverage: 'Data Coverage',
  holdings_count: 'Holdings Count',
}

export type RiskProfile = 'conservative' | 'balanced' | 'aggressive'
export type HomeBias = 'global' | 'us' | 'eu' | 'sg' | 'none'

export interface SuggestionPreferences {
  // Which categories to surface
  focusAreas: SuggestionCategory[]
  // Investment style
  riskProfile: RiskProfile
  homeBias: HomeBias
  // Thresholds (editable)
  maxSinglePositionPct: number   // default 10
  maxSingleSectorPct: number     // default 35
  maxSingleRegionPct: number     // default 70
  maxSingleCurrencyPct: number   // default 80
  maxLookThroughStockPct: number // default 12
  minHoldings: number            // default 5
  maxHoldings: number            // default 25
}

export const DEFAULT_PREFERENCES: SuggestionPreferences = {
  focusAreas: [
    'concentration', 'geographic', 'sector', 'currency',
    'asset_mix', 'look_through', 'overlap', 'coverage', 'holdings_count',
  ],
  riskProfile: 'balanced',
  homeBias: 'global',
  maxSinglePositionPct: 10,
  maxSingleSectorPct: 35,
  maxSingleRegionPct: 70,
  maxSingleCurrencyPct: 80,
  maxLookThroughStockPct: 12,
  minHoldings: 5,
  maxHoldings: 25,
}

export interface Evidence {
  label: string
  value: string
}

export type SuggestionApply =
  | { kind: 'set'; ticker: string; pct: number }
  | { kind: 'delta'; ticker: string; deltaPct: number }
  | { kind: 'remove'; ticker: string }
  | { kind: 'add'; ticker: string; pct: number }

export interface SuggestionAction {
  text: string
  // Optional concrete numbers
  ticker?: string
  deltaPct?: number
  // Encoded mutation for one-click "Apply to Planner"
  apply?: SuggestionApply
}

export interface Suggestion {
  id: string
  category: SuggestionCategory
  severity: SuggestionSeverity
  title: string
  summary: string
  explanation: string[]
  evidence: Evidence[]
  actions: SuggestionAction[]
}

export interface SuggestionsResult {
  suggestions: Suggestion[]
  // Score: 0–100, higher is better. Penalties for warnings/criticals.
  score: number
  scoreLabel: string
  // Counts
  counts: { positive: number; info: number; warning: number; critical: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

function severityWeight(s: SuggestionSeverity): number {
  return s === 'critical' ? 15 : s === 'warning' ? 6 : s === 'info' ? 1 : 0
}

// US-related country labels Yahoo emits
const US_LABELS = new Set(['United States', 'USA', 'US'])
const EU_LABELS = new Set([
  'France', 'Germany', 'Netherlands', 'Spain', 'Italy', 'Belgium', 'Ireland',
  'Finland', 'Austria', 'Portugal', 'Luxembourg', 'Greece',
])
const EM_LABELS = new Set([
  'China', 'India', 'Brazil', 'South Africa', 'Mexico', 'Indonesia',
  'Thailand', 'Malaysia', 'Philippines', 'Vietnam', 'Turkey', 'Poland',
  'Saudi Arabia', 'UAE', 'Emerging Markets',
])
const DEFENSIVE_SECTORS = new Set([
  'Healthcare', 'Consumer Defensive', 'Utilities',
])

// ── Rule: concentration ───────────────────────────────────────────────────
function ruleConcentration(
  enriched: EnrichedHolding[],
  prefs: SuggestionPreferences,
): Suggestion[] {
  const c = concentrationMetrics(enriched)
  const out: Suggestion[] = []

  // Largest single position
  if (enriched.length > 0) {
    const sorted = [...enriched].sort((a, b) => b.allocationPct - a.allocationPct)
    const top = sorted[0]
    if (c.largestPct > prefs.maxSinglePositionPct) {
      const severity: SuggestionSeverity =
        c.largestPct > prefs.maxSinglePositionPct * 2 ? 'critical' : 'warning'
      const excess = c.largestPct - prefs.maxSinglePositionPct
      out.push({
        id: 'conc-single',
        category: 'concentration',
        severity,
        title: 'Single-position concentration risk',
        summary: `${top.ticker} is ${pct(c.largestPct)} of your portfolio — above the ${pct(prefs.maxSinglePositionPct, 0)} guideline.`,
        explanation: [
          'When a single position exceeds roughly 10% of a portfolio, an idiosyncratic event — an earnings miss, a regulatory action, a lawsuit, an accounting scandal — can cause an outsized drawdown to overall returns. The position\'s daily volatility flows through to portfolio volatility roughly in proportion to its weight.',
          'Professional asset managers typically cap single-name exposure at 5–10% precisely so that no one event can dominate outcomes. This is risk management, not a judgment about the company.',
          'Important: ETFs you hold may also contain this name. The look-through tab shows your true combined exposure, which is often higher than the direct allocation suggests.',
        ],
        evidence: [
          { label: 'Position', value: top.ticker },
          { label: '% of portfolio', value: pct(c.largestPct) },
          { label: 'Your cap', value: pct(prefs.maxSinglePositionPct, 0) },
          { label: 'Excess', value: pct(excess) },
        ],
        actions: [
          {
            text: `Trim ${top.ticker} so its weight falls to ~${pct(prefs.maxSinglePositionPct, 0)}`,
            ticker: top.ticker, deltaPct: -excess,
            apply: { kind: 'set', ticker: top.ticker, pct: prefs.maxSinglePositionPct },
          },
          { text: `Alternatively, leave ${top.ticker} flat and add to other positions until its weight dilutes` },
          { text: 'Check the Analytics → Look-through tab for the combined direct + ETF exposure' },
        ],
      })
    }
  }

  // HHI
  if (c.hhi > 2500) {
    out.push({
      id: 'conc-hhi',
      category: 'concentration',
      severity: c.hhi > 4000 ? 'critical' : 'warning',
      title: 'Portfolio is highly concentrated (HHI)',
      summary: `Herfindahl-Hirschman Index of ${c.hhi.toFixed(0)} signals concentrated bets.`,
      explanation: [
        'HHI sums the squared weights of every position. A perfectly equal-weighted 10-stock portfolio scores 1,000; a single-stock portfolio scores 10,000. Antitrust regulators consider markets above 2,500 "highly concentrated" — the same maths flag the same risk in portfolios.',
        'A high HHI means a few positions drive almost all of your variance. You may have outperformance from one big winner, but you\'re also exposed to a single-name blowup wiping out years of gains.',
        `Your effective number of holdings is ${c.effectiveHoldings.toFixed(1)} — the equivalent of holding ${c.effectiveHoldings.toFixed(0)} equally-weighted positions. Higher is more diversified.`,
      ],
      evidence: [
        { label: 'HHI', value: c.hhi.toFixed(0) },
        { label: 'Effective holdings', value: c.effectiveHoldings.toFixed(1) },
        { label: 'Top-5', value: pct(c.top5Pct) },
        { label: 'Top-10', value: pct(c.top10Pct) },
      ],
      actions: [
        'Trim your largest few positions toward more even weights',
        `Add 3–5 new positions in under-represented sectors or regions to lift effective holdings above 10`,
        'If you must keep concentrated bets, hedge with a broad-market ETF satellite to dilute idiosyncratic risk',
      ].map((t) => ({ text: t })),
    })
  } else if (c.hhi < 1500 && c.effectiveHoldings >= 8) {
    out.push({
      id: 'conc-good',
      category: 'concentration',
      severity: 'positive',
      title: 'Concentration is well-managed',
      summary: `HHI ${c.hhi.toFixed(0)} with ~${c.effectiveHoldings.toFixed(0)} effective holdings — diversified.`,
      explanation: [
        'Your HHI is below the 1,500 "well diversified" threshold and you have a healthy number of effective holdings. This means no single position dominates portfolio variance.',
        'Keep monitoring as winners run — a 10% position that doubles becomes ~18% of the portfolio without any action on your part. Concentration creep is the most common way well-built portfolios drift.',
      ],
      evidence: [
        { label: 'HHI', value: c.hhi.toFixed(0) },
        { label: 'Effective holdings', value: c.effectiveHoldings.toFixed(1) },
      ],
      actions: [],
    })
  }

  // Top-5 share
  if (c.top5Pct > 70) {
    out.push({
      id: 'conc-top5',
      category: 'concentration',
      severity: 'warning',
      title: 'Top-5 holdings dominate the portfolio',
      summary: `Five positions account for ${pct(c.top5Pct)} of total value.`,
      explanation: [
        'When the top-5 weight exceeds ~70%, the rest of the portfolio is mostly noise — performance is determined almost entirely by those five names.',
        'This isn\'t inherently wrong (concentrated investors like Buffett or Munger have done well), but it requires high conviction and continued monitoring of each name. If those five positions weren\'t selected with that level of analysis, the concentration is accidental rather than intentional.',
      ],
      evidence: [
        { label: 'Top-5 share', value: pct(c.top5Pct) },
        { label: 'Total holdings', value: enriched.length.toString() },
      ],
      actions: [
        { text: 'Audit each top-5 position: is the conviction case still intact?' },
        { text: 'Trim the lowest-conviction name in the top-5 and broaden into a related theme via ETF' },
      ],
    })
  }

  return out
}

// ── Rule: holdings count ──────────────────────────────────────────────────
function ruleHoldingsCount(
  enriched: EnrichedHolding[],
  prefs: SuggestionPreferences,
): Suggestion[] {
  const out: Suggestion[] = []
  const n = enriched.length
  if (n === 0) return out

  if (n < prefs.minHoldings) {
    out.push({
      id: 'count-low',
      category: 'holdings_count',
      severity: n <= 2 ? 'critical' : 'warning',
      title: `Only ${n} positions — limited diversification`,
      summary: `You hold ${n} position${n === 1 ? '' : 's'}; ${prefs.minHoldings} or more is generally recommended.`,
      explanation: [
        'Modern Portfolio Theory shows that most diversifiable risk is removed by the time you hold ~15–20 uncorrelated positions. With fewer than 5, idiosyncratic risk dominates: a single bad pick can wipe out years of gains.',
        'A simple way to scale up without picking dozens of stocks is to use a broad-market ETF as the core (e.g. VT, VWRL, VTI) — it gives you ~3,000+ underlying companies with a single position.',
      ],
      evidence: [
        { label: 'Current holdings', value: n.toString() },
        { label: 'Minimum target', value: prefs.minHoldings.toString() },
      ],
      actions: [
        { text: 'Add a broad-market ETF (e.g. VT, VWRL, VTI) as the core holding' },
        { text: 'Layer in 3–5 satellite positions in themes you have strong views on' },
      ],
    })
  } else if (n > prefs.maxHoldings) {
    out.push({
      id: 'count-high',
      category: 'holdings_count',
      severity: 'info',
      title: `${n} positions — possibly over-diversified`,
      summary: `You hold ${n} positions; beyond ${prefs.maxHoldings} the marginal diversification benefit is minimal.`,
      explanation: [
        'The diversification benefit curve flattens fast: going from 1 to 10 holdings dramatically reduces single-name risk; going from 25 to 50 barely moves the needle. More positions also mean more brokerage costs, more tax events to track, more rebalancing work, and a portfolio that increasingly tracks the market average — at which point a single low-cost ETF would do the same job for less effort.',
        'If many of your positions overlap (same sector, same factor exposure, or held inside ETFs you also own), you may be paying for diversification you don\'t actually have.',
      ],
      evidence: [
        { label: 'Current holdings', value: n.toString() },
        { label: 'Suggested cap', value: prefs.maxHoldings.toString() },
      ],
      actions: [
        { text: 'Consolidate small positions (< 1% of portfolio) — they don\'t move the needle' },
        { text: 'Replace overlapping single stocks with a sector ETF if conviction has weakened' },
      ],
    })
  }
  return out
}

// ── Rule: geographic ──────────────────────────────────────────────────────
function ruleGeographic(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
  prefs: SuggestionPreferences,
): Suggestion[] {
  const out: Suggestion[] = []
  const breakdown = geographicBreakdown(enriched, analytics)
  if (breakdown.length === 0) return out

  const total = breakdown.reduce((s, b) => s + b.value, 0)
  if (total <= 0) return out

  const usPct = breakdown.filter((b) => US_LABELS.has(b.label)).reduce((s, b) => s + b.pct, 0)
  const euPct = breakdown.filter((b) => EU_LABELS.has(b.label) || b.label === 'Europe').reduce((s, b) => s + b.pct, 0)
  const emPct = breakdown.filter((b) => EM_LABELS.has(b.label)).reduce((s, b) => s + b.pct, 0)
  const sgPct = breakdown.filter((b) => b.label === 'Singapore').reduce((s, b) => s + b.pct, 0)
  const unknownPct = breakdown.filter((b) => b.label === 'Unknown').reduce((s, b) => s + b.pct, 0)

  // Single-country dominance
  const top = breakdown[0]
  if (top.pct > prefs.maxSingleRegionPct) {
    const severity: SuggestionSeverity = top.pct > 90 ? 'critical' : 'warning'
    out.push({
      id: 'geo-single',
      category: 'geographic',
      severity,
      title: `${pct(top.pct)} concentrated in ${top.label}`,
      summary: `${top.label} represents ${pct(top.pct)} of look-through equity exposure.`,
      explanation: [
        `A ${top.pct.toFixed(0)}% allocation to one country means your equity returns are nearly identical to that country's stock market, currency, and economic cycle.`,
        'This is fine if it matches your view — for example, US-focused investors often run 70–100% US weights deliberately. But if you didn\'t choose this on purpose, it means you\'re carrying a lot of country-specific risk: monetary policy of one central bank, fiscal policy of one government, demographic and political trends of one society.',
        'The MSCI All-Country World Index assigns roughly 60% to the US, 28% to other developed markets, and 12% to emerging markets. Significant deviations from that mix are a country bet, intentional or not.',
      ],
      evidence: [
        { label: 'Top country', value: top.label },
        { label: 'Allocation', value: pct(top.pct) },
        { label: 'Your cap', value: pct(prefs.maxSingleRegionPct, 0) },
        { label: '# of countries', value: breakdown.filter((b) => b.label !== 'Unknown').length.toString() },
      ],
      actions: [
        { text: 'Add a developed-markets-ex-US ETF (e.g. VEA, VXUS, IDEV) to balance out',
          apply: { kind: 'add', ticker: 'VEA', pct: 15 } },
        { text: 'If concentration is intentional (home bias), set your home-bias preference accordingly so this rule stops firing' },
      ],
    })
  }

  // Home bias preferences
  if (prefs.homeBias === 'us' && usPct < 40) {
    out.push({
      id: 'geo-us-bias',
      category: 'geographic',
      severity: 'info',
      title: 'Below your US home-bias target',
      summary: `US exposure is ${pct(usPct)} — your home bias suggests ≥ 40%.`,
      explanation: [
        'You\'ve set a US home bias, which usually means deliberately overweighting US equities versus a global benchmark. The classic argument: most of your liabilities (rent, food, future expenses) are denominated in your home currency, so matching some of your assets to those liabilities reduces FX risk on consumption.',
        'A typical home-bias allocation puts 60–80% in domestic equities, vs the ~60% the US already represents in the global cap-weighted index.',
      ],
      evidence: [
        { label: 'US allocation', value: pct(usPct) },
        { label: 'Home-bias target', value: '≥ 40%' },
      ],
      actions: [{ text: 'Increase US allocation via VTI, SPY, or sector-specific US ETFs' }],
    })
  }

  if (prefs.homeBias === 'sg' && sgPct < 15) {
    out.push({
      id: 'geo-sg-bias',
      category: 'geographic',
      severity: 'info',
      title: 'Below your Singapore home-bias target',
      summary: `Singapore exposure is ${pct(sgPct)} — your home bias suggests ≥ 15%.`,
      explanation: [
        'A Singapore home bias matches assets to SGD-denominated liabilities and reduces FX risk on day-to-day spending. The STI and the broader local market also include CPF-relevant REITs and dividend stocks that compound efficiently in SGD.',
        'Common allocation: 15–30% SGD-denominated equities (STI ETFs like ES3.SI, dividend names like D05.SI / O39.SI / U11.SI, or REITs).',
      ],
      evidence: [
        { label: 'Singapore allocation', value: pct(sgPct) },
        { label: 'Home-bias target', value: '≥ 15%' },
      ],
      actions: [
        { text: 'Add ES3.SI (STI ETF) or G3B.SI for broad SG exposure' },
        { text: 'Consider individual SG bank or REIT names for higher dividend yield' },
      ],
    })
  }

  if (prefs.homeBias === 'eu' && euPct < 25) {
    out.push({
      id: 'geo-eu-bias',
      category: 'geographic',
      severity: 'info',
      title: 'Below your European home-bias target',
      summary: `European exposure is ${pct(euPct)} — your home bias suggests ≥ 25%.`,
      explanation: [
        'A European home bias targets EUR-denominated revenue streams to offset EUR-denominated liabilities. European equities have historically traded at lower valuation multiples than US equities, which can be a tailwind for long-term returns if mean reversion holds.',
      ],
      evidence: [
        { label: 'EU allocation', value: pct(euPct) },
        { label: 'Home-bias target', value: '≥ 25%' },
      ],
      actions: [
        { text: 'Add VGK, IEUR, or local-listed Euro Stoxx 50 ETFs' },
      ],
    })
  }

  // Emerging markets gap (skip if home-biased — those investors usually skip EM intentionally)
  if (prefs.homeBias === 'global' && emPct < 3 && breakdown.length > 1) {
    out.push({
      id: 'geo-em-missing',
      category: 'geographic',
      severity: 'info',
      title: 'Little or no emerging-markets exposure',
      summary: `EM allocation is ${pct(emPct)} — global benchmarks include ~10–12%.`,
      explanation: [
        'Emerging markets (China, India, Brazil, etc.) make up about 10–12% of the MSCI All-Country World Index. They\'re typically more volatile but also offer higher long-run expected returns, particularly during USD weakness cycles when commodity exporters and EM currencies tend to outperform.',
        'EM also adds genuine diversification: their economic cycles aren\'t fully synchronized with developed markets, especially China and India.',
      ],
      evidence: [
        { label: 'EM allocation', value: pct(emPct) },
        { label: 'Benchmark weight', value: '~10–12%' },
      ],
      actions: [
        { text: 'Add ~10% via a broad EM ETF (VWO, IEMG, EIMI.L)',
          apply: { kind: 'add', ticker: 'VWO', pct: 10 } },
        { text: 'Or pick country ETFs for higher conviction (FXI/MCHI for China, INDA for India)' },
      ],
    })
  }

  // Coverage warning
  if (unknownPct > 20) {
    out.push({
      id: 'geo-unknown',
      category: 'coverage',
      severity: 'info',
      title: `${pct(unknownPct)} of geographic exposure is unclassified`,
      summary: 'Yahoo doesn\'t expose country data for some of your holdings.',
      explanation: [
        'Geographic look-through depends on Yahoo\'s top-10 holdings list for ETFs and country tag for individual stocks. For some thinly-followed funds and certain regional ETFs, this data is missing — those allocations are bucketed as "Unknown".',
        'This is a data limitation, not a portfolio problem. But it does mean the geographic breakdown understates exposure to whatever those holdings actually contain.',
      ],
      evidence: [{ label: 'Unclassified', value: pct(unknownPct) }],
      actions: [
        { text: 'Manually check the largest "Unknown" tickers — their fund factsheets show the actual country mix' },
      ],
    })
  }

  // Positive: well-spread
  const significantCountries = breakdown.filter((b) => b.pct >= 5 && b.label !== 'Unknown').length
  if (significantCountries >= 5 && top.pct < 65) {
    out.push({
      id: 'geo-good',
      category: 'geographic',
      severity: 'positive',
      title: 'Geographic exposure is well-spread',
      summary: `${significantCountries} countries each ≥ 5%, with no country exceeding ${pct(top.pct)}.`,
      explanation: [
        'Holding meaningful exposure to multiple countries — rather than just "global ETF, mostly US" — reduces dependence on any one country\'s monetary, fiscal, and political environment. It also captures different cycles: when US equities lag, EM or developed-ex-US often pick up the slack.',
      ],
      evidence: [
        { label: 'Countries ≥ 5%', value: significantCountries.toString() },
        { label: 'Largest country', value: `${top.label} at ${pct(top.pct)}` },
      ],
      actions: [],
    })
  }

  return out
}

// ── Rule: sector ──────────────────────────────────────────────────────────
function ruleSector(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
  prefs: SuggestionPreferences,
): Suggestion[] {
  const out: Suggestion[] = []
  const breakdown = sectorBreakdown(enriched, analytics)
  if (breakdown.length === 0) return out

  const top = breakdown[0]
  if (top.pct > prefs.maxSingleSectorPct) {
    const severity: SuggestionSeverity = top.pct > prefs.maxSingleSectorPct * 1.5 ? 'critical' : 'warning'
    out.push({
      id: 'sec-single',
      category: 'sector',
      severity,
      title: `Sector concentration in ${top.label}`,
      summary: `${pct(top.pct)} of look-through exposure is in ${top.label}.`,
      explanation: [
        `Sectors share common risk factors: regulation, input costs, customer demand cycles. A ${top.pct.toFixed(0)}% allocation to ${top.label} means a sector-wide event (rate hike for Tech, oil shock for Energy, drug-pricing reform for Healthcare) hits a third or more of your portfolio simultaneously.`,
        'The S&P 500 itself has become more concentrated — Tech is around 30% of the index — so some sector concentration is unavoidable when holding broad indices. But if your allocation comes from picking individual stocks in one sector, the risk is amplified because you also lose the diversification within the sector.',
      ],
      evidence: [
        { label: 'Top sector', value: top.label },
        { label: 'Allocation', value: pct(top.pct) },
        { label: 'Your cap', value: pct(prefs.maxSingleSectorPct, 0) },
      ],
      actions: [
        { text: `Trim direct ${top.label} positions; let your broad ETFs provide the baseline exposure` },
        { text: 'Add positions in sectors where you\'re currently underweight (see breakdown for gaps)' },
      ],
    })
  }

  // Defensive sector check based on risk profile
  const defensivePct = breakdown
    .filter((b) => DEFENSIVE_SECTORS.has(b.label))
    .reduce((s, b) => s + b.pct, 0)

  if (prefs.riskProfile === 'conservative' && defensivePct < 25) {
    out.push({
      id: 'sec-defensive',
      category: 'sector',
      severity: 'info',
      title: 'Low defensive-sector allocation',
      summary: `Defensive sectors (Healthcare, Consumer Defensive, Utilities) are only ${pct(defensivePct)}.`,
      explanation: [
        'Defensive sectors have historically held up better in recessions and rate-hiking cycles because they sell things people buy regardless of the economy: healthcare, food, household goods, electricity. They typically have lower beta to equity markets and lower drawdowns.',
        'For a conservative profile, ~30–40% in defensive sectors smooths the equity ride at the cost of slightly lower expected returns in bull markets.',
      ],
      evidence: [
        { label: 'Defensive sectors', value: pct(defensivePct) },
        { label: 'Suggested', value: '≥ 25%' },
      ],
      actions: [
        { text: 'Add VHT (US Healthcare), VDC (Consumer Staples), or VPU (Utilities)' },
        { text: 'Or shift to a low-volatility ETF (USMV, SPLV) which tilts naturally toward these sectors' },
      ],
    })
  }

  if (prefs.riskProfile === 'aggressive' && defensivePct > 40) {
    out.push({
      id: 'sec-aggressive-mismatch',
      category: 'sector',
      severity: 'info',
      title: 'High defensive allocation for aggressive profile',
      summary: `${pct(defensivePct)} in defensive sectors may dampen growth-oriented returns.`,
      explanation: [
        'You\'ve set an aggressive risk profile — willing to accept higher volatility for higher expected return — but your sector mix is tilted defensive. This combination tends to produce mid-pack returns: less downside than a pure-growth portfolio, but giving up the upside that justifies the aggressive label.',
        'If the defensive tilt is intentional (e.g. dividend income), no change needed. Otherwise, rebalance toward growth-oriented sectors.',
      ],
      evidence: [
        { label: 'Defensive', value: pct(defensivePct) },
      ],
      actions: [
        { text: 'Shift weight from defensives to QQQ (Tech-heavy), ARKK (innovation), or thematic ETFs' },
      ],
    })
  }

  return out
}

// ── Rule: currency ────────────────────────────────────────────────────────
function ruleCurrency(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
  baseCurrency: Currency,
  prefs: SuggestionPreferences,
): Suggestion[] {
  const out: Suggestion[] = []
  const breakdown = currencyBreakdown(enriched, analytics)
  if (breakdown.length === 0) return out

  const top = breakdown[0]
  const basePct = breakdown.find((b) => b.label === baseCurrency)?.pct ?? 0

  if (top.pct > prefs.maxSingleCurrencyPct) {
    out.push({
      id: 'cur-single',
      category: 'currency',
      severity: top.pct > 90 ? 'warning' : 'info',
      title: `${pct(top.pct)} of exposure in ${top.label}`,
      summary: `Underlying currency is ${top.pct > 90 ? 'almost entirely' : 'heavily'} ${top.label}.`,
      explanation: [
        `Even if your account is denominated in ${baseCurrency}, the underlying assets earn revenue and pay dividends in their local currency. A ${top.label} concentration means your real returns depend on ${top.label}'s purchasing power and FX rate.`,
        `If you spend in ${baseCurrency}, this is FX risk: when ${top.label} weakens against ${baseCurrency}, your portfolio's purchasing power drops even if asset prices in ${top.label} are flat.`,
      ],
      evidence: [
        { label: 'Top currency', value: top.label },
        { label: 'Exposure', value: pct(top.pct) },
        { label: `Base (${baseCurrency})`, value: pct(basePct) },
      ],
      actions: [
        { text: `Add positions denominated in ${baseCurrency} to reduce FX mismatch` },
        { text: 'Consider currency-hedged ETFs (e.g. HEFA for hedged developed markets) if you want equity exposure without FX risk' },
      ],
    })
  }

  // Mismatch: base currency exposure very low
  if (basePct < 10 && breakdown.length > 1) {
    out.push({
      id: 'cur-base-mismatch',
      category: 'currency',
      severity: 'info',
      title: `Almost no exposure to your base currency (${baseCurrency})`,
      summary: `Only ${pct(basePct)} of underlying exposure is in ${baseCurrency}.`,
      explanation: [
        `You\'ve set ${baseCurrency} as your base, which usually means it\'s the currency you spend in. With only ${basePct.toFixed(1)}% of underlying assets in ${baseCurrency}, your portfolio's purchasing power swings entirely with FX rates.`,
        'Some FX exposure is healthy and provides diversification, especially against home-currency inflation. But matching at least some assets to liabilities (i.e. domestic equities, REITs, bonds) is a standard prudence measure.',
      ],
      evidence: [
        { label: `${baseCurrency} exposure`, value: pct(basePct) },
        { label: 'Top currency', value: `${top.label} at ${pct(top.pct)}` },
      ],
      actions: [
        { text: `Add ${baseCurrency}-denominated holdings (local index ETFs, local dividend stocks, REITs)` },
      ],
    })
  }

  return out
}

// ── Rule: asset mix ───────────────────────────────────────────────────────
function ruleAssetMix(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
): Suggestion[] {
  const out: Suggestion[] = []
  const breakdown = assetTypeBreakdown(enriched, analytics)
  if (breakdown.length === 0) return out

  const stockPct = breakdown.find((b) => b.label === 'Stock')?.pct ?? 0
  const etfPct = (breakdown.find((b) => b.label === 'ETF')?.pct ?? 0) + (breakdown.find((b) => b.label === 'Mutual Fund')?.pct ?? 0)

  if (stockPct >= 95 && enriched.length >= 5) {
    out.push({
      id: 'mix-pure-stocks',
      category: 'asset_mix',
      severity: 'info',
      title: 'Portfolio is entirely individual stocks',
      summary: 'No ETF or fund exposure means every cent depends on stock-picking.',
      explanation: [
        'Single-stock investing requires ongoing research, conviction maintenance, and the ability to hold through 30–50% drawdowns. Studies consistently show most active stock-pickers underperform the index after fees and taxes — not because they\'re unskilled, but because diversification math is brutal.',
        'A common compromise: a "core-satellite" structure. The core (60–80% of the portfolio) is a broad index ETF doing the heavy lifting; satellites (20–40%) are higher-conviction individual stocks where you have a real edge. This caps the damage from any single stock-picking mistake while preserving the upside of conviction bets.',
      ],
      evidence: [
        { label: 'Individual stocks', value: pct(stockPct) },
        { label: 'ETFs / funds', value: pct(etfPct) },
      ],
      actions: [
        { text: 'Add a broad-market ETF (VT, VWRL, VTI) at 50–70% as the core',
          apply: { kind: 'add', ticker: 'VT', pct: 60 } },
        { text: 'Keep your highest-conviction stocks as satellites; sell the lower-conviction ones' },
      ],
    })
  }

  if (etfPct >= 95 && enriched.length >= 1) {
    out.push({
      id: 'mix-pure-etf',
      category: 'asset_mix',
      severity: 'positive',
      title: 'Pure ETF / fund portfolio',
      summary: 'Low-maintenance, evidence-based structure.',
      explanation: [
        'A 100% ETF / fund portfolio is the academic textbook answer for most retail investors: low fees, broad diversification, no need for ongoing single-name research. Vanguard, Bogle, and decades of empirical research support this approach.',
        'The trade-off is no upside from individual stock conviction. If you ever develop a strong, well-researched view on a specific company, a small satellite position can complement the ETF core. Otherwise: leave it alone, contribute regularly, rebalance once a year.',
      ],
      evidence: [
        { label: 'ETFs / funds', value: pct(etfPct) },
      ],
      actions: [],
    })
  }

  return out
}

// ── Rule: look-through stock concentration ────────────────────────────────
function ruleLookThrough(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
  prefs: SuggestionPreferences,
): Suggestion[] {
  const out: Suggestion[] = []
  const lt = lookThroughStocks(enriched, analytics)
  if (lt.stocks.length === 0) return out

  const top = lt.stocks[0]
  if (top.pct > prefs.maxLookThroughStockPct) {
    const severity: SuggestionSeverity = top.pct > prefs.maxLookThroughStockPct * 1.5 ? 'critical' : 'warning'
    const heldDirectly = top.sources.some((s) => s.weight === 1)
    const viaCount = top.sources.length

    out.push({
      id: 'lt-top',
      category: 'look_through',
      severity,
      title: `Hidden concentration: ${top.symbol} appears ${viaCount === 1 ? 'in 1 holding' : `across ${viaCount} holdings`}`,
      summary: `Combined exposure to ${top.symbol} is ${pct(top.pct)} (look-through).`,
      explanation: [
        `${top.symbol} (${top.name}) shows up via ${top.sources.map((s) => s.ticker).join(', ')}. ${heldDirectly ? 'You also hold it directly.' : 'You don\'t hold it directly, but ETFs you own contain it.'} The combined weight — ${pct(top.pct)} — is what actually matters for risk, not the direct allocation.`,
        'This kind of stealth concentration is common with mega-cap names like NVDA, AAPL, MSFT, GOOGL — a single broad-market ETF can already give you 5–7% exposure to any one of them, and adding another tech ETF or holding the stock directly compounds that.',
        'The right reaction depends on whether the concentration is intentional. If you\'d be comfortable with the same exposure as a deliberate single-stock bet, no change needed. If it\'s an unintended byproduct of your ETF mix, trim.',
      ],
      evidence: [
        { label: 'Stock', value: top.symbol },
        { label: 'Combined exposure', value: pct(top.pct) },
        { label: 'Held via', value: top.sources.map((s) => s.ticker).join(', ') },
        { label: 'Your cap', value: pct(prefs.maxLookThroughStockPct, 0) },
      ],
      actions: [
        { text: heldDirectly ? `Trim direct ${top.symbol} position to reduce stacked exposure` : `Reduce one of the ETFs that holds ${top.symbol}` },
        { text: 'Consider an equal-weight ETF (RSP) which caps single-name exposure to ~0.2%' },
      ],
    })
  }

  // Positive coverage note
  if (lt.coveragePct >= 70 && lt.stocks.length >= 30) {
    out.push({
      id: 'lt-coverage',
      category: 'look_through',
      severity: 'positive',
      title: 'Strong look-through coverage',
      summary: `${pct(lt.coveragePct)} of portfolio decomposed; ${lt.stocks.length} unique underlying stocks.`,
      explanation: [
        'Your portfolio decomposes cleanly into a known set of underlying companies — meaningful sector and concentration analysis is possible, and look-through risk metrics (like the one above) are reliable.',
      ],
      evidence: [
        { label: 'Coverage', value: pct(lt.coveragePct) },
        { label: 'Unique stocks', value: lt.stocks.length.toString() },
      ],
      actions: [],
    })
  }

  return out
}

// ── Rule: ETF overlap ─────────────────────────────────────────────────────
// Detect pairs of ETFs whose top-holdings overlap heavily.
function ruleOverlap(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
): Suggestion[] {
  const out: Suggestion[] = []
  const etfs = enriched
    .map((h) => ({ holding: h, a: analytics[h.ticker] }))
    .filter((x) => x.a && (x.a.quoteType === 'ETF' || x.a.quoteType === 'MUTUALFUND') && x.a.topHoldings && x.a.topHoldings.length > 0)

  if (etfs.length < 2) return out

  // Compute pairwise top-holding overlap (sum of min weights of common symbols)
  const pairs: { a: string; b: string; overlap: number }[] = []
  for (let i = 0; i < etfs.length; i++) {
    for (let j = i + 1; j < etfs.length; j++) {
      const aHoldings = new Map(etfs[i].a!.topHoldings!.map((h) => [h.symbol.toUpperCase(), h.weight]))
      const bHoldings = new Map(etfs[j].a!.topHoldings!.map((h) => [h.symbol.toUpperCase(), h.weight]))
      let overlap = 0
      aHoldings.forEach((wA, sym) => {
        const wB = bHoldings.get(sym)
        if (wB !== undefined && sym) overlap += Math.min(wA, wB)
      })
      if (overlap >= 0.3) {
        pairs.push({ a: etfs[i].holding.ticker, b: etfs[j].holding.ticker, overlap })
      }
    }
  }

  if (pairs.length === 0) return out
  pairs.sort((a, b) => b.overlap - a.overlap)
  const top = pairs[0]

  out.push({
    id: 'overlap-top',
    category: 'overlap',
    severity: top.overlap >= 0.6 ? 'warning' : 'info',
    title: `${top.a} and ${top.b} hold similar names`,
    summary: `Top-holdings overlap is ~${pct(top.overlap * 100, 0)} between these two ETFs.`,
    explanation: [
      `When two ETFs in your portfolio hold mostly the same underlying names, you\'re paying two expense ratios for largely the same exposure. ${top.a} and ${top.b} share around ${pct(top.overlap * 100, 0)} of their top holdings by weight.`,
      'A common cause is owning both a broad-market ETF and a US/large-cap ETF — VT and VTI, or VTI and SPY — whose top holdings are nearly identical mega-caps.',
      'Note: this is computed only from the top-10 holdings each ETF reports. The actual overlap of the full funds may be different.',
      pairs.length > 1
        ? `Other notable overlaps in your portfolio: ${pairs.slice(1, 4).map((p) => `${p.a}/${p.b} (${pct(p.overlap * 100, 0)})`).join(', ')}.`
        : '',
    ].filter(Boolean),
    evidence: [
      { label: 'Pair', value: `${top.a} ↔ ${top.b}` },
      { label: 'Top-10 overlap', value: pct(top.overlap * 100, 0) },
      { label: 'Total overlapping pairs', value: pairs.length.toString() },
    ],
    actions: [
      { text: `Keep the broader / cheaper of ${top.a} vs ${top.b}; sell or stop adding to the other` },
      { text: 'If you want growth tilt on top of broad market, prefer a complementary ETF (small-cap, EM, factor) rather than another large-cap fund' },
    ],
  })

  return out
}

// ── Rule: data coverage ───────────────────────────────────────────────────
function ruleCoverage(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
): Suggestion[] {
  const out: Suggestion[] = []
  const unknownTickers = enriched.filter((h) => {
    const a = analytics[h.ticker]
    return !a || a.quoteType === 'UNKNOWN'
  })
  if (unknownTickers.length === 0) return out

  const totalUnknownPct = unknownTickers.reduce((s, h) => s + h.allocationPct, 0)
  if (totalUnknownPct < 5) return out

  out.push({
    id: 'cov-unknown-tickers',
    category: 'coverage',
    severity: totalUnknownPct > 25 ? 'warning' : 'info',
    title: `Analytics unavailable for ${unknownTickers.length} ticker${unknownTickers.length === 1 ? '' : 's'}`,
    summary: `${pct(totalUnknownPct)} of the portfolio has no composition data.`,
    explanation: [
      `Yahoo Finance couldn\'t classify the following: ${unknownTickers.map((h) => h.ticker).join(', ')}. Analytics treats them as "Unclassified" — they\'re excluded from sector/geographic look-through.`,
      'Common causes: regional exchanges Yahoo doesn\'t cover well, recently-listed funds, mutual funds with different identifiers, or tickers that Yahoo aliases differently than your ledger uses.',
    ],
    evidence: [
      { label: 'Affected tickers', value: unknownTickers.map((h) => h.ticker).join(', ') },
      { label: '% of portfolio', value: pct(totalUnknownPct) },
    ],
    actions: [
      { text: 'Verify the ticker matches Yahoo\'s symbol exactly (e.g. ".SI" suffix for SGX, ".L" for LSE)' },
      { text: 'For the affected ETFs, check the issuer factsheet and mentally apply the look-through manually' },
    ],
  })

  return out
}

// ── Main entry ────────────────────────────────────────────────────────────
export function generateSuggestions(
  enriched: EnrichedHolding[],
  analytics: Record<string, TickerAnalytics>,
  baseCurrency: Currency,
  prefs: SuggestionPreferences,
): SuggestionsResult {
  if (enriched.length === 0) {
    return {
      suggestions: [],
      score: 0,
      scoreLabel: 'No data',
      counts: { positive: 0, info: 0, warning: 0, critical: 0 },
    }
  }

  const all: Suggestion[] = [
    ...ruleConcentration(enriched, prefs),
    ...ruleHoldingsCount(enriched, prefs),
    ...ruleGeographic(enriched, analytics, prefs),
    ...ruleSector(enriched, analytics, prefs),
    ...ruleCurrency(enriched, analytics, baseCurrency, prefs),
    ...ruleAssetMix(enriched, analytics),
    ...ruleLookThrough(enriched, analytics, prefs),
    ...ruleOverlap(enriched, analytics),
    ...ruleCoverage(enriched, analytics),
  ]

  // Filter by focus areas
  const filtered = all.filter((s) => prefs.focusAreas.includes(s.category))

  // Sort: critical → warning → info → positive
  const order: SuggestionSeverity[] = ['critical', 'warning', 'info', 'positive']
  filtered.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))

  // Score: 100 - sum of penalties, floor 0
  const totalPenalty = all.reduce((s, sg) => s + severityWeight(sg.severity), 0)
  const score = Math.max(0, Math.min(100, 100 - totalPenalty))
  const scoreLabel =
    score >= 85 ? 'Excellent' :
    score >= 70 ? 'Good' :
    score >= 50 ? 'Fair' :
    score >= 30 ? 'Needs work' : 'Poor'

  const counts = {
    positive: all.filter((s) => s.severity === 'positive').length,
    info: all.filter((s) => s.severity === 'info').length,
    warning: all.filter((s) => s.severity === 'warning').length,
    critical: all.filter((s) => s.severity === 'critical').length,
  }

  return { suggestions: filtered, score, scoreLabel, counts }
}

// Suppress unused-import warning for countryToCurrency — kept for future extension
void countryToCurrency

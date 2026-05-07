// Deterministic, rule-based portfolio narrative. No LLM, no API key, no
// per-render cost. Generated entirely from the structured analytics that
// power the rest of the app.
//
// The output is a 2-paragraph summary:
//   • What this portfolio is (size, top exposures, return)
//   • One or two things worth flagging (concentration, geographic skew,
//     currency mismatch, sector imbalance)

import type { Currency, EnrichedHolding, PortfolioStats } from '@/types'
import type { TickerAnalytics } from '@/app/api/analytics/route'
import {
  geographicBreakdown, sectorBreakdown, currencyBreakdown, concentrationMetrics,
} from '@/lib/analytics'
import { formatCurrency, formatPercent } from '@/lib/utils'

interface NarrativeInput {
  enriched: EnrichedHolding[]
  stats: PortfolioStats
  baseCurrency: Currency
  analytics: Record<string, TickerAnalytics>
}

export function buildPortfolioNarrative(inp: NarrativeInput): string[] {
  const { enriched, stats, baseCurrency, analytics } = inp
  if (enriched.length === 0) {
    return ['Add some holdings to see a portfolio summary.']
  }

  const geo = geographicBreakdown(enriched, analytics)
  const sec = sectorBreakdown(enriched, analytics)
  const cur = currencyBreakdown(enriched, analytics)
  const conc = concentrationMetrics(enriched)

  const sorted = [...enriched].sort((a, b) => b.currentValueBase - a.currentValueBase)
  const top = sorted[0]
  const top3 = sorted.slice(0, 3)

  // Paragraph 1 — what this portfolio is
  const p1Parts: string[] = []

  p1Parts.push(
    `Your portfolio is worth ${formatCurrency(stats.totalValue, baseCurrency)} across ${enriched.length} position${enriched.length === 1 ? '' : 's'}` +
    (stats.cashValue > 0
      ? ` (${formatCurrency(stats.holdingsValue, baseCurrency)} held + ${formatCurrency(stats.cashValue, baseCurrency)} cash)`
      : '') +
    `.`,
  )

  if (Math.abs(stats.totalGainLossPct) > 0.05 && stats.totalCost > 0) {
    const direction = stats.totalGainLoss >= 0 ? 'up' : 'down'
    p1Parts.push(
      `It's ${direction} ${formatPercent(stats.totalGainLossPct, 1)} ` +
      `(${formatCurrency(stats.totalGainLoss, baseCurrency)}) overall against a cost basis of ${formatCurrency(stats.totalCost, baseCurrency)}.`,
    )
  }

  if (top3.length >= 1) {
    const topNames = top3.map((h) => `${h.ticker} ${h.allocationPct.toFixed(1)}%`).join(', ')
    p1Parts.push(`The largest position${top3.length > 1 ? 's are' : ' is'} ${topNames}.`)
  }

  // Where the money is geographically + sector-wise
  if (geo.length > 0) {
    const topGeo = geo[0]
    if (topGeo.pct >= 30) {
      p1Parts.push(
        `Geographically, exposure is ${topGeo.pct >= 70 ? 'concentrated in' : 'led by'} ${topGeo.label} at ${topGeo.pct.toFixed(0)}%`
        + (geo[1] ? `, with ${geo[1].label} next at ${geo[1].pct.toFixed(0)}%.` : '.'),
      )
    }
  }

  // Paragraph 2 — what to flag
  const p2Parts: string[] = []
  let flags = 0

  // Concentration
  if (conc.largestPct > 15) {
    p2Parts.push(
      `${top.ticker} alone is ${conc.largestPct.toFixed(0)}% of the portfolio — ` +
      `idiosyncratic risk (a single news event hitting that name) drives a lot of your variance.`,
    )
    flags++
  } else if (conc.hhi > 2500) {
    p2Parts.push(
      `Concentration is high overall (HHI ${conc.hhi.toFixed(0)}, top-5 = ${conc.top5Pct.toFixed(0)}%) — ` +
      `the rest of the holdings beyond the top few don't move the needle much.`,
    )
    flags++
  }

  // Geographic skew (if not already mentioned in p1)
  if (flags < 2 && geo.length > 0 && geo[0].pct > 80) {
    p2Parts.push(
      `Geographic exposure is heavily tilted toward ${geo[0].label} (${geo[0].pct.toFixed(0)}%) — ` +
      `your returns will track that single market closely.`,
    )
    flags++
  }

  // Sector skew
  if (flags < 2 && sec.length > 0 && sec[0].pct > 35) {
    p2Parts.push(
      `${sec[0].label} sits at ${sec[0].pct.toFixed(0)}% — sector-specific risks (regulation, rate cycle, demand shocks) hit a third+ of the portfolio at once.`,
    )
    flags++
  }

  // Currency mismatch
  if (flags < 2 && cur.length > 0) {
    const baseExposure = cur.find((c) => c.label === baseCurrency)?.pct ?? 0
    if (baseExposure < 10 && cur[0].label !== baseCurrency) {
      p2Parts.push(
        `Almost none of the underlying assets earn in ${baseCurrency} (${baseExposure.toFixed(0)}%) — ` +
        `your purchasing power in ${baseCurrency} swings entirely with FX rates.`,
      )
      flags++
    }
  }

  // Day change context (current move)
  if (flags < 2 && Math.abs(stats.totalDayChangePct) > 1.5) {
    const direction = stats.totalDayChange >= 0 ? 'up' : 'down'
    p2Parts.push(
      `Today the portfolio is ${direction} ${formatPercent(stats.totalDayChangePct, 2)} ` +
      `(${formatCurrency(stats.totalDayChange, baseCurrency)}).`,
    )
    flags++
  }

  // Positive close if nothing concerning
  if (flags === 0) {
    if (conc.hhi < 1500 && conc.effectiveHoldings >= 8) {
      p2Parts.push(
        `Concentration is well-managed (HHI ${conc.hhi.toFixed(0)}, ${conc.effectiveHoldings.toFixed(1)} effective holdings). ` +
        `No single name or theme dominates risk.`,
      )
    }
    if (geo.length > 1 && geo[0].pct < 65) {
      p2Parts.push(
        `Geographic spread looks reasonable — ${geo[0].label} leads at ${geo[0].pct.toFixed(0)}% but several other regions carry meaningful weight.`,
      )
    }
    if (p2Parts.length === 0) {
      p2Parts.push('Nothing stands out as immediately concerning at the current weights.')
    }
  }

  return [p1Parts.join(' '), p2Parts.join(' ')]
}

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MetricLabel } from '@/components/ui/metric-label'
import { formatCurrency } from '@/lib/utils'
import type { LookThroughStock } from '@/lib/analytics'
import type { Currency } from '@/types'

interface Props {
  stocks: LookThroughStock[]
  coveragePct: number
  baseCurrency: Currency
}

export function LookThroughStocksCard({ stocks, coveragePct, baseCurrency }: Props) {
  const top = stocks.slice(0, 20)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-base">
              <MetricLabel term="look_through">Look-through Stock Exposure</MetricLabel>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Underlying single-stock positions, including those held inside ETFs.
              Direct stocks count fully; ETF top-holdings count proportionally.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Coverage</div>
            <div className="text-sm font-semibold tabular-nums">
              {coveragePct.toFixed(1)}%
            </div>
            <div className="text-[10px] text-muted-foreground max-w-[140px]">
              Yahoo only exposes top-10 ETF holdings
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No look-through data available yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Stock</th>
                  <th className="pb-2 font-medium">Held via</th>
                  <th className="pb-2 font-medium text-right">Value</th>
                  <th className="pb-2 font-medium text-right">% of portfolio</th>
                </tr>
              </thead>
              <tbody>
                {top.map((s, i) => (
                  <tr key={s.symbol} className="border-b border-border/50 last:border-0">
                    <td className="py-2 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="py-2">
                      <div className="font-medium">{s.symbol}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                        {s.name}
                      </div>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {s.sources.map((src, idx) => (
                        <span key={idx}>
                          {idx > 0 && ', '}
                          <span className="font-medium text-foreground">{src.ticker}</span>
                          {src.weight < 1 && (
                            <span className="text-muted-foreground"> ({(src.weight * 100).toFixed(1)}%)</span>
                          )}
                        </span>
                      ))}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCurrency(s.value, baseCurrency)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {s.pct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

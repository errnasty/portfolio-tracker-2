'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  tickers: string[]
  matrix: number[][]
}

function corrColor(v: number): string {
  // -1 (red) → 0 (neutral) → +1 (blue)
  const clamp = Math.max(-1, Math.min(1, v))
  if (clamp >= 0) {
    // 0 → transparent, +1 → indigo
    const a = (clamp * 0.7).toFixed(2)
    return `rgba(99, 102, 241, ${a})`
  }
  const a = (Math.abs(clamp) * 0.7).toFixed(2)
  return `rgba(244, 63, 94, ${a})`
}

export function CorrelationMatrix({ tickers, matrix }: Props) {
  if (tickers.length < 2) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Correlation Matrix</CardTitle>
        <p className="text-xs text-muted-foreground">
          Daily-return correlation between holdings. Lower values indicate better diversification.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="p-1.5 md:p-2 text-left font-medium text-muted-foreground sticky left-0 bg-card z-10" />
                {tickers.map((t) => (
                  <th key={t} className="p-1.5 md:p-2 font-medium text-muted-foreground whitespace-nowrap">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickers.map((t, i) => (
                <tr key={t}>
                  <td className="p-1.5 md:p-2 font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-card z-10">
                    {t}
                  </td>
                  {tickers.map((_, j) => {
                    const v = matrix[i]?.[j] ?? 0
                    return (
                      <td
                        key={j}
                        className="p-1.5 md:p-2 text-center tabular-nums min-w-[44px]"
                        style={{ backgroundColor: corrColor(v) }}
                        title={`${tickers[i]} ↔ ${tickers[j]}: ${v.toFixed(3)}`}
                      >
                        {v.toFixed(2)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

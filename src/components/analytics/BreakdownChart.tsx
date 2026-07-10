'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import type { BreakdownSlice } from '@/lib/analytics'
import type { Currency } from '@/types'

const COLORS = ['#C6A96A', '#3f8f86', '#3f6fb0', '#8a9a5b', '#b07a86', '#7a6f9a', '#6f8f3f', '#b5732f', '#9a4a3f', '#9a8f7a']

interface Props {
  title: string
  data: BreakdownSlice[]
  baseCurrency: Currency
  description?: string
}

export function BreakdownChart({ title, data, baseCurrency, description }: Props) {
  const chartData = data.map((d) => ({
    name: d.label,
    value: parseFloat(d.pct.toFixed(2)),
    rawValue: d.value,
  }))

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No data available
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _name, props: any) => {
                    const pct = typeof value === 'number' ? `${value.toFixed(2)}%` : value
                    const raw = props?.payload?.rawValue
                    return [
                      typeof raw === 'number'
                        ? `${pct} (${formatCurrency(raw, baseCurrency)})`
                        : pct,
                      props?.payload?.name,
                    ]
                  }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1.5 max-h-44 overflow-y-auto">
              {data.map((slice, i) => (
                <div key={slice.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="truncate">{slice.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground">
                      {formatCurrency(slice.value, baseCurrency)}
                    </span>
                    <span className="font-medium tabular-nums w-12 text-right">
                      {slice.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

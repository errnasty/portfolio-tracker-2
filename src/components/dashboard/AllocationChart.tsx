'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { EnrichedHolding } from '@/types'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6',
]

interface Props {
  enriched: EnrichedHolding[]
  loading: boolean
}

export function AllocationChart({ enriched, loading }: Props) {
  const data = enriched
    .filter((h) => h.allocationPct > 0)
    .sort((a, b) => b.allocationPct - a.allocationPct)
    .map((h) => ({ name: h.ticker, value: parseFloat(h.allocationPct.toFixed(2)) }))

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Allocation</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-48 w-48 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No holdings yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [typeof value === 'number' ? `${value.toFixed(2)}%` : value, 'Allocation']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

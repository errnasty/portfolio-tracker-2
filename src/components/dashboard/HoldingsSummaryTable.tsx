'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercent, gainLossColor, gainLossBg } from '@/lib/utils'
import { ArrowUpRight } from 'lucide-react'
import type { EnrichedHolding, Currency } from '@/types'

interface Props {
  enriched: EnrichedHolding[]
  loading: boolean
  base: Currency
}

export function HoldingsSummaryTable({ enriched, loading, base }: Props) {
  const sorted = [...enriched].sort((a, b) => b.currentValueBase - a.currentValueBase)

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Holdings</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/holdings">
            Manage <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-3 p-6">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <div className="text-center">
              <p>No holdings yet.</p>
              <Link href="/holdings" className="text-foreground underline underline-offset-4">Add your first holding →</Link>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead className="text-right">Value ({base})</TableHead>
                <TableHead className="text-right">Day</TableHead>
                <TableHead className="text-right">Return</TableHead>
                <TableHead className="text-right">Alloc</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>
                    <div className="font-medium">{h.ticker}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{h.name}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(h.currentValueBase, base)}
                  </TableCell>
                  <TableCell className={`text-right text-xs ${gainLossColor(h.dayChange)}`}>
                    {formatPercent(h.dayChangePct)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${gainLossBg(h.gainLoss)}`}>
                      {formatPercent(h.gainLossPct)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {h.allocationPct.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

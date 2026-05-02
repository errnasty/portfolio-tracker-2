'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Search, Loader2, Wand2, Copy } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Currency } from '@/types'
import type { PlannedPosition } from '@/lib/planner'
import { impliedAmount, normalizeAllocations } from '@/lib/planner'
import type { SearchResult } from '@/app/api/search/route'

interface Props {
  positions: PlannedPosition[]
  totalValue: number
  baseCurrency: Currency
  onPositionsChange: (positions: PlannedPosition[]) => void
  onTotalValueChange: (v: number) => void
  onCopyFromCurrent?: () => void
  canCopyFromCurrent: boolean
}

function newRow(): PlannedPosition {
  return {
    id: Math.random().toString(36).slice(2, 10),
    ticker: '',
    name: '',
    pct: 0,
  }
}

// Lightweight ticker search dropdown — patterned after the holdings page,
// scoped to a single row.
function InlineTickerSearch({
  ticker,
  name,
  onSelect,
}: {
  ticker: string
  name: string
  onSelect: (ticker: string, name: string) => void
}) {
  const [query, setQuery] = useState(ticker)
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout>>()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(ticker) }, [ticker])

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); setOpen(false); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results ?? [])
      setOpen(true)
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-8 pr-7 text-sm"
          placeholder="Ticker or name…"
          value={query}
          onChange={(e) => {
            const q = e.target.value
            setQuery(q)
            clearTimeout(debounce.current)
            debounce.current = setTimeout(() => runSearch(q), 350)
          }}
          onBlur={() => {
            // Commit raw text as ticker if user typed and didn't pick a result
            if (query.trim() && query.toUpperCase() !== ticker) {
              onSelect(query.toUpperCase().trim(), name || '')
            }
          }}
          autoComplete="off"
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {name && (
        <div className="mt-1 truncate text-[11px] text-muted-foreground">{name}</div>
      )}

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-72 rounded-md border border-border bg-popover shadow-lg">
          {results.map((r) => (
            <button
              key={r.symbol}
              type="button"
              className="flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition-colors first:rounded-t-md last:rounded-b-md hover:bg-accent"
              onMouseDown={() => {
                setOpen(false); setResults([])
                setQuery(r.symbol)
                onSelect(r.symbol, r.longname ?? r.shortname)
              }}
            >
              <div className="min-w-[80px]">
                <div className="font-semibold">{r.symbol}</div>
                <div className="text-xs text-muted-foreground">{r.exchange}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-foreground">{r.shortname}</div>
                <div className="text-xs text-muted-foreground">{r.quoteType}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PlannerEditor({
  positions,
  totalValue,
  baseCurrency,
  onPositionsChange,
  onTotalValueChange,
  onCopyFromCurrent,
  canCopyFromCurrent,
}: Props) {
  const totalPct = positions.reduce((s, p) => s + (p.pct || 0), 0)
  const remainingPct = 100 - totalPct
  const totalOk = Math.abs(totalPct - 100) < 0.05

  const updatePosition = (id: string, patch: Partial<PlannedPosition>) => {
    onPositionsChange(
      positions.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    )
  }

  const removePosition = (id: string) => {
    onPositionsChange(positions.filter((p) => p.id !== id))
  }

  const addPosition = () => {
    onPositionsChange([...positions, newRow()])
  }

  const handleNormalize = () => {
    onPositionsChange(normalizeAllocations(positions))
  }

  const fillRemaining = (id: string) => {
    const others = positions.filter((p) => p.id !== id).reduce((s, p) => s + (p.pct || 0), 0)
    const remaining = Math.max(0, 100 - others)
    updatePosition(id, { pct: parseFloat(remaining.toFixed(2)) })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Hypothetical Portfolio</CardTitle>
            <CardDescription>
              Add tickers, allocate %, and explore the resulting composition. Nothing here touches your real holdings.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {onCopyFromCurrent && (
              <Button
                variant="outline" size="sm"
                onClick={onCopyFromCurrent}
                disabled={!canCopyFromCurrent}
                title="Pre-fill from your real portfolio"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy from current
              </Button>
            )}
            <Button
              variant="outline" size="sm"
              onClick={handleNormalize}
              disabled={positions.length === 0}
              title="Scale all rows so they sum to 100%"
            >
              <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Normalize
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total portfolio value */}
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label className="text-xs">Total portfolio value ({baseCurrency})</Label>
            <Input
              type="number" min="0" step="any"
              value={totalValue || ''}
              onChange={(e) => onTotalValueChange(parseFloat(e.target.value) || 0)}
              placeholder="100000"
            />
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-xs space-y-0.5">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">Allocated</span>
              <span className={`font-medium tabular-nums ${totalOk ? 'text-emerald-400' : totalPct > 100 ? 'text-red-400' : 'text-amber-400'}`}>
                {totalPct.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">Remaining</span>
              <span className="tabular-nums">{remainingPct.toFixed(2)}%</span>
            </div>
          </div>
        </div>

        {/* Position rows */}
        <div className="space-y-2">
          {positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No positions yet. Click <em>Add position</em> to start.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Ticker</th>
                    <th className="pb-2 font-medium w-32">Allocation %</th>
                    <th className="pb-2 font-medium text-right">Implied amount</th>
                    <th className="pb-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const amount = impliedAmount(p.pct || 0, totalValue)
                    return (
                      <tr key={p.id} className="border-b border-border/50 last:border-0 align-top">
                        <td className="py-2 pr-3 min-w-[220px]">
                          <InlineTickerSearch
                            ticker={p.ticker}
                            name={p.name}
                            onSelect={(t, n) => updatePosition(p.id, { ticker: t, name: n })}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" min="0" max="100" step="0.01"
                              value={p.pct || ''}
                              onChange={(e) => updatePosition(p.id, { pct: parseFloat(e.target.value) || 0 })}
                              className="h-9 w-24 text-sm"
                              placeholder="0"
                            />
                            <button
                              type="button"
                              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1"
                              onClick={() => fillRemaining(p.id)}
                              title="Fill remaining %"
                            >
                              fill
                            </button>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatCurrency(amount, baseCurrency)}
                        </td>
                        <td className="py-2">
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-400"
                            onClick={() => removePosition(p.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={addPosition}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add position
        </Button>
      </CardContent>
    </Card>
  )
}

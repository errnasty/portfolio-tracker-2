'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { formatCurrency, formatPercent, formatShares, gainLossColor, gainLossBg } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react'
import type { Currency, Holding, HoldingFormData } from '@/types'
import type { SearchResult } from '@/app/api/search/route'

const CURRENCIES: Currency[] = ['USD', 'SGD', 'EUR']
const EMPTY_FORM: HoldingFormData = { ticker: '', name: '', shares: '', cost_basis_per_share: '', cost_basis_currency: 'USD' }

// ── Ticker search component ────────────────────────────────────────────────
function TickerSearch({
  value, name, onSelect, disabled,
}: {
  value: string
  name: string
  onSelect: (ticker: string, name: string, currency: Currency | string) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout>>()
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync external value changes (e.g. on edit open)
  useEffect(() => { setQuery(value) }, [value])

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => runSearch(q), 350)
  }

  const handleSelect = (r: SearchResult) => {
    setQuery(r.symbol)
    setOpen(false)
    setResults([])
    onSelect(r.symbol, r.longname ?? r.shortname, r.currency ?? 'USD')
  }

  // Close dropdown on outside click
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
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9 pr-8"
          placeholder="Search ticker or company name…"
          value={query}
          onChange={handleChange}
          disabled={disabled}
          autoComplete="off"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          {results.map((r) => (
            <button
              key={r.symbol}
              type="button"
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors first:rounded-t-md last:rounded-b-md"
              onMouseDown={() => handleSelect(r)}
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

      {open && results.length === 0 && !searching && query.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover px-3 py-2.5 text-sm text-muted-foreground shadow-lg">
          No results for &ldquo;{query}&rdquo; — try the exact ticker symbol (e.g. VWRL.L, ES3.SI)
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function HoldingsPage() {
  const { enriched, loading, addHolding, updateHolding, deleteHolding, settings } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<HoldingFormData>(EMPTY_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setOpen(true) }
  const openEdit = (h: Holding) => {
    setForm({
      ticker: h.ticker,
      name: h.name ?? '',
      shares: String(h.shares),
      cost_basis_per_share: String(h.cost_basis_per_share),
      cost_basis_currency: h.cost_basis_currency,
    })
    setEditId(h.id)
    setOpen(true)
  }

  const handleTickerSelect = (ticker: string, name: string, currency: string) => {
    const mappedCurrency = (['USD', 'SGD', 'EUR'].includes(currency) ? currency : 'USD') as Currency
    setForm((prev) => ({ ...prev, ticker, name, cost_basis_currency: mappedCurrency }))
  }

  const handleSave = async () => {
    if (!form.ticker || !form.shares || !form.cost_basis_per_share) return
    setSaving(true)
    const payload = {
      ticker: form.ticker.toUpperCase().trim(),
      name: form.name.trim() || null,
      shares: parseFloat(form.shares),
      cost_basis_per_share: parseFloat(form.cost_basis_per_share),
      cost_basis_currency: form.cost_basis_currency,
    }
    if (editId) {
      await updateHolding(editId, payload)
    } else {
      await addHolding(payload)
    }
    setSaving(false)
    setOpen(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await deleteHolding(deleteId)
    setDeleteId(null)
  }

  const canSave = form.ticker.trim() && form.shares && form.cost_basis_per_share && !saving

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Holdings</h1>
          <p className="text-muted-foreground">Manage your portfolio positions</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Holding
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : enriched.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
              <p>No holdings yet. Add your first position to get started.</p>
              <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add Holding</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker / Name</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Cost Basis</TableHead>
                  <TableHead className="text-right">Current Price</TableHead>
                  <TableHead className="text-right">Value ({base})</TableHead>
                  <TableHead className="text-right">Day</TableHead>
                  <TableHead className="text-right">Return</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...enriched].sort((a, b) => b.currentValueBase - a.currentValueBase).map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <div className="font-semibold">{h.ticker}</div>
                      <div className="text-xs text-muted-foreground">{h.name ?? '—'}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatShares(h.shares)}</TableCell>
                    <TableCell className="text-right text-sm">
                      <div className="font-mono">{formatCurrency(h.cost_basis_per_share, h.cost_basis_currency)}</div>
                      <div className="text-xs text-muted-foreground">{h.cost_basis_currency}</div>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {h.currentPrice > 0 ? (
                        <>
                          <div className="font-mono">{formatCurrency(h.currentPrice, h.priceCurrency)}</div>
                          <div className="text-xs text-muted-foreground">{h.priceCurrency}</div>
                        </>
                      ) : (
                        <span className="text-xs text-amber-400">Price unavailable</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {h.currentValueBase > 0 ? formatCurrency(h.currentValueBase, base) : '—'}
                    </TableCell>
                    <TableCell className={`text-right text-sm ${h.currentPrice > 0 ? gainLossColor(h.dayChange) : 'text-muted-foreground'}`}>
                      {h.currentPrice > 0 ? formatPercent(h.dayChangePct) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {h.currentPrice > 0 ? (
                        <>
                          <div className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${gainLossBg(h.gainLoss)}`}>
                            {formatPercent(h.gainLossPct)}
                          </div>
                          <div className={`text-xs ${gainLossColor(h.gainLoss)}`}>
                            {formatCurrency(h.gainLoss, base)}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-amber-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(h)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => setDeleteId(h.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Holding' : 'Add Holding'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Ticker search */}
            <div className="space-y-2">
              <Label>Search Ticker or Company *</Label>
              <TickerSearch
                value={form.ticker}
                name={form.name}
                onSelect={handleTickerSelect}
              />
              {form.ticker && (
                <p className="text-xs text-muted-foreground">
                  Selected: <strong className="text-foreground">{form.ticker}</strong>
                  {form.name && ` — ${form.name}`}
                </p>
              )}
            </div>

            {/* Shares */}
            <div className="space-y-2">
              <Label>Number of Shares *</Label>
              <Input
                type="number" min="0" step="any" placeholder="e.g. 8.7144"
                value={form.shares}
                onChange={(e) => setForm({ ...form, shares: e.target.value })}
              />
            </div>

            {/* Cost basis */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Average Cost per Share *</Label>
                <Input
                  type="number" min="0" step="any" placeholder="e.g. 601.75"
                  value={form.cost_basis_per_share}
                  onChange={(e) => setForm({ ...form, cost_basis_per_share: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cost Currency</Label>
                <Select
                  value={form.cost_basis_currency}
                  onValueChange={(v) => setForm({ ...form, cost_basis_currency: v as Currency })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <strong>Tip:</strong> Search by company name (e.g. &ldquo;Vanguard All World&rdquo;) and pick the right exchange from the dropdown — London (LSE), Amsterdam (AMS), Singapore (SES), etc.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete holding?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove the position from your portfolio.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

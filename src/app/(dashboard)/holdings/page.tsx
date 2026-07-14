'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { formatCurrency, formatPercent, formatShares, gainLossColor, gainLossBg } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react'
import { PageShell } from '@/components/ui/page-shell'
import { TLink } from '@/components/motion/TLink'
import { SubNav } from '@/components/ui/sub-nav'
import { SUB_NAVS } from '@/lib/nav-registry'
import { HeroBand, HeroMetric } from '@/components/ui/hero-band'
import { SectionLabel } from '@/components/ui/section-label'
import { TableScroll } from '@/components/ui/table-scroll'
import { InlineNumberCell } from '@/components/holdings/InlineNumberCell'
import { CashHoldingsCard } from '@/components/holdings/CashHoldingsCard'
import { deleteWithUndo } from '@/lib/toast-undo'
import { useQuickAction } from '@/lib/quick-actions'
import type { Currency, Holding, HoldingFormData } from '@/types'
import { CURRENCY_CODES } from '@/types'
import type { SearchResult } from '@/app/api/search/route'

const CURRENCIES: Currency[] = CURRENCY_CODES
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
  useQuickAction('add-holding', openAdd)
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
    const upper = currency.toUpperCase() as Currency
    const mappedCurrency = CURRENCY_CODES.includes(upper) ? upper : 'USD'
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
    const row = enriched.find((h) => h.id === deleteId)
    setDeleteId(null)
    if (!row) return
    await deleteWithUndo({
      description: `Deleted ${row.ticker}`,
      remove: () => deleteHolding(row.id),
      restore: () => addHolding({
        ticker: row.ticker,
        name: row.name,
        shares: row.shares,
        cost_basis_per_share: row.cost_basis_per_share,
        cost_basis_currency: row.cost_basis_currency,
      }),
    })
  }

  const canSave = form.ticker.trim() && form.shares && form.cost_basis_per_share && !saving

  // Portfolio aggregates for the hero band.
  const priced = enriched.filter((h) => h.currentPrice > 0)
  const totalValue = enriched.reduce((s, h) => s + h.currentValueBase, 0)
  const todayChange = priced.reduce((s, h) => s + h.dayChange, 0)
  const prevValue = totalValue - todayChange
  const todayPct = prevValue > 0 ? (todayChange / prevValue) * 100 : 0
  const unrealised = priced.reduce((s, h) => s + h.gainLoss, 0)
  const costBasis = totalValue - unrealised
  const totalRetPct = costBasis > 0 ? (unrealised / costBasis) * 100 : 0
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${formatCurrency(n, base)}`

  const statusRight = (
    <span className="flex items-center gap-4">
      <span>positions <span className="text-foreground">{enriched.length}</span></span>
      <button onClick={openAdd} className="press flex items-center gap-1 hover:text-foreground">
        <Plus className="h-3.5 w-3.5" /> add
      </button>
    </span>
  )

  const footerHints = (
    <>
      <span><span className="text-accent">▸</span> <span className="text-foreground">g h</span> home · <span className="text-foreground">g r</span> rebalancer · <span className="text-foreground">g p</span> planner</span>
    </>
  )

  return (
    <PageShell screen="Invest" title="Holdings" statusRight={statusRight} footerHints={footerHints}>
    <div className="space-y-4">
      <SubNav links={[...SUB_NAVS.holdings]} />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <HeroBand>
          <HeroMetric
            big
            vtName="hero-invested"
            label={`Total invested · ${base}`}
            value={totalValue}
            format={(n) => formatCurrency(n, base)}
            delta={[
              <span key="u"><span className="text-muted-foreground">unrealised </span><span className={gainLossColor(unrealised)}>{signed(unrealised)}</span></span>,
              <span key="r"><span className="text-muted-foreground">return </span><span className={gainLossColor(unrealised)}>{formatPercent(totalRetPct)}</span></span>,
            ]}
          />
          <HeroMetric
            label="Today"
            value={todayChange}
            format={signed}
            delta={[<span key="p" className={gainLossColor(todayChange)}>{formatPercent(todayPct)}</span>]}
          />
          <HeroMetric
            label="Total return"
            value={unrealised}
            format={signed}
            delta={[<span key="p" className={gainLossColor(unrealised)}>{formatPercent(totalRetPct)}</span>]}
          />
        </HeroBand>
      </div>

      <CashHoldingsCard />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <SectionLabel right="[+] add">POSITIONS</SectionLabel>
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
            <TableScroll stickyFirstCol>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker / Name</TableHead>
                  <TableHead className="text-right" title="Click to edit">Shares</TableHead>
                  <TableHead className="text-right" title="Click to edit">Cost Basis</TableHead>
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
                      <TLink href={`/holdings/${encodeURIComponent(h.ticker)}`} className="group/link block" title="View price history & details">
                        <div className="font-semibold group-hover/link:text-accent group-hover/link:underline">{h.ticker}</div>
                        <div className="text-xs text-muted-foreground">{h.name ?? '—'}</div>
                      </TLink>
                    </TableCell>
                    <TableCell className="text-right">
                      <InlineNumberCell
                        value={h.shares}
                        format={(n) => formatShares(n)}
                        align="right"
                        ariaLabel={`Shares of ${h.ticker}`}
                        onSave={(v) => updateHolding(h.id, { shares: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <InlineNumberCell
                        value={h.cost_basis_per_share}
                        format={(n) => formatCurrency(n, h.cost_basis_currency)}
                        align="right"
                        ariaLabel={`Cost basis per share of ${h.ticker}`}
                        subline={<span>{h.cost_basis_currency}</span>}
                        onSave={(v) => updateHolding(h.id, { cost_basis_per_share: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {h.currentPrice > 0 ? (
                        <>
                          <div className="font-mono">{formatCurrency(h.currentPrice, h.priceCurrency)}</div>
                          <div className="text-xs text-muted-foreground">{h.priceCurrency}</div>
                        </>
                      ) : (
                        <span className="text-xs text-warn">Price unavailable</span>
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
                        <span className="text-xs text-warn">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(h)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="text-down hover:text-down"
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
            </TableScroll>
          )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
    </PageShell>
  )
}

'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { usePortfolio } from '@/context/PortfolioContext'
import { parseIbkrCsv, parseGenericCsv, type ParsedRow, type ParseResult } from '@/lib/ibkr-parser'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { formatCurrency, formatShares } from '@/lib/utils'
import { PosbImport } from '@/components/spending/PosbImport'
import type { Currency } from '@/types'

type Format = 'ibkr' | 'generic' | 'posb'

export default function ImportPage() {
  const router = useRouter()
  const { addTransactionsBulk } = usePortfolio()

  const [format, setFormat] = useState<Format>('ibkr')
  const [filename, setFilename] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [genericRows, setGenericRows] = useState<ParsedRow[] | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [tickerOverrides, setTickerOverrides] = useState<Record<number, string>>({})

  const allRows = useMemo(
    () => parseResult?.rows ?? genericRows ?? [],
    [parseResult, genericRows],
  )
  const importableRows = useMemo(
    () => allRows.map((r, i) => ({ row: r, index: i })).filter((x) => x.row.txn),
    [allRows],
  )

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setSuccess(null)
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    try {
      const text = await file.text()
      if (format === 'ibkr') {
        const result = parseIbkrCsv(text)
        setParseResult(result)
        setGenericRows(null)
        setSelectedIds(new Set(result.rows.map((r, i) => r.txn ? i : -1).filter((i) => i >= 0)))
      } else {
        const rows = parseGenericCsv(text)
        setGenericRows(rows)
        setParseResult(null)
        setSelectedIds(new Set(rows.map((r, i) => r.txn ? i : -1).filter((i) => i >= 0)))
      }
      setTickerOverrides({})
    } catch (err) {
      setError(`Failed to parse file: ${String(err)}`)
    }
  }

  const toggleRow = (idx: number) => {
    const next = new Set(selectedIds)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (selectedIds.size === importableRows.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(importableRows.map((x) => x.index)))
  }

  const handleImport = async () => {
    if (selectedIds.size === 0) return
    setImporting(true)
    setError(null)
    setSuccess(null)
    try {
      const txnsToImport = Array.from(selectedIds)
        .map((i) => {
          const row = allRows[i]
          if (!row?.txn) return null
          const override = tickerOverrides[i]
          return override ? { ...row.txn, ticker: override.toUpperCase().trim() } : row.txn
        })
        .filter((t): t is NonNullable<typeof t> => t !== null)
      const result = await addTransactionsBulk(txnsToImport)
      setSuccess(`Imported ${result.inserted} transaction${result.inserted === 1 ? '' : 's'}.`)
      setTimeout(() => router.push('/transactions'), 1500)
    } catch (err) {
      setError(`Import failed: ${String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  const counts = useMemo(() => {
    const total = allRows.length
    const importable = importableRows.length
    const skipped = total - importable
    const byType = { buy: 0, sell: 0, dividend: 0, split: 0 }
    for (const r of allRows) {
      if (r.txn) byType[r.txn.type]++
    }
    return { total, importable, skipped, byType }
  }, [allRows, importableRows])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Import</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Bring in investment trades from a broker, or spending from your POSB bank statement
        </p>
      </div>

      <Tabs value={format} onValueChange={(v) => { setFormat(v as Format); setParseResult(null); setGenericRows(null) }}>
        <TabsList>
          <TabsTrigger value="ibkr">Interactive Brokers</TabsTrigger>
          <TabsTrigger value="generic">Generic CSV</TabsTrigger>
          <TabsTrigger value="posb">Bank (POSB)</TabsTrigger>
        </TabsList>

        <TabsContent value="posb"><PosbImport /></TabsContent>

        <TabsContent value="ibkr" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interactive Brokers Activity Statement</CardTitle>
              <CardDescription>
                Generate one in IBKR Client Portal under <strong>Performance &amp; Reports → Statements →
                Activity</strong>. Pick the period (Year-to-date or Custom range) and download in CSV format.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal pl-5 text-sm space-y-1 text-muted-foreground">
                <li>In Client Portal, go to <em>Performance &amp; Reports → Statements</em></li>
                <li>Pick <em>Activity</em>, choose your period, set Format to <strong>CSV</strong></li>
                <li>Click <em>Run</em>, then <em>Download</em> the .csv file</li>
                <li>Upload it below — trades, dividends and splits will be auto-mapped</li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generic" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generic CSV format</CardTitle>
              <CardDescription>
                For any broker that lets you export to CSV. Header row required with these columns
                (case-insensitive): <code className="text-xs">ticker, type, date, shares, price, amount, currency, fees, notes</code>.
                Type is one of <code className="text-xs">buy / sell / dividend / split</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">{`ticker,type,date,shares,price,amount,currency,fees,notes
AAPL,buy,2024-03-15,10,170.45,0,USD,1.00,
AAPL,sell,2024-08-20,5,225.10,0,USD,1.00,Trim
VWRA,dividend,2024-12-15,0,0,12.45,USD,0,Q4`}</pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {format !== 'posb' && (
      <>
      {/* Upload */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2 flex-1 min-w-[280px]">
              <Label className="text-xs">Choose CSV file</Label>
              <Input type="file" accept=".csv,text/csv" onChange={handleFile} />
              {filename && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3 w-3" /> {filename}
                </p>
              )}
            </div>
          </div>
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}
          {success && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> {success} Redirecting…
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview & confirm */}
      {allRows.length > 0 && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
            <Stat label="Total rows" value={counts.total.toString()} />
            <Stat label="Importable" value={counts.importable.toString()} positive />
            <Stat label="Skipped" value={counts.skipped.toString()} muted />
            <Stat label="Buys / Sells" value={`${counts.byType.buy} / ${counts.byType.sell}`} />
            <Stat label="Divs / Splits" value={`${counts.byType.dividend} / ${counts.byType.split}`} />
          </div>

          {parseResult?.meta && Object.keys(parseResult.meta).length > 0 && (
            <Card>
              <CardContent className="pt-4 text-xs text-muted-foreground space-y-1">
                {parseResult.meta.accountId && <div>Account: <span className="font-mono text-foreground">{parseResult.meta.accountId}</span></div>}
                {parseResult.meta.period && <div>Period: <span className="text-foreground">{parseResult.meta.period}</span></div>}
                {parseResult.meta.statementType && <div>Type: <span className="text-foreground">{parseResult.meta.statementType}</span></div>}
                {parseResult.sectionsFound.length > 0 && (
                  <div>Sections: <span className="text-foreground">{parseResult.sectionsFound.join(', ')}</span></div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Review &amp; confirm</CardTitle>
                  <CardDescription>
                    Untick any rows you don&apos;t want. Edit the ticker if your local symbol differs (e.g. add <code>.SI</code> for SGX).
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={toggleAll}>
                    {selectedIds.size === importableRows.length ? 'Deselect all' : 'Select all'}
                  </Button>
                  <Button onClick={handleImport} disabled={selectedIds.size === 0 || importing}>
                    {importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…</> : <><Upload className="mr-2 h-4 w-4" /> Import {selectedIds.size}</>}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 w-8" />
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Ticker</th>
                      <th className="px-3 py-2 font-medium text-right">Shares</th>
                      <th className="px-3 py-2 font-medium text-right">Price</th>
                      <th className="px-3 py-2 font-medium text-right">Amount</th>
                      <th className="px-3 py-2 font-medium">Cur</th>
                      <th className="px-3 py-2 font-medium">Notes / Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRows.map((r, i) => {
                      const importable = !!r.txn
                      const selected = selectedIds.has(i)
                      const t = r.txn
                      const cur = (t?.currency as Currency) ?? 'USD'
                      return (
                        <tr key={i} className={`border-b border-border/50 last:border-0 ${importable ? '' : 'opacity-50'}`}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              disabled={!importable}
                              checked={selected}
                              onChange={() => toggleRow(i)}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">{t?.date ?? '—'}</td>
                          <td className="px-3 py-2 text-xs">
                            {t ? (
                              <span className={
                                t.type === 'buy' ? 'text-emerald-400' :
                                t.type === 'sell' ? 'text-red-400' :
                                t.type === 'dividend' ? 'text-amber-400' :
                                'text-sky-400'
                              }>{t.type}</span>
                            ) : <span className="text-muted-foreground">{r.source}</span>}
                          </td>
                          <td className="px-3 py-2">
                            {t ? (
                              <Input
                                className="h-7 w-24 text-xs"
                                value={tickerOverrides[i] ?? t.ticker}
                                onChange={(e) => setTickerOverrides({ ...tickerOverrides, [i]: e.target.value })}
                              />
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {t && t.shares > 0 ? formatShares(t.shares) : t?.split_ratio ? `×${t.split_ratio}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {t && t.price_per_share > 0 ? formatCurrency(t.price_per_share, cur) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {t && t.amount > 0 ? formatCurrency(t.amount, cur) : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs">{t?.currency ?? '—'}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[280px] truncate">
                            {t?.notes ?? r.reason ?? '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      </>
      )}
    </div>
  )
}

function Stat({ label, value, positive, muted }: { label: string; value: string; positive?: boolean; muted?: boolean }) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold tabular-nums ${positive ? 'text-emerald-400' : muted ? 'text-muted-foreground' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

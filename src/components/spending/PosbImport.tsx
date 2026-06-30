'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { parsePosbCsv, type BankParseResult } from '@/lib/posb-parser'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export function PosbImport() {
  const router = useRouter()
  const { accounts } = usePortfolio()
  const { categories, bulkInsertBankTransactions, categorize } = useSpending()
  const incomeId = categories.find((c) => c.name === 'Income')?.id

  const [filename, setFilename] = useState('')
  const [result, setResult] = useState<BankParseResult | null>(null)
  const [accountId, setAccountId] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [cats, setCats] = useState<Record<number, string>>({})  // index → category_id
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const rows = result?.rows ?? []
  const importable = useMemo(
    () => rows.map((r, i) => ({ r, i })).filter((x) => x.r.txn),
    [rows],
  )

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null); setSuccess(null)
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    try {
      const text = await file.text()
      const parsed = parsePosbCsv(text)
      setResult(parsed)
      if (!parsed.headerFound) {
        setError('Could not find a "Transaction Date" header row. Is this a POSB/DBS transaction CSV?')
      }
      // Pre-select all importable rows + auto-categorize.
      const sel = new Set<number>()
      const guesses: Record<number, string> = {}
      parsed.rows.forEach((row, i) => {
        if (!row.txn) return
        sel.add(i)
        // Dynamic categorize: user rules first, then built-in keywords.
        const cid = categorize(row.txn.description, row.txn.merchant)
        if (cid) guesses[i] = cid
        else if (row.txn.amount >= 0 && incomeId) guesses[i] = incomeId
      })
      setSelected(sel)
      setCats(guesses)
      if (!accountId && accounts[0]) setAccountId(accounts[0].id)
    } catch (err) {
      setError(`Failed to parse file: ${String(err)}`)
    }
  }

  const toggle = (i: number) => {
    const next = new Set(selected)
    if (next.has(i)) next.delete(i); else next.add(i)
    setSelected(next)
  }
  const toggleAll = () => {
    if (selected.size === importable.length) setSelected(new Set())
    else setSelected(new Set(importable.map((x) => x.i)))
  }

  const handleImport = async () => {
    if (selected.size === 0) return
    setImporting(true); setError(null); setSuccess(null)
    try {
      const payload = Array.from(selected).map((i) => {
        const t = rows[i].txn!
        return {
          account_id: accountId || null,
          date: t.date,
          description: t.description,
          merchant: t.merchant,
          amount: t.amount,
          currency: t.currency,
          category_id: cats[i] ?? null,
          source: 'csv' as const,
          external_id: t.external_id,
          notes: null,
        }
      })
      const { inserted } = await bulkInsertBankTransactions(payload)
      const skipped = payload.length - inserted
      setSuccess(`Imported ${inserted} transaction${inserted === 1 ? '' : 's'}${skipped > 0 ? ` · ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped` : ''}.`)
      setTimeout(() => router.push('/spending'), 1600)
    } catch (err) {
      setError(`Import failed: ${String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">POSB / DBS transaction history</CardTitle>
          <CardDescription>
            In digibank, go to <strong>Transaction History</strong> for your account, set the date range,
            then <strong>Download → CSV</strong>. Upload it below. Credits import as income, debits as spend,
            and re-importing the same file won&apos;t create duplicates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2 flex-1 min-w-[260px]">
              <Label className="text-xs">Choose CSV file</Label>
              <Input type="file" accept=".csv,text/csv" onChange={handleFile} />
              {filename && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3 w-3" /> {filename}
                </p>
              )}
            </div>
            <div className="space-y-2 min-w-[180px]">
              <Label className="text-xs">Import into account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {accounts.length === 0 && (
            <p className="mt-3 text-xs text-amber-400">
              Add a POSB account first (Home → Accounts) so imported transactions have somewhere to live.
            </p>
          )}
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

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Review &amp; confirm</CardTitle>
                <CardDescription>{importable.length} importable · adjust categories before importing</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {selected.size === importable.length ? 'Deselect all' : 'Select all'}
                </Button>
                <Button onClick={handleImport} disabled={selected.size === 0 || importing}>
                  {importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…</> : <><Upload className="mr-2 h-4 w-4" /> Import {selected.size}</>}
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
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const t = r.txn
                    if (!t) {
                      return (
                        <tr key={i} className="border-b border-border/50 last:border-0 opacity-50">
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-xs">—</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[280px] truncate">{r.reason ?? 'Skipped'}</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2" />
                        </tr>
                      )
                    }
                    const isIncome = t.amount >= 0
                    return (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="cursor-pointer" />
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{t.date}</td>
                        <td className="px-3 py-2 text-xs max-w-[260px] truncate">{t.description}</td>
                        <td className="px-3 py-2">
                          <Select value={cats[i] ?? ''} onValueChange={(v) => setCats((c) => ({ ...c, [i]: v }))}>
                            <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue placeholder={isIncome ? 'Income' : 'Uncategorized'} /></SelectTrigger>
                            <SelectContent>
                              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums text-xs ${isIncome ? 'text-emerald-400' : ''}`}>
                          {isIncome ? '+' : ''}{formatCurrency(t.amount, t.currency)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

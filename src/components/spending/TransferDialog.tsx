'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { convertBetween } from '@/lib/calculations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowDown } from 'lucide-react'

function today() { return new Date().toISOString().slice(0, 10) }

// Move money between two of your own accounts (e.g. spending → savings).
// Cross-currency transfers pre-fill the received amount from live FX but the
// user can override it with what the bank actually credited.
export function TransferDialog({ open, onOpenChange, defaultFromId }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultFromId?: string | null
}) {
  const { accounts, fxRates } = usePortfolio()
  const { transferBetweenAccounts } = useSpending()

  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [received, setReceived] = useState('')
  const [receivedTouched, setReceivedTouched] = useState(false)
  const [date, setDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const fromAcc = accounts.find((a) => a.id === fromId)
  const toAcc = accounts.find((a) => a.id === toId)
  const crossCurrency = !!fromAcc && !!toAcc && fromAcc.currency !== toAcc.currency

  // Reset when (re)opened.
  useEffect(() => {
    if (!open) return
    setFromId(defaultFromId ?? accounts[0]?.id ?? '')
    setToId('')
    setAmount(''); setReceived(''); setReceivedTouched(false)
    setDate(today()); setNotes('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Keep the received amount synced to FX until the user edits it.
  const fxReceived = useMemo(() => {
    const amt = parseFloat(amount)
    if (!crossCurrency || !fxRates || isNaN(amt)) return null
    return convertBetween(amt, String(fromAcc!.currency), String(toAcc!.currency), fxRates)
  }, [amount, crossCurrency, fxRates, fromAcc, toAcc])

  useEffect(() => {
    if (!receivedTouched && fxReceived != null) setReceived(fxReceived.toFixed(2))
    if (!crossCurrency) { setReceived(''); setReceivedTouched(false) }
  }, [fxReceived, receivedTouched, crossCurrency])

  const valid = fromId && toId && fromId !== toId && parseFloat(amount) > 0 &&
    (!crossCurrency || parseFloat(received) > 0)

  const handleSave = async () => {
    if (!valid) return
    setSaving(true)
    try {
      await transferBetweenAccounts({
        fromAccountId: fromId,
        toAccountId: toId,
        amountFrom: parseFloat(amount),
        amountTo: crossCurrency ? parseFloat(received) : undefined,
        date,
        notes: notes.trim() || null,
      })
      onOpenChange(false)
    } catch {
      // toasted in context; keep dialog open to retry
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Transfer between accounts</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>From</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger><SelectValue placeholder="Source account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-center text-muted-foreground"><ArrowDown className="h-4 w-4" /></div>
          <div className="space-y-2">
            <Label>To</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger><SelectValue placeholder="Destination account" /></SelectTrigger>
              <SelectContent>
                {accounts.filter((a) => a.id !== fromId).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount{fromAcc ? ` (${fromAcc.currency})` : ''} *</Label>
              <Input type="number" step="any" min="0" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="500.00" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {crossCurrency && (
            <div className="space-y-2">
              <Label>Received ({toAcc!.currency}) — edit if your bank credited a different amount</Label>
              <Input type="number" step="any" min="0" value={received}
                onChange={(e) => { setReceived(e.target.value); setReceivedTouched(true) }} />
            </div>
          )}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Monthly savings" />
          </div>
          <p className="text-xs text-muted-foreground">
            Transfers are excluded from income and spending — they only move balances.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !valid}>
            {saving ? 'Transferring…' : 'Transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

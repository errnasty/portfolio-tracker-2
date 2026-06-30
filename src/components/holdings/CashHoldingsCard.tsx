'use client'

import { useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { formatCurrency } from '@/lib/utils'
import { convertToBase } from '@/lib/calculations'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InlineNumberCell } from '@/components/holdings/InlineNumberCell'
import { Coins, Plus, Trash2 } from 'lucide-react'
import type { Currency } from '@/types'

const CURRENCIES: Currency[] = ['SGD', 'USD', 'EUR']

// Cash sitting in the portfolio (e.g. un-deployed brokerage cash). Cash-type
// accounts are investable buying power and roll into net worth. Interactive
// Brokers transfers detected in spending land here automatically; balances are
// also inline-editable for manual tweaks.
export function CashHoldingsCard() {
  const { accounts, totalCashBase, settings, fxRates, addAccount, updateAccount, deleteAccount } = usePortfolio()
  const base = (settings?.base_currency ?? 'USD') as Currency
  const cash = [...accounts].filter((a) => a.type === 'cash').sort((a, b) => Number(b.current_balance) - Number(a.current_balance))

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('Cash')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('SGD')
  const [saving, setSaving] = useState(false)

  const add = async () => {
    const v = parseFloat(amount)
    if (!name.trim() || isNaN(v)) return
    setSaving(true)
    try {
      await addAccount({ name: name.trim(), type: 'cash', institution: null, currency, current_balance: v, is_active: true })
      setAdding(false); setName('Cash'); setAmount('')
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="h-4 w-4" /> Cash
            </CardTitle>
            <CardDescription>
              {cash.length === 0 ? 'Investable cash — Interactive Brokers transfers land here automatically'
                : `${formatCurrency(totalCashBase, base)} available to invest`}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Cash
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
            <Input className="h-8 w-36 text-sm" placeholder="Name (e.g. IBKR)" value={name} onChange={(e) => setName(e.target.value)} />
            <Input className="h-8 w-28 text-sm" type="number" step="any" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger className="h-8 w-20 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" className="h-8" onClick={add} disabled={saving || !name.trim() || !amount}>Add</Button>
          </div>
        )}

        {cash.length === 0 && !adding ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No cash tracked yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cash.map((a) => {
              const inBase = fxRates ? convertToBase(Number(a.current_balance), a.currency, fxRates) : 0
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2 group">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    {a.currency !== base && (
                      <div className="text-[10px] text-muted-foreground">≈ {formatCurrency(inBase, base)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <InlineNumberCell
                      value={Number(a.current_balance)}
                      format={(n) => formatCurrency(n, a.currency)}
                      align="right"
                      ariaLabel={`Balance of ${a.name}`}
                      subline={<span>{a.currency}</span>}
                      onSave={(v) => updateAccount(a.id, { current_balance: v })}
                    />
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => deleteAccount(a.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

import { useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { GmailCard } from '@/components/spending/GmailCard'
import type { Currency } from '@/types'

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
]

export default function SettingsPage() {
  const { settings, updateSettings } = usePortfolio()
  const [currency, setCurrency] = useState<Currency>((settings?.base_currency as Currency) ?? 'USD')
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    await updateSettings({ base_currency: currency })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-sm md:text-base text-muted-foreground">Configure your portfolio preferences</p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Display Currency</CardTitle>
          <CardDescription>All portfolio values will be shown in this currency using live FX rates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Base Currency</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSave}>
            {saved ? 'Saved!' : 'Save settings'}
          </Button>
        </CardContent>
      </Card>

      <GmailCard />
    </div>
  )
}

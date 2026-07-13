'use client'

import { useEffect, useState } from 'react'
import { usePortfolio } from '@/context/PortfolioContext'
import { PageShell } from '@/components/ui/page-shell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ForwardAddressCard } from '@/components/spending/ForwardAddressCard'
import { CategoryRulesCard } from '@/components/spending/CategoryRulesCard'
import type { Currency } from '@/types'
import { SUPPORTED_CURRENCIES } from '@/types'

const CURRENCIES: { value: Currency; label: string }[] =
  SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: c.label }))

export default function SettingsPage() {
  const { settings, updateSettings } = usePortfolio()
  const [currency, setCurrency] = useState<Currency>((settings?.base_currency as Currency) ?? 'USD')
  const [saved, setSaved] = useState(false)

  // settings loads async; sync the selector once it arrives so a saved
  // non-USD base currency isn't shown as USD on first paint.
  useEffect(() => {
    if (settings?.base_currency) setCurrency(settings.base_currency as Currency)
  }, [settings?.base_currency])

  const handleSave = async () => {
    await updateSettings({ base_currency: currency })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <PageShell screen="Plan" title="Settings" statusRight={<span>base=<span className="text-foreground">{currency}</span></span>}>
    <div className="space-y-4">
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

      <CategoryRulesCard />

      <ForwardAddressCard />
    </div>
    </PageShell>
  )
}

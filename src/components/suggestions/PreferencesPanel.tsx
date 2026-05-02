'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RotateCcw } from 'lucide-react'
import {
  CATEGORY_LABELS,
  DEFAULT_PREFERENCES,
  type SuggestionPreferences,
  type SuggestionCategory,
  type RiskProfile,
  type HomeBias,
} from '@/lib/suggestions'

interface Props {
  prefs: SuggestionPreferences
  onChange: (prefs: SuggestionPreferences) => void
  source: 'current' | 'planned'
  onSourceChange: (source: 'current' | 'planned') => void
  hasPlanner: boolean
  hasCurrent: boolean
}

const ALL_CATEGORIES: SuggestionCategory[] = [
  'concentration', 'geographic', 'sector', 'currency',
  'asset_mix', 'look_through', 'overlap', 'coverage', 'holdings_count',
]

export function PreferencesPanel({
  prefs, onChange, source, onSourceChange, hasPlanner, hasCurrent,
}: Props) {
  const update = <K extends keyof SuggestionPreferences>(key: K, val: SuggestionPreferences[K]) => {
    onChange({ ...prefs, [key]: val })
  }

  const toggleCategory = (cat: SuggestionCategory) => {
    const has = prefs.focusAreas.includes(cat)
    update('focusAreas', has ? prefs.focusAreas.filter((c) => c !== cat) : [...prefs.focusAreas, cat])
  }

  const handleReset = () => onChange(DEFAULT_PREFERENCES)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Preferences</CardTitle>
            <CardDescription>
              Tune what you care about — suggestions update live.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Source toggle */}
        <div className="space-y-2">
          <Label className="text-xs">Analyze</Label>
          <div className="flex gap-1 rounded-md bg-muted p-1 w-fit">
            <button
              type="button"
              onClick={() => onSourceChange('current')}
              disabled={!hasCurrent}
              className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
                source === 'current'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground disabled:opacity-50'
              }`}
            >
              Current portfolio
            </button>
            <button
              type="button"
              onClick={() => onSourceChange('planned')}
              disabled={!hasPlanner}
              className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
                source === 'planned'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground disabled:opacity-50'
              }`}
            >
              Planned portfolio
            </button>
          </div>
          {source === 'planned' && !hasPlanner && (
            <p className="text-[11px] text-amber-400">
              No planner positions yet — build one on the Planner page first.
            </p>
          )}
        </div>

        {/* Focus areas */}
        <div className="space-y-2">
          <Label className="text-xs">Focus areas</Label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_CATEGORIES.map((c) => {
              const active = prefs.focusAreas.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCategory(c)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => update('focusAreas', [...ALL_CATEGORIES])}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Select all
            </button>
            <span className="text-[11px] text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() => update('focusAreas', [])}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Profile + bias */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Risk profile</Label>
            <Select value={prefs.riskProfile} onValueChange={(v) => update('riskProfile', v as RiskProfile)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Affects sector recommendations</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Home bias</Label>
            <Select value={prefs.homeBias} onValueChange={(v) => update('homeBias', v as HomeBias)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (no bias)</SelectItem>
                <SelectItem value="us">US bias</SelectItem>
                <SelectItem value="eu">European bias</SelectItem>
                <SelectItem value="sg">Singapore bias</SelectItem>
                <SelectItem value="none">None / disable home-bias rules</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Match assets to your spending currency</p>
          </div>
        </div>

        {/* Thresholds */}
        <div className="space-y-2">
          <Label className="text-xs">Thresholds (caps)</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <ThresholdInput
              label="Max single position %"
              hint="Cap on any one ticker"
              value={prefs.maxSinglePositionPct}
              onChange={(v) => update('maxSinglePositionPct', v)}
              min={1} max={100} step={1}
            />
            <ThresholdInput
              label="Max look-through stock %"
              hint="Cap including ETF holdings"
              value={prefs.maxLookThroughStockPct}
              onChange={(v) => update('maxLookThroughStockPct', v)}
              min={1} max={100} step={1}
            />
            <ThresholdInput
              label="Max single sector %"
              hint="Cap on any one sector"
              value={prefs.maxSingleSectorPct}
              onChange={(v) => update('maxSingleSectorPct', v)}
              min={5} max={100} step={1}
            />
            <ThresholdInput
              label="Max single region %"
              hint="Cap on any one country/region"
              value={prefs.maxSingleRegionPct}
              onChange={(v) => update('maxSingleRegionPct', v)}
              min={5} max={100} step={1}
            />
            <ThresholdInput
              label="Max single currency %"
              hint="Cap on any one currency"
              value={prefs.maxSingleCurrencyPct}
              onChange={(v) => update('maxSingleCurrencyPct', v)}
              min={5} max={100} step={1}
            />
            <div className="grid grid-cols-2 gap-2">
              <ThresholdInput
                label="Min holdings"
                value={prefs.minHoldings}
                onChange={(v) => update('minHoldings', v)}
                min={1} max={50} step={1}
              />
              <ThresholdInput
                label="Max holdings"
                value={prefs.maxHoldings}
                onChange={(v) => update('maxHoldings', v)}
                min={1} max={100} step={1}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ThresholdInput({
  label, hint, value, onChange, min, max, step,
}: {
  label: string
  hint?: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(v)
        }}
        className="h-8 text-sm"
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

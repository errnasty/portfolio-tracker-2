'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { ChevronDown, AlertTriangle, AlertOctagon, Info, CheckCircle2 } from 'lucide-react'
import { CATEGORY_LABELS, type Suggestion, type SuggestionSeverity } from '@/lib/suggestions'

const SEVERITY_STYLES: Record<SuggestionSeverity, { ring: string; bg: string; text: string; icon: typeof Info; label: string }> = {
  critical: {
    ring: 'border-red-500/40',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    icon: AlertOctagon,
    label: 'Critical',
  },
  warning: {
    ring: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    icon: AlertTriangle,
    label: 'Warning',
  },
  info: {
    ring: 'border-sky-500/40',
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    icon: Info,
    label: 'Info',
  },
  positive: {
    ring: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    icon: CheckCircle2,
    label: 'Healthy',
  },
}

export function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const [open, setOpen] = useState(suggestion.severity === 'critical')
  const style = SEVERITY_STYLES[suggestion.severity]
  const Icon = style.icon

  return (
    <Card className={`overflow-hidden border ${style.ring}`}>
      {/* Header — always visible, click to toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/40"
      >
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${style.bg}`}>
          <Icon className={`h-4 w-4 ${style.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.bg} ${style.text}`}>
              {style.label}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {CATEGORY_LABELS[suggestion.category]}
            </span>
          </div>
          <h3 className="mt-1 text-sm font-semibold leading-tight">{suggestion.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{suggestion.summary}</p>
        </div>
        <ChevronDown
          className={`mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Body — expanded */}
      {open && (
        <div className="border-t border-border bg-muted/30 px-4 py-4 space-y-4">
          {/* Evidence */}
          {suggestion.evidence.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              {suggestion.evidence.map((e) => (
                <div key={e.label} className="rounded-md bg-background/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{e.label}</div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums truncate">{e.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Explanation */}
          {suggestion.explanation.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Why this matters
              </div>
              <div className="space-y-2 text-sm leading-relaxed">
                {suggestion.explanation.map((p, i) => (
                  <p key={i} className="text-foreground/90">{p}</p>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {suggestion.actions.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                What to consider
              </div>
              <ul className="space-y-1.5">
                {suggestion.actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${style.text.replace('text-', 'bg-')}`} />
                    <span className="text-foreground/90">{a.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

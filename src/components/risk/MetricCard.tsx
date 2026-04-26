'use client'

import { cn } from '@/lib/utils'

interface Props {
  label: string
  value: string
  hint?: string
  hintColor?: string
  tone?: 'positive' | 'negative' | 'neutral'
  size?: 'sm' | 'md' | 'lg'
}

export function MetricCard({ label, value, hint, hintColor, tone = 'neutral', size = 'md' }: Props) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-400'
      : tone === 'negative' ? 'text-red-400'
        : 'text-foreground'
  const sizeClass =
    size === 'lg' ? 'text-2xl md:text-3xl'
      : size === 'sm' ? 'text-base md:text-lg'
        : 'text-xl md:text-2xl'

  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4">
      <div className="text-[11px] md:text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className={cn('font-semibold tabular-nums mt-1', sizeClass, toneClass)}>
        {value}
      </div>
      {hint && (
        <div className={cn('text-[11px] mt-1', hintColor ?? 'text-muted-foreground')}>
          {hint}
        </div>
      )}
    </div>
  )
}

'use client'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/lib/useCountUp'

// The hero row: one dominant metric (1.6fr) + up to two siblings (1fr each).
export function HeroBand({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 border-b border-border md:grid-cols-[1.6fr_1fr_1fr]', className)}>
      {children}
    </div>
  )
}

export function HeroMetric({
  label, value, format, delta, sub, big, vtName, children,
}: {
  label: React.ReactNode
  value: number
  format: (n: number) => string
  delta?: React.ReactNode
  sub?: React.ReactNode
  big?: boolean            // the ONE dominant number on the screen
  vtName?: string          // view-transition-name for cross-route morphing
  children?: React.ReactNode // sparkline / progress slot
}) {
  const n = useCountUp(value)
  return (
    <div className="border-b border-border p-6 sm:p-7 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-3 font-bold leading-none tracking-tight tabular-nums text-foreground',
          big ? 'text-[clamp(2.5rem,5vw,3.5rem)]' : 'text-3xl',
        )}
        style={vtName ? ({ viewTransitionName: vtName } as React.CSSProperties) : undefined}
      >
        {format(n)}
      </div>
      {delta != null && <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-1 text-xs">{delta}</div>}
      {sub != null && <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>}
      {children}
    </div>
  )
}

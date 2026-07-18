'use client'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/lib/useCountUp'
import { useRef, useEffect } from 'react'

// The hero row: one dominant metric (1.6fr) + up to two siblings (1fr each).
export function HeroBand({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-5 md:grid-cols-[1.6fr_1fr_1fr]', className)}>
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
  big?: boolean
  vtName?: string
  children?: React.ReactNode
}) {
  const n = useCountUp(value)
  const prevValue = useRef(value)
  const pulseRef = useRef<HTMLDivElement>(null)

  // Trigger a subtle scale pulse when the value changes
  useEffect(() => {
    if (prevValue.current !== value && pulseRef.current) {
      pulseRef.current.classList.remove('animate-count-pulse')
      // Force reflow to restart animation
      void pulseRef.current.offsetWidth
      pulseRef.current.classList.add('animate-count-pulse')
    }
    prevValue.current = value
  }, [value])

  return (
    <div className="animate-scale-in rounded-[var(--radius)] border border-border bg-card p-5 md:p-7 transition-shadow duration-300 hover:shadow-[0_8px_30px_rgba(80,70,45,0.06)]">
      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</div>
      <div
        ref={pulseRef}
        className={cn(
          'mt-3 md:mt-3.5 font-display font-medium leading-none tracking-tight tabular-nums text-foreground',
          big ? 'text-[clamp(2rem,5vw,3.25rem)]' : 'text-[26px] md:text-[30px]',
        )}
        style={vtName ? ({ viewTransitionName: vtName } as React.CSSProperties) : undefined}
      >
        {format(n)}
      </div>
      {delta != null && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">{delta}</div>}
      {sub != null && <div className="mt-1.5 text-[13px] text-muted-foreground">{sub}</div>}
      {children}
    </div>
  )
}

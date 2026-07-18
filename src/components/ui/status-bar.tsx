import { cn } from '@/lib/utils'

// Aureus page header: mono section label + serif title, right-aligned actions.
// `screen` is the uppercase section (e.g. "Overview", "Money", "Invest", "Plan").
// `title` is the serif H1 (defaults to screen if not provided).
export function StatusBar({ screen, title, right, className }: {
  screen: string
  title?: string
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4 pb-5 pt-1 flex-wrap md:pb-7', className)}>
      <div>
        <div className="animate-slide-up font-mono text-[11px] uppercase tracking-[0.16em] text-faint">{screen}</div>
        <h1
          className="animate-slide-up mt-1.5 md:mt-2 font-display text-[26px] md:text-[34px] font-medium leading-none text-foreground"
          style={{ animationDelay: '60ms' }}
        >
          {title ?? screen}
        </h1>
      </div>
      {right != null && (
        <div
          className="animate-slide-up flex min-w-0 max-w-full flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground"
          style={{ animationDelay: '120ms' }}
        >
          {right}
        </div>
      )}
    </div>
  )
}

import { cn } from '@/lib/utils'

// Label + value row (transactions, positions, key/value lists).
export function StatRow({ label, value, sub, className }: {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 text-[13px] last:border-b-0', className)}>
      <div>
        <div className="text-foreground">{label}</div>
        {sub != null && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </div>
      <div className="shrink-0 font-semibold tabular-nums">{value}</div>
    </div>
  )
}

const DOT: Record<'up' | 'down' | 'cool' | 'warn', string> = {
  up: 'text-emerald-400', down: 'text-red-400', cool: 'text-sky-400', warn: 'text-amber-400',
}

// Timeline event row (home activity feed).
export function ActivityRow({ tone, when, text, amount }: {
  tone: 'up' | 'down' | 'cool' | 'warn'
  when: string
  text: React.ReactNode
  amount: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[64px_14px_1fr_auto] items-baseline gap-3 px-5 py-3 text-xs odd:bg-white/[0.015]">
      <span className="text-muted-foreground">{when}</span>
      <span className={DOT[tone]}>●</span>
      <span className="text-foreground">{text}</span>
      <span className="tabular-nums">{amount}</span>
    </div>
  )
}

// Budget category bar with over-budget marker.
export function BudgetBar({ label, spent, budget, over }: {
  label: React.ReactNode
  spent: number
  budget: number
  over?: boolean
}) {
  const pct = budget > 0 ? Math.max(0, Math.min(100, (spent / budget) * 100)) : 0
  const isOver = over ?? spent > budget
  return (
    <div className="px-5 py-2.5">
      <div className="flex justify-between text-xs">
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {spent.toLocaleString()} <span className="opacity-60">/ {budget.toLocaleString()}</span>
        </span>
      </div>
      <div className="relative mt-2 h-[5px] bg-border">
        <div className={cn('absolute inset-y-0 left-0', isOver ? 'bg-red-400' : 'bg-sky-400')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Allocation bar with target tick (holdings allocation rail).
export function AllocationBar({ label, pct, target }: {
  label: React.ReactNode
  pct: number
  target: number
}) {
  const over = pct > target
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums">
          <span className={cn('font-semibold', over ? 'text-red-400' : 'text-foreground')}>{pct.toFixed(1)}%</span>{' '}
          <span className="text-muted-foreground">/ {target}</span>
        </span>
      </div>
      <div className="relative mt-2 h-1.5 bg-border">
        <div className={cn('absolute inset-y-0 left-0', over ? 'bg-red-400' : 'bg-sky-400')} style={{ width: `${w}%` }} />
        <div className="absolute -bottom-0.5 -top-0.5 w-px bg-foreground" style={{ left: `${Math.min(100, target)}%` }} />
      </div>
    </div>
  )
}

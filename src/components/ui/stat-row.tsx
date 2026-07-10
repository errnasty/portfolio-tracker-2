import { cn } from '@/lib/utils'

// Label + value row
export function StatRow({ label, value, sub, className }: {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-[var(--hair)] px-6 py-3.5 text-[13px] last:border-b-0', className)}>
      <div>
        <div className="text-foreground">{label}</div>
        {sub != null && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </div>
      <div className="shrink-0 font-semibold tabular-nums">{value}</div>
    </div>
  )
}

const DOT: Record<'up' | 'down' | 'cool' | 'warn', string> = {
  up: 'text-up', down: 'text-down', cool: 'text-cool', warn: 'text-warn',
}

// Timeline event row (home activity feed)
export function ActivityRow({ tone, when, text, amount }: {
  tone: 'up' | 'down' | 'cool' | 'warn'
  when: string
  text: React.ReactNode
  amount: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[70px_14px_1fr_auto] items-center gap-3 border-b border-[var(--hair)] px-6 py-3.5 text-[13px] odd:bg-[var(--stripe)] last:border-b-0">
      <span className="text-faint">{when}</span>
      <span className={DOT[tone]}>●</span>
      <span className="text-foreground">{text}</span>
      <span className="tabular-nums font-semibold">{amount}</span>
    </div>
  )
}

// Budget category bar with over-budget marker
export function BudgetBar({ label, spent, budget, over }: {
  label: React.ReactNode
  spent: number
  budget: number
  over?: boolean
}) {
  const pct = budget > 0 ? Math.max(0, Math.min(100, (spent / budget) * 100)) : 0
  const isOver = over ?? spent > budget
  return (
    <div className="px-6 py-3">
      <div className="flex justify-between text-[13px]">
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {spent.toLocaleString()} <span className="opacity-60">/ {budget.toLocaleString()}</span>
        </span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-[3px] bg-[var(--hair)]">
        <div className={cn('absolute inset-y-0 left-0 rounded-[3px]', isOver ? 'bg-down' : 'bg-cool')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Allocation bar with target tick
export function AllocationBar({ label, pct, target }: {
  label: React.ReactNode
  pct: number
  target: number
}) {
  const over = pct > target
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div>
      <div className="flex justify-between text-[13px]">
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums">
          <span className={cn('font-semibold', over ? 'text-down' : 'text-foreground')}>{pct.toFixed(1)}%</span>{' '}
          <span className="text-muted-foreground">/ {target}</span>
        </span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-[3px] bg-[var(--hair)]">
        <div className={cn('absolute inset-y-0 left-0 rounded-[3px]', over ? 'bg-down' : 'bg-cool')} style={{ width: `${w}%` }} />
        <div className="absolute -bottom-0.5 -top-0.5 w-px bg-foreground" style={{ left: `${Math.min(100, target)}%` }} />
      </div>
    </div>
  )
}

import { cn } from '@/lib/utils'

// Console-style section header: "▸ LABEL  ·········  right".
export function SectionLabel({
  children, right, tone = 'accent', className,
}: {
  children: React.ReactNode
  right?: React.ReactNode
  tone?: 'accent' | 'cool' | 'mute'
  className?: string
}) {
  const toneClass = tone === 'cool' ? 'text-sky-400' : tone === 'mute' ? 'text-muted-foreground' : 'text-primary'
  return (
    <div className={cn('flex items-center justify-between border-b border-border px-3.5 py-2.5', className)}>
      <span className={cn('text-[11px] font-bold uppercase tracking-[0.12em]', toneClass)}>▸ {children}</span>
      {right != null && <span className="text-[10px] text-muted-foreground">{right}</span>}
    </div>
  )
}

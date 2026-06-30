import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Console-style section header: "▸ LABEL  ·········  right".
// Pass `href` to make the whole header a clickable drill-down into that tab.
export function SectionLabel({
  children, right, tone = 'accent', href, className,
}: {
  children: React.ReactNode
  right?: React.ReactNode
  tone?: 'accent' | 'cool' | 'mute'
  href?: string
  className?: string
}) {
  const toneClass = tone === 'cool' ? 'text-sky-400' : tone === 'mute' ? 'text-muted-foreground' : 'text-primary'
  const body = (
    <>
      <span className={cn('flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]', toneClass)}>
        ▸ {children}
        {href && <ArrowRight className="h-3 w-3 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />}
      </span>
      {right != null && <span className="text-[10px] text-muted-foreground">{right}</span>}
    </>
  )
  const base = 'flex items-center justify-between border-b border-border px-3.5 py-2.5'
  if (href) {
    return (
      <Link href={href} className={cn(base, 'group transition-colors hover:bg-accent/40', className)}>
        {body}
      </Link>
    )
  }
  return <div className={cn(base, className)}>{body}</div>
}

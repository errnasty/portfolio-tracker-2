import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Aureus section header: mono uppercase label with warm hair border.
export function SectionLabel({
  children, right, tone = 'accent', href, className,
}: {
  children: React.ReactNode
  right?: React.ReactNode
  tone?: 'accent' | 'cool' | 'mute'
  href?: string
  className?: string
}) {
  const toneClass = tone === 'cool' ? 'text-cool' : tone === 'mute' ? 'text-faint' : 'text-[var(--accent)]'
  const body = (
    <>
      <span className={cn('font-mono text-[11px] font-medium uppercase tracking-[0.14em]', toneClass)}>
        {children}
        {href && <ArrowRight className="ml-1.5 inline h-3 w-3 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />}
      </span>
      {right != null && <span className="text-[12px] text-faint">{right}</span>}
    </>
  )
  const base = 'flex items-center justify-between border-b border-[var(--hair)] px-6 py-4'
  if (href) {
    return (
      <Link href={href} className={cn(base, 'group transition-colors hover:bg-[var(--stripe)]', className)}>
        {body}
      </Link>
    )
  }
  return <div className={cn(base, className)}>{body}</div>
}

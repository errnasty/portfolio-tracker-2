import { Card } from './card'
import { SectionLabel } from './section-label'
import { cn } from '@/lib/utils'

// Aureus section: SectionLabel header + body. When `href` is set
// the whole panel becomes a lift-on-hover drill-down.
export function Panel({ title, tone = 'accent', right, href, className, children }: {
  title: React.ReactNode
  tone?: 'accent' | 'cool' | 'mute'
  right?: React.ReactNode
  href?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn('overflow-hidden rounded-[var(--radius)] border border-border', href && 'lift', className)}>
      <SectionLabel tone={tone} right={right} href={href}>{title}</SectionLabel>
      <div>{children}</div>
    </Card>
  )
}

import { Card } from './card'
import { SectionLabel } from './section-label'
import { cn } from '@/lib/utils'

// A console section: SectionLabel header (▸ TITLE) + body. When `href` is set
// the whole panel becomes a lift-on-hover drill-down into a sub-screen.
export function Panel({ title, tone = 'accent', right, href, className, children }: {
  title: React.ReactNode
  tone?: 'accent' | 'cool' | 'mute'
  right?: React.ReactNode
  href?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn('overflow-hidden rounded-none border-x-0 border-b-0 border-t shadow-none', href && 'lift', className)}>
      <SectionLabel tone={tone} right={right} href={href}>{title}</SectionLabel>
      <div>{children}</div>
    </Card>
  )
}

'use client'

import { usePathname } from 'next/navigation'
import { TLink } from '@/components/motion/TLink'
import { cn } from '@/lib/utils'

// Horizontal link-tabs for pages that share one sidebar entry
// (e.g. Holdings · Transactions · Dividends). Keeps every route reachable
// while the sidebar stays uncluttered.
export function SubNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname()
  return (
    <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-border">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + '/')
        return (
          <TLink
            key={l.href}
            href={l.href}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              active
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {l.label}
          </TLink>
        )
      })}
    </div>
  )
}

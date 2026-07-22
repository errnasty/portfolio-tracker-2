'use client'

import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TLink } from '@/components/motion/TLink'
import { MOBILE_TABS } from '@/lib/nav-registry'
import { dispatchQuickAction } from '@/lib/quick-actions'
import { haptic } from '@/lib/haptics'

function tabActive(pathname: string, matches: string[]): boolean {
  return matches.some((m) => (m === '/dashboard' ? pathname === m : pathname.startsWith(m)))
}

// Fixed bottom tab bar for phones — thumb-reachable primary navigation, with
// a raised center "+" that opens quick-add. The hamburger drawer (Sidebar)
// still holds the full route list. Hidden on md+ where the rail is shown.
export function MobileTabBar() {
  const pathname = usePathname()
  const left = MOBILE_TABS.slice(0, 2)
  const right = MOBILE_TABS.slice(2)

  const TabLink = ({ href, label, icon: Icon, matches }: (typeof MOBILE_TABS)[number]) => {
    const active = tabActive(pathname, matches)
    return (
      <TLink
        href={href}
        onClick={() => {
          haptic('light')
          // Re-tapping the current tab scrolls back to the top — the native
          // app convention. The navigation itself is a no-op in that case.
          if (active) window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
        className={cn(
          'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10.5px] font-medium transition-colors [touch-action:manipulation]',
          active ? 'text-accent' : 'text-muted-foreground',
        )}
        aria-current={active ? 'page' : undefined}
      >
        {/* Active indicator: a short accent bar riding the top border. */}
        <span
          className={cn(
            'absolute inset-x-0 top-0 mx-auto h-0.5 w-8 rounded-full bg-accent transition-opacity duration-200',
            active ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden
        />
        <Icon className="h-5 w-5" />
        <span>{label}</span>
      </TLink>
    )
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      {left.map((t) => <TabLink key={t.href} {...t} />)}

      {/* Center quick-add */}
      <div className="flex w-16 shrink-0 items-start justify-center">
        <button
          aria-label="Quick add transaction"
          onClick={() => { haptic('medium'); dispatchQuickAction('add-expense') }}
          className="-mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform [touch-action:manipulation] active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {right.map((t) => <TabLink key={t.href} {...t} />)}
    </nav>
  )
}

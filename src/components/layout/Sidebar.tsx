'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { TLink } from '@/components/motion/TLink'
import { NAV_GROUPS, routesByGroup } from '@/lib/nav-registry'

function linkActive(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
}

// Grouped nav links. `labelMode="hover"` fades labels in only when the rail is
// expanded (desktop); `"always"` keeps them visible (mobile drawer).
function NavItems({ pathname, labelMode }: { pathname: string; labelMode: 'always' | 'hover' }) {
  const fade = labelMode === 'hover'
    ? 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
    : ''
  return (
    <nav className="no-scrollbar flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
      {NAV_GROUPS.map((g) => (
        <div key={g} className="flex flex-col gap-0.5">
          <div className={cn('whitespace-nowrap px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70', fade)}>
            {g}
          </div>
          {routesByGroup(g).map(({ href, label, icon: Icon }) => {
            const active = linkActive(pathname, href)
            return (
              <TLink
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-4 py-2.5 text-sm transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className={cn('whitespace-nowrap', fade)}>{label}</span>
              </TLink>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* Mobile top bar with hamburger */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-12 items-center justify-between border-b border-border bg-card px-3 md:hidden">
        <button
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">$</div>
          <span className="text-sm font-semibold">Financial tracker</span>
        </div>
        <div className="w-9" />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      {/* Desktop: slim icon rail that expands to labels on hover/focus. */}
      <aside
        className="group fixed left-0 top-0 z-50 hidden h-full w-14 flex-col border-r border-border bg-card py-4 transition-[width] duration-200 hover:w-56 focus-within:w-56 md:flex"
        style={{ viewTransitionName: 'rail' } as React.CSSProperties}
      >
        <div className="mb-4 flex items-center gap-3 px-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">$</div>
          <span className="whitespace-nowrap font-semibold opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">Financial tracker</span>
        </div>

        <NavItems pathname={pathname} labelMode="hover" />

        <div className="mt-auto flex flex-col gap-2 px-2 pt-2">
          <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <ThemeToggle />
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-border bg-card px-2 py-4 transition-transform duration-200 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-4 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">$</div>
            <span className="font-semibold">Financial tracker</span>
          </div>
          <button
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <NavItems pathname={pathname} labelMode="always" />

        <div className="mt-auto flex flex-col gap-2 px-2 pt-2">
          <ThemeToggle />
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}

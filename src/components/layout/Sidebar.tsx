'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Menu, X, Search } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { TLink } from '@/components/motion/TLink'
import { NAV_GROUPS, routesByGroup } from '@/lib/nav-registry'

function linkActive(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
}

function NavItems({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="no-scrollbar flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
      {NAV_GROUPS.map((g) => {
        const routes = routesByGroup(g)
        if (routes.length === 0) return null
        return (
          <div key={g} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1 pt-4 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
              {g}
            </div>
            {routes.map(({ href, label, icon: Icon }, idx) => {
              const active = linkActive(pathname, href)
              return (
                <TLink
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    'animate-nav-in flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[13.5px] font-medium leading-none transition-all duration-200',
                    active
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                      : 'text-[var(--ink)] hover:bg-[var(--accent-soft)] hover:translate-x-1',
                  )}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="whitespace-nowrap">{label}</span>
                </TLink>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

function SidebarLogo({ theme }: { theme: string | undefined }) {
  const isDark = theme === 'dark'
  return (
    <div className="flex items-center gap-3 px-2.5 pb-5 pt-1">
      <Image
        src={isDark ? '/aureus/face-gold.png' : '/aureus/face-ink.png'}
        alt="Aureus"
        width={46}
        height={46}
        className="shrink-0"
        priority
      />
      <div className="leading-tight">
        <div className="font-display text-[25px] text-foreground">Aureus</div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">Private wealth</div>
      </div>
    </div>
  )
}

function SearchField({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mx-1.5 mb-3.5 flex items-center gap-2 rounded-[10px] border border-border bg-[var(--hair)] px-3 py-2 text-[13px] text-faint transition-colors hover:border-faint"
    >
      <Search className="h-4 w-4" />
      <span className="flex-1 text-left">Search…</span>
      <span className="font-mono rounded border border-border bg-card px-1.5 py-0.5 text-[11px]">⌘K</span>
    </button>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setThemeState] = useState<string | undefined>(undefined)
  const [userInitials, setUserInitials] = useState('··')
  const [userName, setUserName] = useState('Loading…')

  useEffect(() => {
    // Read theme for logo swap
    const stored = localStorage.getItem('theme')
    setThemeState(stored || 'light')
    const interval = setInterval(() => {
      setThemeState(localStorage.getItem('theme') || 'light')
    }, 200)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Fetch the logged-in user's display name
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const meta = user.user_metadata ?? {}
      const raw = (meta.full_name as string) || (meta.name as string) || (meta.user_name as string) || user.email || 'User'
      setUserName(raw)
      const parts = raw.trim().split(/\s+/)
      const initials = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : raw.slice(0, 2).toUpperCase()
      setUserInitials(initials)
    })
  }, [])

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

  const openPalette = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-12 items-center justify-between border-b border-border bg-card px-3 md:hidden">
        <button aria-label="Open menu" onClick={() => setMobileOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Image src={theme === 'dark' ? '/aureus/face-gold.png' : '/aureus/face-ink.png'} alt="Aureus" width={28} height={28} />
          <span className="font-display text-base">Aureus</span>
        </div>
        <div className="w-9" />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      {/* Desktop: fixed 250px labelled sidebar */}
      <aside
        className="fixed left-0 top-0 z-50 hidden h-full w-[250px] flex-col border-r border-border bg-secondary px-3.5 py-5 md:flex"
        style={{ viewTransitionName: 'rail' } as React.CSSProperties}
      >
        <SidebarLogo theme={theme} />
        <SearchField onClick={openPalette} />
        <NavItems pathname={pathname} />

        <div className="mt-auto border-t border-border pt-3.5">
          <ThemeToggle />
          <div className="mt-3 flex items-center gap-2.5 px-2.5 py-1 text-[13px] text-muted-foreground">
            <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--accent-soft)] text-[12px] font-semibold text-[var(--accent)]">{userInitials}</div>
            <span>{userName}</span>
            <button onClick={handleSignOut} className="ml-auto text-xs text-faint transition-colors hover:text-foreground">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-border bg-secondary px-3.5 py-5 transition-transform duration-200 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-4 flex items-center justify-between px-2.5">
          <SidebarLogo theme={theme} />
          <button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
        <SearchField onClick={openPalette} />
        <NavItems pathname={pathname} onNavigate={() => setMobileOpen(false)} />

        <div className="mt-auto border-t border-border pt-3.5">
          <ThemeToggle />
          <button onClick={handleSignOut} className="mt-2 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
            <LogOut className="h-[18px] w-[18px]" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Briefcase, TrendingUp, Sliders, LogOut, Settings, PieChart, Activity, Menu, X, Beaker, Lightbulb, ListChecks, Coins, Target, Newspaper, FileText, Zap, Compass, Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/holdings', label: 'Holdings', icon: Briefcase },
  { href: '/transactions', label: 'Transactions', icon: ListChecks },
  { href: '/dividends', label: 'Dividends', icon: Coins },
  { href: '/performance', label: 'Performance', icon: TrendingUp },
  { href: '/analytics', label: 'Analytics', icon: PieChart },
  { href: '/risk', label: 'Risk', icon: Activity },
  { href: '/stress-test', label: 'Stress Test', icon: Zap },
  { href: '/signals', label: 'Signals', icon: Bell },
  { href: '/news', label: 'News', icon: Newspaper },
  { href: '/rebalancer', label: 'Rebalancer', icon: Sliders },
  { href: '/optimizer', label: 'Optimizer', icon: Compass },
  { href: '/planner', label: 'Planner', icon: Beaker },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/suggestions', label: 'Suggestions', icon: Lightbulb },
  { href: '/report', label: 'Report', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Lock body scroll when drawer open on mobile
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
      <div className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center justify-between border-b border-border bg-card px-3 md:hidden">
        <button
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            P
          </div>
          <span className="text-sm font-semibold">Portfolio</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — desktop: always visible. Mobile: drawer that slides in. */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-56 flex-col border-r border-border bg-card py-4 px-4 transition-transform duration-200 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold shrink-0">
              P
            </div>
            <span className="font-semibold">Portfolio</span>
          </div>
          <button
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 w-full overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto space-y-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            className="flex w-full items-center gap-3 justify-start px-2 text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>Sign out</span>
          </Button>
        </div>
      </aside>
    </>
  )
}

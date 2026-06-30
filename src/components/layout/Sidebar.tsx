'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Wallet, Repeat, Briefcase, TrendingUp, Sliders, LogOut, Settings,
  PieChart, Activity, Menu, X, Beaker, ListChecks, Coins, Target, FileText, Bell,
  ChevronDown, ChevronRight, PiggyBank,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

type NavLink = { href: string; label: string; icon: React.ElementType }
type NavGroup = { label: string; icon: React.ElementType; children: NavLink[] }
type NavEntry = NavLink | NavGroup
type NavSection = { label?: string; items: NavEntry[] }

const isGroup = (e: NavEntry): e is NavGroup => 'children' in e

const PORTFOLIO_GROUP: NavGroup = {
  label: 'Portfolio', icon: Briefcase, children: [
    { href: '/holdings', label: 'Holdings', icon: Briefcase },
    { href: '/performance', label: 'Performance', icon: TrendingUp },
    { href: '/analytics', label: 'Analytics', icon: PieChart },
    { href: '/risk', label: 'Risk', icon: Activity },
    { href: '/transactions', label: 'Transactions', icon: ListChecks },
    { href: '/dividends', label: 'Dividends', icon: Coins },
    { href: '/rebalancer', label: 'Rebalancer', icon: Sliders },
    { href: '/planner', label: 'Planner', icon: Beaker },
    { href: '/signals', label: 'Signals', icon: Bell },
    { href: '/report', label: 'Report', icon: FileText },
  ],
}

const SECTIONS: NavSection[] = [
  { items: [{ href: '/dashboard', label: 'Home', icon: LayoutDashboard }] },
  {
    label: 'Money', items: [
      { href: '/spending', label: 'Spending', icon: Wallet },
      { href: '/subscriptions', label: 'Subscriptions', icon: Repeat },
      { href: '/budgets', label: 'Budgets', icon: PiggyBank },
    ],
  },
  { label: 'Invest', items: [PORTFOLIO_GROUP] },
  {
    label: 'Plan', items: [
      { href: '/goals', label: 'Goals', icon: Target },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const portfolioHrefs = PORTFOLIO_GROUP.children.map((c) => c.href)

function linkActive(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const inPortfolio = portfolioHrefs.some((h) => pathname.startsWith(h))
  const [portfolioOpen, setPortfolioOpen] = useState(inPortfolio)

  useEffect(() => { setMobileOpen(false) }, [pathname])
  useEffect(() => { if (inPortfolio) setPortfolioOpen(true) }, [inPortfolio])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const linkClass = (active: boolean, indent = false) => cn(
    'flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition-colors',
    indent && 'pl-9 py-2',
    active
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  )

  const renderEntry = (entry: NavEntry) => {
    if (!isGroup(entry)) {
      const active = linkActive(pathname, entry.href)
      const Icon = entry.icon
      return (
        <Link key={entry.href} href={entry.href} className={linkClass(active)}>
          <Icon className="h-5 w-5 shrink-0" />
          <span>{entry.label}</span>
        </Link>
      )
    }
    const GroupIcon = entry.icon
    const Chevron = portfolioOpen ? ChevronDown : ChevronRight
    return (
      <div key={entry.label} className="flex flex-col">
        <button
          onClick={() => setPortfolioOpen((o) => !o)}
          aria-expanded={portfolioOpen}
          className={cn(
            'flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition-colors',
            inPortfolio && !portfolioOpen ? 'text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <GroupIcon className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-left">{entry.label}</span>
          <Chevron className="h-4 w-4 shrink-0" />
        </button>
        {portfolioOpen && entry.children.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={linkClass(linkActive(pathname, href), true)}>
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    )
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
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">$</div>
          <span className="text-sm font-semibold">Finance</span>
        </div>
        <div className="w-9" />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-56 flex-col border-r border-border bg-card py-4 px-4 transition-transform duration-200 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-5 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold shrink-0">$</div>
            <span className="font-semibold">Finance</span>
          </div>
          <button
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 w-full overflow-y-auto">
          {SECTIONS.map((section, i) => (
            <div key={section.label ?? `s${i}`} className="flex flex-col gap-1">
              {section.label && (
                <div className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section.label}
                </div>
              )}
              {section.items.map(renderEntry)}
            </div>
          ))}
        </nav>

        <div className="mt-auto space-y-2 pt-2">
          <ThemeToggle />
          <Button
            variant="ghost" size="sm"
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

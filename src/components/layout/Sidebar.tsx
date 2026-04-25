'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Briefcase, TrendingUp, Sliders, LogOut, Settings, PieChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/holdings', label: 'Holdings', icon: Briefcase },
  { href: '/performance', label: 'Performance', icon: TrendingUp },
  { href: '/analytics', label: 'Analytics', icon: PieChart },
  { href: '/rebalancer', label: 'Rebalancer', icon: Sliders },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-16 flex-col items-center border-r border-border bg-card py-4 md:w-56 md:items-start md:px-4">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold shrink-0">
          P
        </div>
        <span className="hidden font-semibold md:block">Portfolio</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 w-full">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
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
              <span className="hidden md:block">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <Button
        variant="ghost"
        size="sm"
        className="mt-auto flex w-full items-center gap-3 justify-start px-2 text-muted-foreground"
        onClick={handleSignOut}
      >
        <LogOut className="h-5 w-5 shrink-0" />
        <span className="hidden md:block">Sign out</span>
      </Button>
    </aside>
  )
}

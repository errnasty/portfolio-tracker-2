import {
  LayoutDashboard, Wallet, Repeat, Briefcase, TrendingUp, Sliders, Settings,
  PieChart, Activity, Beaker, ListChecks, Coins, Target, FileText, Bell, PiggyBank,
  Upload,
} from 'lucide-react'

export interface NavRoute {
  href: string
  label: string
  icon: React.ElementType
  group: NavGroup
  seq?: string
}

export const NAV_GROUPS = ['Overview', 'Money', 'Invest', 'Plan'] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

// Single source of truth for navigation — consumed by the Sidebar rail, the
// command palette, and the keyboard go-to sequences.
export const NAV_ROUTES: NavRoute[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, group: 'Overview', seq: 'g h' },

  { href: '/spending', label: 'Spending', icon: Wallet, group: 'Money', seq: 'g s' },
  { href: '/subscriptions', label: 'Subscriptions', icon: Repeat, group: 'Money' },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank, group: 'Money', seq: 'g b' },
  { href: '/import', label: 'Import', icon: Upload, group: 'Money' },

  { href: '/holdings', label: 'Holdings', icon: Briefcase, group: 'Invest', seq: 'g o' },
  { href: '/performance', label: 'Performance', icon: TrendingUp, group: 'Invest' },
  { href: '/analytics', label: 'Analytics', icon: PieChart, group: 'Invest' },
  { href: '/risk', label: 'Risk', icon: Activity, group: 'Invest' },
  { href: '/transactions', label: 'Transactions', icon: ListChecks, group: 'Invest' },
  { href: '/dividends', label: 'Dividends', icon: Coins, group: 'Invest' },
  { href: '/rebalancer', label: 'Rebalancer', icon: Sliders, group: 'Invest', seq: 'g r' },
  { href: '/planner', label: 'Planner', icon: Beaker, group: 'Invest', seq: 'g p' },
  { href: '/signals', label: 'Signals', icon: Bell, group: 'Invest' },
  { href: '/report', label: 'Report', icon: FileText, group: 'Invest' },

  { href: '/goals', label: 'Goals', icon: Target, group: 'Plan', seq: 'g g' },
  { href: '/settings', label: 'Settings', icon: Settings, group: 'Plan' },
]

// href -> nav route (for active-state + status-bar screen labels).
export const NAV_BY_HREF: Record<string, NavRoute> =
  Object.fromEntries(NAV_ROUTES.map((r) => [r.href, r]))

// "g h" -> "/holdings" etc, for the key-sequence hook.
export const NAV_SEQUENCES: Record<string, string> =
  Object.fromEntries(NAV_ROUTES.filter((r) => r.seq).map((r) => [r.seq!, r.href]))

export const routesByGroup = (group: NavGroup) => NAV_ROUTES.filter((r) => r.group === group)

import {
  LayoutDashboard, Wallet, Repeat, Briefcase, TrendingUp, Sliders, Settings,
  PieChart, Activity, Beaker, ListChecks, Coins, Target, FileText, Bell, PiggyBank,
  Upload, Banknote, CalendarClock, Users, BookOpen, Landmark, Vault,
} from 'lucide-react'

export interface NavRoute {
  href: string
  label: string
  icon: React.ElementType
  group: NavGroup
  seq?: string
  // Hidden routes stay reachable (command palette, sub-nav tabs, deep links)
  // but don't render in the sidebar — that's how it stays uncluttered.
  hidden?: boolean
}

export const NAV_GROUPS = ['Overview', 'Money', 'Invest', 'Plan'] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

// Single source of truth for navigation — consumed by the Sidebar rail, the
// command palette, and the keyboard go-to sequences.
export const NAV_ROUTES: NavRoute[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, group: 'Overview', seq: 'g h' },
  { href: '/guide', label: 'Guide', icon: BookOpen, group: 'Overview' },

  { href: '/spending', label: 'Spending', icon: Wallet, group: 'Money', seq: 'g s' },
  { href: '/accounts', label: 'Accounts', icon: Landmark, group: 'Money', seq: 'g a' },
  // Tabs under Accounts:
  { href: '/cpf', label: 'CPF', icon: PiggyBank, group: 'Money', hidden: true },
  { href: '/assets', label: 'Assets & debts', icon: Vault, group: 'Money', hidden: true },
  { href: '/networth', label: 'Net worth', icon: TrendingUp, group: 'Money', hidden: true },
  { href: '/income', label: 'Income', icon: Banknote, group: 'Money', seq: 'g i' },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank, group: 'Money', seq: 'g b' },
  { href: '/payments', label: 'Payments', icon: CalendarClock, group: 'Money', seq: 'g y' },
  // Tabs under Payments:
  { href: '/subscriptions', label: 'Subscriptions', icon: Repeat, group: 'Money', hidden: true },
  { href: '/people', label: 'People', icon: Users, group: 'Money', hidden: true },
  // Linked from Spending's status bar:
  { href: '/import', label: 'Import', icon: Upload, group: 'Money', hidden: true },

  { href: '/holdings', label: 'Holdings', icon: Briefcase, group: 'Invest', seq: 'g o' },
  { href: '/analytics', label: 'Analytics', icon: PieChart, group: 'Invest' },
  { href: '/rebalancer', label: 'Rebalancer', icon: Sliders, group: 'Invest', seq: 'g r' },
  { href: '/planner', label: 'Planner', icon: Beaker, group: 'Invest', seq: 'g p' },
  // Tabs under Holdings:
  { href: '/transactions', label: 'Transactions', icon: ListChecks, group: 'Invest', hidden: true },
  { href: '/dividends', label: 'Dividends', icon: Coins, group: 'Invest', hidden: true },
  // Tabs under Analytics:
  { href: '/performance', label: 'Performance', icon: TrendingUp, group: 'Invest', hidden: true },
  { href: '/risk', label: 'Risk', icon: Activity, group: 'Invest', hidden: true },
  { href: '/signals', label: 'Signals', icon: Bell, group: 'Invest', hidden: true },
  { href: '/report', label: 'Report', icon: FileText, group: 'Invest', hidden: true },

  { href: '/goals', label: 'Goals', icon: Target, group: 'Plan', seq: 'g g' },
  { href: '/settings', label: 'Settings', icon: Settings, group: 'Plan' },
]

// Link-tab rows for pages that share one sidebar entry (see SubNav).
export const SUB_NAVS = {
  accounts: [
    { href: '/accounts', label: 'Accounts' },
    { href: '/cpf', label: 'CPF' },
    { href: '/assets', label: 'Assets & debts' },
    { href: '/networth', label: 'Net worth' },
  ],
  holdings: [
    { href: '/holdings', label: 'Holdings' },
    { href: '/transactions', label: 'Transactions' },
    { href: '/dividends', label: 'Dividends' },
  ],
  analytics: [
    { href: '/analytics', label: 'Analytics' },
    { href: '/performance', label: 'Performance' },
    { href: '/risk', label: 'Risk' },
    { href: '/signals', label: 'Signals' },
    { href: '/report', label: 'Report' },
  ],
  payments: [
    { href: '/payments', label: 'Upcoming' },
    { href: '/subscriptions', label: 'Subscriptions' },
    { href: '/people', label: 'People' },
  ],
} as const

// Bottom tab bar for mobile (md:hidden). Five thumb-reachable destinations;
// the middle "+" is handled specially (opens quick-add, not a route). Each
// tab's `matches` lists the route prefixes that light it up, so a sub-page
// (e.g. /cpf under Accounts, /dividends under Invest) keeps the right tab active.
export interface MobileTab {
  href: string
  label: string
  icon: React.ElementType
  matches: string[]
}

export const MOBILE_TABS: MobileTab[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, matches: ['/dashboard'] },
  { href: '/spending', label: 'Spending', icon: Wallet, matches: ['/spending', '/import', '/budgets'] },
  { href: '/accounts', label: 'Accounts', icon: Landmark, matches: ['/accounts', '/cpf', '/assets', '/networth', '/insurance', '/income', '/payments', '/subscriptions', '/people'] },
  { href: '/holdings', label: 'Invest', icon: Briefcase, matches: ['/holdings', '/transactions', '/dividends', '/analytics', '/performance', '/risk', '/signals', '/report', '/rebalancer', '/planner'] },
]

// href -> nav route (for active-state + status-bar screen labels).
export const NAV_BY_HREF: Record<string, NavRoute> =
  Object.fromEntries(NAV_ROUTES.map((r) => [r.href, r]))

// "g h" -> "/holdings" etc, for the key-sequence hook.
export const NAV_SEQUENCES: Record<string, string> =
  Object.fromEntries(NAV_ROUTES.filter((r) => r.seq).map((r) => [r.seq!, r.href]))

// Sidebar shows only non-hidden routes; the command palette shows all.
export const routesByGroup = (group: NavGroup) =>
  NAV_ROUTES.filter((r) => r.group === group && !r.hidden)

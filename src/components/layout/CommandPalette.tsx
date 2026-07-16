'use client'
import { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  Moon, Sun, CornerDownLeft, Search, Plus, ArrowLeftRight, Users, CalendarClock,
  Briefcase, Target, RefreshCw, Compass, Banknote, ClipboardType,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { NAV_ROUTES } from '@/lib/nav-registry'
import { fuzzyScore } from '@/lib/fuzzy'
import { useViewTransitionRouter } from '@/components/motion/ViewTransitionProvider'
import { usePortfolio } from '@/context/PortfolioContext'
import { useSpending } from '@/context/SpendingContext'
import { dispatchQuickAction, triggerQuickAction, type QuickActionKind } from '@/lib/quick-actions'
import { startTour } from '@/components/layout/OnboardingTour'
import { formatCurrency, cn } from '@/lib/utils'
import { ASSET_KIND_META } from '@/types'
import { Landmark, Wallet } from 'lucide-react'
import type { Currency } from '@/types'

interface Item {
  key: string
  label: string
  hint: string
  icon: React.ElementType
  run: () => void
}

export function CommandPalette({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useViewTransitionRouter()
  const { theme, setTheme } = useTheme()
  const { refreshPrices, enriched, assets, settings } = usePortfolio()
  const { bankTransactions, resolveDescription } = useSpending()
  const base = (settings?.base_currency ?? 'USD') as Currency

  const items: Item[] = useMemo(() => {
    const routes: Item[] = NAV_ROUTES.map((r) => ({
      key: r.href, label: r.label, hint: r.group, icon: r.icon,
      run: () => navigate(r.href),
    }))
    const quick = (kind: QuickActionKind, href: string) => () =>
      triggerQuickAction(kind, href, navigate)
    const actions: Item[] = [
      { key: 'add-expense', label: 'Add expense (quick)', hint: 'Quick add', icon: Plus, run: () => dispatchQuickAction('add-expense') },
      { key: 'paste-transaction', label: 'Paste bank SMS / email', hint: 'Quick add', icon: ClipboardType, run: () => dispatchQuickAction('paste-transaction') },
      { key: 'add-income', label: 'Add income', hint: 'Quick add', icon: Banknote, run: quick('add-income', '/income') },
      { key: 'transfer', label: 'Transfer between accounts', hint: 'Quick add', icon: ArrowLeftRight, run: quick('transfer', '/spending') },
      { key: 'add-iou', label: 'Add IOU', hint: 'Quick add', icon: Users, run: quick('add-iou', '/people') },
      { key: 'add-payment', label: 'Add planned payment', hint: 'Quick add', icon: CalendarClock, run: quick('add-payment', '/payments') },
      { key: 'add-holding', label: 'Add holding', hint: 'Quick add', icon: Briefcase, run: quick('add-holding', '/holdings') },
      { key: 'add-goal', label: 'Add goal', hint: 'Quick add', icon: Target, run: quick('add-goal', '/goals') },
      {
        key: 'refresh-prices', label: 'Refresh prices', hint: 'Action', icon: RefreshCw,
        run: () => { refreshPrices(); toast.success('Refreshing prices…') },
      },
      { key: 'replay-tour', label: 'Replay the tour', hint: 'Action', icon: Compass, run: () => startTour() },
      {
        key: 'toggle-theme',
        label: theme === 'light' ? 'Switch to dark' : 'Switch to light',
        hint: 'Theme', icon: theme === 'light' ? Moon : Sun,
        run: () => setTheme(theme === 'light' ? 'dark' : 'light'),
      },
    ]
    return [...routes, ...actions]
  }, [navigate, theme, setTheme, refreshPrices])

  // Data search: holdings, assets, and recent transactions/payees. Only when
  // there's a query, so the default palette stays fast and short.
  const dataItems: Item[] = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    const out: Item[] = []

    for (const h of enriched) {
      if (`${h.ticker} ${h.name ?? ''}`.toLowerCase().includes(term)) {
        out.push({
          key: `h-${h.id}`, label: `${h.ticker} · ${formatCurrency(h.currentValueBase, base)}`,
          hint: 'Holding', icon: Briefcase, run: () => navigate(`/holdings/${encodeURIComponent(h.ticker)}`),
        })
      }
    }
    for (const a of assets) {
      if (a.name.toLowerCase().includes(term)) {
        const href = a.kind.startsWith('cpf_') ? '/cpf' : '/assets'
        out.push({
          key: `a-${a.id}`, label: `${a.name} · ${formatCurrency(Number(a.balance), a.currency)}`,
          hint: ASSET_KIND_META[a.kind]?.label ?? 'Asset', icon: Landmark, run: () => navigate(href),
        })
      }
    }
    // Distinct payees/descriptions from recent transactions.
    const seen = new Set<string>()
    for (const t of bankTransactions) {
      const label = resolveDescription(t)
      const norm = label.toLowerCase()
      if (!norm.includes(term) || seen.has(norm)) continue
      seen.add(norm)
      out.push({
        key: `t-${t.id}`, label: `${label} · ${formatCurrency(Number(t.amount), t.currency)}`,
        hint: 'Transaction', icon: Wallet, run: () => navigate(`/spending?txn=${t.id}`),
      })
      if (seen.size >= 8) break
    }
    return out.slice(0, 16)
  }, [q, enriched, assets, bankTransactions, resolveDescription, navigate, base])

  const results = useMemo(() => {
    const staticHits = items
      .map((it) => ({ it, s: fuzzyScore(it.label, q) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => b.s! - a.s!)
      .map((x) => x.it)
    return [...staticHits, ...dataItems]
  }, [items, q, dataItems])

  useEffect(() => { if (open) { setQ(''); setActive(0) } }, [open])
  useEffect(() => { setActive(0) }, [q])

  const choose = (it?: Item) => { if (!it) return; onOpenChange(false); it.run() }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] gap-0 overflow-hidden rounded-2xl border border-border p-0 shadow-2xl animate-pop-in" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-3 border-b border-[var(--hair)] px-5 py-4">
          <Search className="h-4 w-4 text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, actions, holdings, transactions…"
            className="flex-1 border-none bg-transparent text-[15px] outline-none placeholder:text-faint"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((v) => Math.min(results.length - 1, v + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((v) => Math.max(0, v - 1)) }
              else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
            }}
          />
          <span className="font-mono rounded border border-border bg-card px-1.5 py-0.5 text-[10.5px] text-faint">ESC</span>
        </div>
        <div className="max-h-[344px] overflow-y-auto p-2">
          {results.map((it, idx) => {
            const Icon = it.icon
            return (
              <button
                key={it.key}
                type="button"
                onMouseEnter={() => setActive(idx)}
                onClick={() => choose(it)}
                style={{ animationDelay: `${idx * 18}ms` }}
                className={cn(
                  'animate-slide-up flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-left text-[14px] transition-colors',
                  idx === active
                    ? 'bg-[var(--accent-soft)] font-semibold text-accent'
                    : 'text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{it.label}</span>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">{it.hint}</span>
                {idx === active && <CornerDownLeft className="h-3.5 w-3.5 text-faint" />}
              </button>
            )
          })}
          {results.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px] text-faint">No matches</div>
          )}
        </div>
        <div className="flex gap-4 border-t border-[var(--hair)] px-5 py-2.5 font-mono text-[10.5px] text-faint">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

'use client'
import { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun, CornerDownLeft, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { NAV_ROUTES } from '@/lib/nav-registry'
import { fuzzyScore } from '@/lib/fuzzy'
import { useViewTransitionRouter } from '@/components/motion/ViewTransitionProvider'
import { cn } from '@/lib/utils'

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

  const items: Item[] = useMemo(() => {
    const routes: Item[] = NAV_ROUTES.map((r) => ({
      key: r.href, label: r.label, hint: r.group, icon: r.icon,
      run: () => navigate(r.href),
    }))
    const actions: Item[] = [{
      key: 'toggle-theme',
      label: theme === 'light' ? 'Switch to dark' : 'Switch to light',
      hint: 'Theme', icon: theme === 'light' ? Moon : Sun,
      run: () => setTheme(theme === 'light' ? 'dark' : 'light'),
    }]
    return [...routes, ...actions]
  }, [navigate, theme, setTheme])

  const results = useMemo(() => {
    return items
      .map((it) => ({ it, s: fuzzyScore(it.label, q) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => b.s! - a.s!)
      .map((x) => x.it)
  }, [items, q])

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
            placeholder="Search pages and actions…"
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
                    ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent)]'
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

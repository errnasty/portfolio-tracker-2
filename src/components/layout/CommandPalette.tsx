'use client'
import { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun, CornerDownLeft } from 'lucide-react'
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

// ⌘K / k command palette: fuzzy-jump to any route + a few quick actions.
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
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Jump to…"
          className="w-full border-b border-border bg-transparent px-4 py-3.5 text-sm outline-none placeholder:text-muted-foreground"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((v) => Math.min(results.length - 1, v + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((v) => Math.max(0, v - 1)) }
            else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
          }}
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.map((it, idx) => {
            const Icon = it.icon
            return (
              <li key={it.key}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(it)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                    idx === active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="text-foreground">{it.label}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">{it.hint}</span>
                  {idx === active && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </li>
            )
          })}
          {results.length === 0 && (
            <li className="px-4 py-8 text-center text-xs text-muted-foreground">No matches</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

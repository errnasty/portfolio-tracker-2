'use client'

import { useEffect, useState } from 'react'
import { CHANGELOG, LATEST_VERSION, SEEN_VERSION_KEY, entriesSince, type ChangelogEntry } from '@/lib/changelog'
import { startTour } from '@/components/layout/OnboardingTour'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { TLink } from '@/components/motion/TLink'
import { BookOpen, Compass, Sparkles } from 'lucide-react'

// Shows once per app update (and a welcome variant on first-ever visit).
// Tracks the last-seen changelog version in localStorage.
export function WhatsNewDialog() {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null)
  const [firstVisit, setFirstVisit] = useState(false)

  useEffect(() => {
    let seen: string | null = null
    try { seen = window.localStorage.getItem(SEEN_VERSION_KEY) } catch { return }
    if (seen === LATEST_VERSION) return
    setFirstVisit(!seen)
    // First-ever visit: welcome + everything current. Update: only new entries.
    setEntries(seen ? entriesSince(seen) : CHANGELOG.slice(0, 1))
  }, [])

  const dismiss = () => {
    try { window.localStorage.setItem(SEEN_VERSION_KEY, LATEST_VERSION) } catch { /* ignore */ }
    setEntries(null)
  }

  if (!entries || entries.length === 0) return null

  return (
    <Dialog open onOpenChange={(o) => { if (!o) dismiss() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            {firstVisit ? 'Welcome to Aureus' : "What's new"}
          </DialogTitle>
        </DialogHeader>

        {firstVisit && (
          <p className="text-sm text-muted-foreground">
            Everything financial in one place — spending, budgets, and your investment portfolio.
            The two-minute tour walks you through the app screen by screen.
          </p>
        )}

        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
          {entries.map((e) => (
            <div key={e.version}>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-sm font-semibold">{e.title}</span>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{e.version}</span>
              </div>
              <ul className="space-y-1.5">
                {e.items.map((item) => (
                  <li key={item.title} className="text-xs">
                    {item.href ? (
                      <TLink href={item.href} onClick={dismiss} className="font-medium text-foreground hover:text-accent">{item.title}</TLink>
                    ) : (
                      <span className="font-medium text-foreground">{item.title}</span>
                    )}
                    <span className="text-muted-foreground"> — {item.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="outline" size="sm" asChild>
            <TLink href="/guide" onClick={dismiss}><BookOpen className="mr-2 h-3.5 w-3.5" /> Open the guide</TLink>
          </Button>
          {firstVisit ? (
            <Button size="sm" onClick={() => { dismiss(); startTour() }}>
              <Compass className="mr-2 h-3.5 w-3.5" /> Show me around
            </Button>
          ) : (
            <Button size="sm" onClick={dismiss}>Got it</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

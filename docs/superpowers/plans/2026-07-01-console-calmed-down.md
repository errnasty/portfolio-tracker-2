# Console, Calmed Down — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the whole app to the "Console, calmed down" mockup — slim icon-rail + command palette + keyboard nav, all 18 routes on shared page primitives, seamless CSS + View-Transitions motion.

**Architecture:** Build a small reusable system first (motion utilities, `PageShell`/`HeroBand`/`Panel` primitives, `CommandPalette`, `KeyboardProvider`, slim-rail `Sidebar`), then migrate each route onto it. No new runtime deps; View Transitions are progressive enhancement over a reliable CSS base.

**Tech Stack:** Next 13.5 App Router, React 18, Tailwind 3, Radix (dialog/tabs/tooltip), recharts, lucide-react, vitest. Tokens already defined in `globals.css`.

**Verification vocabulary** (used throughout):
- Typecheck: `npx tsc --noEmit` → Expected: no errors.
- Unit: `npm run test -- <path>` → Expected: PASS.
- Build: `npm run build` → Expected: compiles.
- Lint: `npm run lint` → Expected: no new errors.
- Render check: `npm run dev`, open the route, confirm the described behaviour.

---

## File Structure

**New — motion**
- `src/lib/useCountUp.ts` — rAF count-up hook, reduced-motion aware.
- `src/components/motion/ViewTransitionProvider.tsx` — client nav wrapped in `document.startViewTransition`; exposes `useViewTransitionRouter()`.
- `src/components/motion/TLink.tsx` — `<Link>` that routes through the view-transition navigate.

**New — shell primitives**
- `src/components/ui/page-shell.tsx` — `PageShell` (status bar + footer hints + container + entrance).
- `src/components/ui/status-bar.tsx` — `StatusBar`.
- `src/components/ui/hero-band.tsx` — `HeroBand`, `HeroMetric`.
- `src/components/ui/panel.tsx` — `Panel`.
- `src/components/ui/stat-row.tsx` — `StatRow`, `ActivityRow`, `BudgetBar`, `AllocationBar`.

**New — navigation**
- `src/lib/nav-registry.ts` — single source of truth for routes/labels/icons/shortcuts (consumed by Sidebar, palette, keyboard).
- `src/lib/useKeySequences.ts` — key-sequence + hotkey hook.
- `src/components/layout/CommandPalette.tsx` — palette dialog.
- `src/components/layout/KeyboardProvider.tsx` — mounts palette + global shortcuts.
- `src/lib/fuzzy.ts` — tiny fuzzy match/score for the palette.

**Modified**
- `src/app/globals.css` — new motion utilities + view-transition CSS.
- `src/components/layout/Sidebar.tsx` — slim icon-rail; consume `nav-registry`.
- `src/app/(dashboard)/layout.tsx` — mount `ViewTransitionProvider` + `KeyboardProvider`.
- All 18 `src/app/(dashboard)/*/page.tsx` — migrate onto primitives (P1/P2).

---

# PHASE 0 — FOUNDATION

### Task 0.1: Motion CSS utilities

**Files:**
- Modify: `src/app/globals.css` (append to the `@layer utilities` block + reduced-motion query)

- [ ] **Step 1: Add utilities.** Append inside `@layer utilities`:

```css
  @keyframes dc-stagger-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes dc-shimmer { 100% { transform: translateX(100%); } }
  /* Stagger: children fade-up with incremental delay (set --i on each child). */
  .stagger > * { animation: dc-stagger-in 0.28s ease-out both; animation-delay: calc(var(--i, 0) * 40ms); }
  /* Skeleton shimmer sweep. */
  .shimmer { position: relative; overflow: hidden; }
  .shimmer::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, hsl(var(--foreground) / 0.06), transparent);
    animation: dc-shimmer 1.4s infinite; }
```

- [ ] **Step 2: Add view-transition CSS** at end of file:

```css
/* ── View Transitions ─────────────────────────────────────────────────────── */
@keyframes dc-vt-in { from { opacity: 0; transform: translateY(8px); } }
@keyframes dc-vt-out { to { opacity: 0; transform: translateY(-6px); } }
::view-transition-old(root) { animation: dc-vt-out 0.18s ease-in both; }
::view-transition-new(root) { animation: dc-vt-in 0.24s ease-out both; }
/* Named shared elements morph automatically via view-transition-name (set inline). */
```

- [ ] **Step 3: Extend reduced-motion query.** In the existing `@media (prefers-reduced-motion: reduce)` block, add:

```css
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
```

- [ ] **Step 4: Verify.** Build: `npm run build`. Expected: compiles.
- [ ] **Step 5: Commit.** `git add src/app/globals.css && git commit -m "feat(motion): stagger, shimmer, view-transition CSS utilities"`

---

### Task 0.2: `useCountUp` hook (TDD)

**Files:**
- Create: `src/lib/useCountUp.ts`
- Test: `src/lib/useCountUp.test.ts`

- [ ] **Step 1: Failing test.**

```ts
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { easeOutCubic, countUpValue } from './useCountUp'

describe('count-up math', () => {
  it('easeOutCubic maps 0→0 and 1→1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })
  it('countUpValue interpolates from→to by eased progress', () => {
    expect(countUpValue(100, 200, 0)).toBe(100)
    expect(countUpValue(100, 200, 1)).toBe(200)
    expect(countUpValue(0, 1000, 0.5)).toBeGreaterThan(500) // ease-out front-loads
  })
})
```

- [ ] **Step 2: Run — fails** (module missing). `npm run test -- src/lib/useCountUp.test.ts`
- [ ] **Step 3: Implement.**

```ts
'use client'
import { useEffect, useRef, useState } from 'react'

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const countUpValue = (from: number, to: number, p: number) =>
  from + (to - from) * easeOutCubic(p)

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Animates `value` from its previous value on change. Returns the current display number.
export function useCountUp(value: number, durationMs = 650): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const raf = useRef<number>()

  useEffect(() => {
    if (prefersReduced() || fromRef.current === value) { setDisplay(value); fromRef.current = value; return }
    const from = fromRef.current
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      setDisplay(countUpValue(from, value, p))
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [value, durationMs])

  return display
}
```

- [ ] **Step 4: Run — passes.** `npm run test -- src/lib/useCountUp.test.ts`
- [ ] **Step 5: Commit.** `git commit -am "feat(motion): useCountUp hook"`

---

### Task 0.3: `fuzzy` matcher (TDD)

**Files:**
- Create: `src/lib/fuzzy.ts`
- Test: `src/lib/fuzzy.test.ts`

- [ ] **Step 1: Failing test.**

```ts
import { describe, it, expect } from 'vitest'
import { fuzzyScore } from './fuzzy'

describe('fuzzyScore', () => {
  it('returns null when chars are missing/out of order', () => {
    expect(fuzzyScore('holdings', 'zzz')).toBeNull()
    expect(fuzzyScore('holdings', 'sdh')).toBeNull()
  })
  it('scores subsequence matches, prefix highest', () => {
    const prefix = fuzzyScore('holdings', 'hol')!
    const scattered = fuzzyScore('holdings', 'hds')!
    expect(prefix).toBeGreaterThan(scattered)
  })
  it('empty query matches with base score', () => {
    expect(fuzzyScore('anything', '')).toBe(0)
  })
})
```

- [ ] **Step 2: Run — fails.** `npm run test -- src/lib/fuzzy.test.ts`
- [ ] **Step 3: Implement.**

```ts
// Subsequence fuzzy score: null if `query` is not an in-order subsequence of `text`.
// Higher is better; consecutive and prefix matches are rewarded.
export function fuzzyScore(text: string, query: string): number | null {
  const t = text.toLowerCase(), q = query.toLowerCase()
  if (!q) return 0
  let ti = 0, score = 0, streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    let found = -1
    for (; ti < t.length; ti++) { if (t[ti] === q[qi]) { found = ti; break } }
    if (found === -1) return null
    streak = ti === 0 || (qi > 0 && t[found - 1] === q[qi - 1]) ? streak + 1 : 1
    score += 10 + streak * 5 - found // earlier + consecutive = better
    ti = found + 1
  }
  return score
}
```

- [ ] **Step 4: Run — passes.** `npm run test -- src/lib/fuzzy.test.ts`
- [ ] **Step 5: Commit.** `git commit -am "feat(nav): fuzzy matcher for command palette"`

---

### Task 0.4: `useKeySequences` hook (TDD on the reducer)

**Files:**
- Create: `src/lib/useKeySequences.ts`
- Test: `src/lib/useKeySequences.test.ts`

- [ ] **Step 1: Failing test** (pure sequence reducer):

```ts
import { describe, it, expect } from 'vitest'
import { advanceSequence } from './useKeySequences'

describe('advanceSequence', () => {
  const seqs = { 'g h': 'holdings', 'g s': 'spending' }
  it('matches a two-key sequence within window', () => {
    const s1 = advanceSequence({ buffer: [], at: 0 }, 'g', 1000, seqs)
    expect(s1.match).toBeUndefined()
    const s2 = advanceSequence(s1, 'h', 1200, seqs)
    expect(s2.match).toBe('holdings')
  })
  it('resets when the gap exceeds the window', () => {
    const s1 = advanceSequence({ buffer: [], at: 0 }, 'g', 1000, seqs)
    const s2 = advanceSequence(s1, 'h', 3000, seqs) // >1500ms later
    expect(s2.match).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — fails.** `npm run test -- src/lib/useKeySequences.test.ts`
- [ ] **Step 3: Implement** (export `advanceSequence` + a hook that binds it to `keydown`, ignoring inputs):

```ts
'use client'
import { useEffect, useRef } from 'react'

type SeqMap = Record<string, string>
export interface SeqState { buffer: string[]; at: number }
const WINDOW = 1500

export function advanceSequence(prev: SeqState, key: string, now: number, seqs: SeqMap): SeqState & { match?: string } {
  const buffer = now - prev.at > WINDOW ? [key] : [...prev.buffer, key]
  const joined = buffer.join(' ')
  if (seqs[joined]) return { buffer: [], at: now, match: seqs[joined] }
  const stillPossible = Object.keys(seqs).some((k) => k.startsWith(joined))
  return { buffer: stillPossible ? buffer : [key], at: now }
}

const editable = (el: EventTarget | null) => {
  const n = el as HTMLElement | null
  return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable)
}

// Binds go-to sequences to keydown. `onMatch` receives the mapped route href.
export function useKeySequences(seqs: SeqMap, onMatch: (href: string) => void) {
  const state = useRef<SeqState>({ buffer: [], at: 0 })
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || editable(e.target)) return
      if (e.key.length !== 1) return
      const next = advanceSequence(state.current, e.key.toLowerCase(), Date.now(), seqs)
      state.current = { buffer: next.buffer, at: next.at }
      if (next.match) { e.preventDefault(); onMatch(next.match) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [seqs, onMatch])
}
```

- [ ] **Step 4: Run — passes.** `npm run test -- src/lib/useKeySequences.test.ts`
- [ ] **Step 5: Commit.** `git commit -am "feat(nav): key-sequence hook"`

---

### Task 0.5: Nav registry

**Files:**
- Create: `src/lib/nav-registry.ts`

- [ ] **Step 1: Implement** — one source of truth (mirrors current `Sidebar` SECTIONS + adds `seq`):

```ts
import {
  LayoutDashboard, Wallet, Repeat, Briefcase, TrendingUp, Sliders, Settings,
  PieChart, Activity, Beaker, ListChecks, Coins, Target, FileText, Bell, PiggyBank,
} from 'lucide-react'

export interface NavRoute { href: string; label: string; icon: React.ElementType; group: string; seq?: string }

export const NAV_ROUTES: NavRoute[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, group: 'Overview', seq: 'g h' },
  { href: '/spending', label: 'Spending', icon: Wallet, group: 'Money', seq: 'g s' },
  { href: '/subscriptions', label: 'Subscriptions', icon: Repeat, group: 'Money' },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank, group: 'Money', seq: 'g b' },
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
  { href: '/import', label: 'Import', icon: ListChecks, group: 'Money' },
]

export const NAV_SEQUENCES: Record<string, string> =
  Object.fromEntries(NAV_ROUTES.filter((r) => r.seq).map((r) => [r.seq!, r.href]))

export const NAV_GROUPS = ['Overview', 'Money', 'Invest', 'Plan'] as const
```

- [ ] **Step 2: Verify.** `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Commit.** `git commit -am "feat(nav): central nav registry"`

---

### Task 0.6: ViewTransition provider + TLink

**Files:**
- Create: `src/components/motion/ViewTransitionProvider.tsx`, `src/components/motion/TLink.tsx`

- [ ] **Step 1: Provider.**

```tsx
'use client'
import { createContext, useCallback, useContext } from 'react'
import { useRouter } from 'next/navigation'

type Nav = (href: string) => void
const Ctx = createContext<Nav>(() => {})
export const useViewTransitionRouter = () => useContext(Ctx)

export function ViewTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const navigate = useCallback<Nav>((href) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void }
    if (doc.startViewTransition) doc.startViewTransition(() => router.push(href))
    else router.push(href)
  }, [router])
  return <Ctx.Provider value={navigate}>{children}</Ctx.Provider>
}
```

- [ ] **Step 2: TLink.**

```tsx
'use client'
import Link from 'next/link'
import { useViewTransitionRouter } from './ViewTransitionProvider'

export function TLink({ href, children, className, onClick, ...rest }:
  React.ComponentProps<typeof Link>) {
  const navigate = useViewTransitionRouter()
  return (
    <Link href={href} className={className}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.button !== 0) return
        e.preventDefault(); navigate(String(href))
      }} {...rest}>{children}</Link>
  )
}
```

- [ ] **Step 3: Verify.** `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 4: Commit.** `git commit -am "feat(motion): view-transition provider + TLink"`

---

### Task 0.7: StatusBar + PageShell

**Files:**
- Create: `src/components/ui/status-bar.tsx`, `src/components/ui/page-shell.tsx`

- [ ] **Step 1: StatusBar.**

```tsx
import { cn } from '@/lib/utils'

export function StatusBar({ screen, right, className }:
  { screen: string; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-6 border-b border-border bg-background px-5 py-2 text-[11px]', className)}>
      <span className="font-bold text-primary">PTRK ▸ {screen}</span>
      {right != null && <span className="ml-auto text-muted-foreground">{right}</span>}
    </div>
  )
}
```

- [ ] **Step 2: PageShell.**

```tsx
import { StatusBar } from './status-bar'

export function PageShell({ screen, statusRight, footerHints, children }: {
  screen: string; statusRight?: React.ReactNode; footerHints?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="animate-fade-up">
      <StatusBar screen={screen} right={statusRight} />
      <div className="stagger">{children}</div>
      {footerHints != null && (
        <div className="mt-6 flex justify-between border-t border-border px-5 py-2.5 text-[11px] text-muted-foreground">
          {footerHints}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify.** `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 4: Commit.** `git commit -am "feat(ui): PageShell + StatusBar"`

---

### Task 0.8: HeroBand + HeroMetric

**Files:**
- Create: `src/components/ui/hero-band.tsx`

- [ ] **Step 1: Implement.**

```tsx
'use client'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/lib/useCountUp'

export function HeroBand({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid border-b border-border', 'grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr]', className)}>
      {children}
    </div>
  )
}

export function HeroMetric({ label, value, format, delta, sub, big, vtName, children }: {
  label: React.ReactNode
  value: number
  format: (n: number) => string
  delta?: React.ReactNode
  sub?: React.ReactNode
  big?: boolean            // the ONE dominant number
  vtName?: string          // view-transition-name for cross-route morph
  children?: React.ReactNode // sparkline / progress slot
}) {
  const n = useCountUp(value)
  return (
    <div className="border-b border-border p-7 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={cn('mt-3 font-bold tabular-nums leading-none tracking-tight text-foreground',
        big ? 'text-[clamp(2.5rem,5vw,3.5rem)]' : 'text-3xl')}
        style={vtName ? { viewTransitionName: vtName } : undefined}>
        {format(n)}
      </div>
      {delta && <div className="mt-3.5 flex gap-6 text-xs">{delta}</div>}
      {sub && <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>}
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Verify.** `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Commit.** `git commit -am "feat(ui): HeroBand + HeroMetric with count-up"`

---

### Task 0.9: Panel + display bits

**Files:**
- Create: `src/components/ui/panel.tsx`, `src/components/ui/stat-row.tsx`

- [ ] **Step 1: Panel** (composes existing `Card` + `SectionLabel`):

```tsx
import { Card } from './card'
import { SectionLabel } from './section-label'
import { cn } from '@/lib/utils'

export function Panel({ title, tone = 'accent', right, href, className, children }: {
  title: React.ReactNode
  tone?: 'accent' | 'cool' | 'mute'
  right?: React.ReactNode
  href?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn('overflow-hidden rounded-none border-0 border-t', href && 'lift cursor-pointer', className)}>
      <SectionLabel tone={tone} right={right} href={href}>{title}</SectionLabel>
      <div>{children}</div>
    </Card>
  )
}
```

- [ ] **Step 2: Display bits** in `stat-row.tsx` — `StatRow`, `ActivityRow`, `BudgetBar`, `AllocationBar`. Concrete implementation (colors follow the grammar; `pct` clamped 0–100):

```tsx
import { cn } from '@/lib/utils'

export function StatRow({ label, value, sub, className }:
  { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between border-b border-border px-5 py-3.5 text-[13px] last:border-b-0', className)}>
      <div><div className="text-foreground">{label}</div>{sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export function ActivityRow({ tone, when, text, amount }:
  { tone: 'up' | 'down' | 'cool' | 'warn'; when: string; text: string; amount: React.ReactNode }) {
  const dot = { up: 'text-emerald-400', down: 'text-red-400', cool: 'text-sky-400', warn: 'text-amber-400' }[tone]
  return (
    <div className="grid grid-cols-[64px_14px_1fr_auto] items-baseline gap-3 px-5 py-3 text-xs odd:bg-white/[0.015]">
      <span className="text-muted-foreground">{when}</span>
      <span className={dot}>●</span>
      <span className="text-foreground">{text}</span>
      <span className="tabular-nums">{amount}</span>
    </div>
  )
}

export function BudgetBar({ label, spent, budget, over }:
  { label: React.ReactNode; spent: number; budget: number; over?: boolean }) {
  const pct = Math.max(0, Math.min(100, (spent / budget) * 100))
  return (
    <div className="px-5 py-2.5">
      <div className="flex justify-between text-xs"><span className="text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{spent.toLocaleString()} <span className="opacity-60">/ {budget.toLocaleString()}</span></span></div>
      <div className="relative mt-2 h-[5px] bg-border">
        <div className={cn('absolute inset-y-0 left-0', over ? 'bg-red-400' : 'bg-sky-400')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function AllocationBar({ label, pct, target }:
  { label: React.ReactNode; pct: number; target: number }) {
  const over = pct > target
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-foreground">{label}</span>
        <span className="tabular-nums"><span className={cn('font-semibold', over ? 'text-red-400' : 'text-foreground')}>{pct.toFixed(1)}%</span> <span className="text-muted-foreground">/ {target}</span></span></div>
      <div className="relative mt-2 h-1.5 bg-border">
        <div className={cn('absolute inset-y-0 left-0', over ? 'bg-red-400' : 'bg-sky-400')} style={{ width: `${w}%` }} />
        <div className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground" style={{ left: `${Math.min(100, target)}%` }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify.** `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 4: Commit.** `git commit -am "feat(ui): Panel + StatRow/ActivityRow/BudgetBar/AllocationBar"`

---

### Task 0.10: CommandPalette

**Files:**
- Create: `src/components/layout/CommandPalette.tsx`

- [ ] **Step 1: Implement** using existing `ui/dialog`, `nav-registry`, `fuzzyScore`, view-transition navigate. Open state controlled via props (`open`, `onOpenChange`). Filters `NAV_ROUTES` by `fuzzyScore(label, query)`, sorts desc, arrow-key highlight, Enter navigates, Esc closes. Include quick actions (`/import`, `/settings`, toggle theme via `next-themes`).

```tsx
'use client'
import { useMemo, useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { NAV_ROUTES } from '@/lib/nav-registry'
import { fuzzyScore } from '@/lib/fuzzy'
import { useViewTransitionRouter } from '@/components/motion/ViewTransitionProvider'

export function CommandPalette({ open, onOpenChange }:
  { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const navigate = useViewTransitionRouter()
  const results = useMemo(() =>
    NAV_ROUTES.map((r) => ({ r, s: fuzzyScore(r.label, q) }))
      .filter((x) => x.s !== null).sort((a, b) => (b.s! - a.s!)).map((x) => x.r), [q])
  useEffect(() => { if (open) { setQ(''); setI(0) } }, [open])
  useEffect(() => { setI(0) }, [q])
  const go = (href: string) => { onOpenChange(false); navigate(href) }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to…"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI((v) => Math.min(results.length - 1, v + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setI((v) => Math.max(0, v - 1)) }
            if (e.key === 'Enter' && results[i]) go(results[i].href)
          }}
          className="w-full bg-transparent px-4 py-3 text-sm outline-none border-b border-border" />
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.map((r, idx) => {
            const Icon = r.icon
            return (
              <li key={r.href}>
                <button onMouseEnter={() => setI(idx)} onClick={() => go(r.href)}
                  className={cnRow(idx === i)}>
                  <Icon className="h-4 w-4 shrink-0" /><span>{r.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{r.group}</span>
                </button>
              </li>
            )
          })}
          {results.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted-foreground">No matches</li>}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
const cnRow = (active: boolean) =>
  `flex w-full items-center gap-3 px-4 py-2.5 text-sm ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`
```

- [ ] **Step 2: Verify.** `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Commit.** `git commit -am "feat(nav): command palette"`

---

### Task 0.11: KeyboardProvider (wires palette + sequences)

**Files:**
- Create: `src/components/layout/KeyboardProvider.tsx`

- [ ] **Step 1: Implement.**

```tsx
'use client'
import { useCallback, useEffect, useState } from 'react'
import { CommandPalette } from './CommandPalette'
import { useKeySequences } from '@/lib/useKeySequences'
import { NAV_SEQUENCES } from '@/lib/nav-registry'
import { useViewTransitionRouter } from '@/components/motion/ViewTransitionProvider'

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const navigate = useViewTransitionRouter()
  useKeySequences(NAV_SEQUENCES, navigate)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const editable = (e.target as HTMLElement)?.tagName
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === 'k' && editable !== 'INPUT' && editable !== 'TEXTAREA')) {
        e.preventDefault(); setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])
  return <>{children}<CommandPalette open={open} onOpenChange={setOpen} /></>
}
```

- [ ] **Step 2: Verify.** `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Commit.** `git commit -am "feat(nav): keyboard provider wiring palette + sequences"`

---

### Task 0.12: Slim icon-rail Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Refactor** desktop `aside` to collapsed rail: base `w-14`, `hover:w-56 focus-within:w-56 transition-[width] duration-200`, `overflow-hidden`, `group`. Labels wrapped in `whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity`. Icons always visible. Consume `NAV_ROUTES`/`NAV_GROUPS` from `nav-registry` instead of the local `SECTIONS`. Adjust `layout.tsx` left padding from `md:pl-56` → `md:pl-14`. Keep the mobile drawer branch as-is. Active state stays yellow (`bg-primary text-primary-foreground`).
- [ ] **Step 2: Verify render.** `npm run dev` → rail shows icons; hovering expands to labels; active route highlighted; mobile hamburger still opens full drawer.
- [ ] **Step 3: Typecheck + build.** `npx tsc --noEmit && npm run build`. Expected: OK.
- [ ] **Step 4: Commit.** `git commit -am "feat(nav): slim icon-rail sidebar from nav-registry"`

---

### Task 0.13: Mount providers in dashboard layout

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1:** Wrap the `SpendingProvider` subtree with `ViewTransitionProvider` (outermost of the two motion providers) and `KeyboardProvider` (inside it, around `<div className="flex …">`). Change `main` padding to `md:pl-14`. Assign `style={{ viewTransitionName: 'rail' }}` on the sidebar wrapper and keep `key={pathname}` entrance on the content div.
- [ ] **Step 2: Verify.** `npm run dev` → `⌘K`/`k` opens palette; `g h` jumps to Holdings; navigation fades/morphs. `npm run build`. Expected: OK.
- [ ] **Step 3: Commit.** `git commit -am "feat: mount view-transition + keyboard providers; slim rail padding"`

**End of P0 gate:** rail + palette + shortcuts + motion all live; no page content changed yet.

---

# PHASE 1 — HERO SCREENS

**Migration recipe (apply to every page in P1/P2):**
1. Wrap the page body in `<PageShell screen="NAME" statusRight={…} footerHints={…}>`.
2. Replace the top metric cluster with `<HeroBand>` containing exactly one `big` `HeroMetric` (the dominant number, `vtName` set) + ≤2 secondary `HeroMetric`s.
3. Convert each content card to `<Panel title=… tone=… href=…>` using `StatRow`/`ActivityRow`/`BudgetBar`/`AllocationBar`.
4. Apply density caps (queue 3, activity 6, table 5 + "expand →", budgets 6); move overflow behind an "expand/all →" link to the sub-screen.
5. Verify: `npx tsc --noEmit`, render check, then commit `refactor(<page>): onto console page primitives`.

### Task 1.1: Home (`dashboard`)
**Files:** Modify `src/app/(dashboard)/dashboard/page.tsx`
- [ ] Hero: **Net worth** (big, `vtName="hero-net-worth"`) + Invested + Spent-this-month (progress slot). Left panel `▸ NEEDS YOUR ATTENTION` (≤3, `href` drill-downs). Right panel `▸ ACTIVITY · LAST 72h` (≤6 `ActivityRow` + legend + "all activity →"). Footer hints `g h · g s · g p`. Verify + commit.

### Task 1.2: Holdings
**Files:** Modify `src/app/(dashboard)/holdings/page.tsx`
- [ ] Hero: **Total invested** (big, `vtName="hero-invested"`) + Today + YTD. Body grid `1fr 320px`: `▸ POSITIONS` table (5 rows + "expand all →", 90d sparkline cell via recharts/inline svg) and `▸ ALLOCATION` aside using `AllocationBar` + rebalance CTA. Verify + commit.

### Task 1.3: Spending
**Files:** Modify `src/app/(dashboard)/spending/page.tsx`
- [ ] Hero: **Spent this month** (big, `vtName="hero-spent"`, daily mini-bars slot) + Income + Net saved. Two columns: `▸ BUDGETS` (6 `BudgetBar`) and `▸ RECENT TRANSACTIONS` (6 `StatRow` + "search /"). Verify + commit.

### Task 1.4: Planner
**Files:** Modify `src/app/(dashboard)/planner/page.tsx`
- [ ] Hero: **Years to FI** (big, `vtName="hero-fi"`) + Success probability + Range. `▸ NET WORTH PROJECTION` chart panel (keep recharts) + `▸ WHAT IF` three-lever grid. Verify + commit.

**P1 gate:** `npm run build` OK; the four mockup screens match 1:1; cross-route hero numbers morph in Chromium.

---

# PHASE 2 — REMAINING 14 ROUTES

Apply the migration recipe. One task each; commit per page. Hero number in **bold**.

- [ ] **2.1 Analytics** — hero **portfolio value / HHI concentration**; panels: allocation breakdown, sector/geo. 
- [ ] **2.2 Performance** — hero **total return %** (`vtName="hero-invested"` shared w/ Holdings); panels: TWR/IRR, period table, benchmark chart.
- [ ] **2.3 Risk** — hero **portfolio volatility / Sharpe**; panels: drawdown, factor exposure, correlation.
- [ ] **2.4 Transactions** — hero **net flow this month**; panel: filterable table (cap 20 + paginate), `/` search.
- [ ] **2.5 Dividends** — hero **TTM dividend income**; panels: upcoming, by-holding, yield.
- [ ] **2.6 Rebalancer** — hero **max drift %**; panels: proposed trades (cap), band table.
- [ ] **2.7 Signals** — hero **active alerts count**; panels: triggered (cap 6), rules.
- [ ] **2.8 Report** — hero **monthly net**; panels: summary, CSV export CTA (keep existing).
- [ ] **2.9 Subscriptions** — hero **annual subscription spend**; panels: active (cap), quiet/unused flag.
- [ ] **2.10 Budgets** — hero **total budget used %**; panels: per-category `BudgetBar` (cap 6 + all →).
- [ ] **2.11 Goals** — hero **top goal progress %**; panels: goal cards (cap 3), contributions.
- [ ] **2.12 Import** — hero **rows pending review**; panels: mapping, preview (keep existing logic).
- [ ] **2.13 Settings** — hero omitted (form page): wrap in `PageShell` only, `StatusBar screen="SETTINGS"`, group sections into `Panel`s.
- [ ] **2.14 Error/empty sweep** — ensure `(dashboard)/error.tsx` + loading states use `shimmer` skeletons.

**P2 gate:** every route renders through `PageShell`; `npm run build` OK; grep confirms no page defines its own ad-hoc top header.

---

# PHASE 3 — POLISH

- [ ] **3.1 Density audit** — verify each page has exactly one dominant number and caps hold; trim any panel exceeding its cap. Commit.
- [ ] **3.2 Empty/loading states** — `shimmer` skeleton for every async panel; friendly empty copy. Commit.
- [ ] **3.3 Reduced-motion QA** — with OS reduce-motion on: no transforms, count-up snaps, view-transitions disabled. Commit any fixes.
- [ ] **3.4 Non-Chromium fallback** — in Firefox/Safari confirm CSS fade path (no errors from missing `startViewTransition`). Commit any fixes.
- [ ] **3.5 Final** — `npm run test && npx tsc --noEmit && npm run build && npm run lint` all green. Commit.

---

## Self-Review

- **Spec coverage:** Nav shell → 0.5/0.10/0.11/0.12/0.13. Primitives → 0.7/0.8/0.9. Motion → 0.1/0.2/0.6 + view-transition CSS. All 18 routes → P1 (4) + P2 (13 pages incl. 12 routes) — note: 4 + 14 tasks cover the 18 routes plus error sweep. Principles/density → recipe + P3.1. Success criteria → P1/P2 gates + P3.
- **Placeholder scan:** logic tasks (0.2/0.3/0.4) ship full code + tests; presentational primitives ship full code; page migrations reference the concrete recipe + name their hero number and panels (not "similar to Task N").
- **Type consistency:** `useViewTransitionRouter()` returns `Nav = (href:string)=>void`, consumed by TLink/palette/keyboard. `fuzzyScore(text,query)` order consistent. `advanceSequence(prev,key,now,seqs)` matches test + hook. `HeroMetric` prop names (`value/format/big/vtName`) consistent across P1.

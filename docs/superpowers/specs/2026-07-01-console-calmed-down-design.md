# Console, calmed down — system-wide design refresh

Date: 2026-07-01
Status: Approved (brainstorming) → planning

## Goal

Bring the whole app in line with the `Design improvement/Portfolio Refresh.dc.html`
mockup ("Turn 03 · Console, calmed down"): same console identity, **~half the
density**, each screen leading with **one big number**, and navigation shifted to
a slim icon rail + command palette + keyboard shortcuts. Motion made "as seamless
as possible" via CSS + the View Transitions API.

The visual token system (bg `#06070a`, panel `#0c0d10`, rule `#1f2228`, text
`#ece8e1`, mute `#6a6e78`, yellow `#ffd166`, up `#6fcf97`, down `#ff7a59`, cool
`#6aa9ff`, JetBrains Mono + Geist) is **already in place** in `globals.css`. This
project is layout + navigation + motion, not a repaint.

## Locked decisions

- **Navigation:** slim icon-rail (expands on hover) + command palette + keyboard nav.
- **Scope:** all 18 dashboard routes.
- **Motion:** extend CSS utilities **and** add the browser View Transitions API
  (no runtime dependency; Chromium-native, graceful CSS fallback).
- **Structure:** shared-primitive system + phased migration (Approach A). No
  per-screen bespoke rebuilds; no new color system.

## Principles (from the mockup's "what changed" strip)

1. One big number per screen, supported by at most two siblings.
2. Half the density — cap lists: action queue 3, activity feed 6, tables 5 + "expand",
   budgets 6. Detail lives one click away in sub-screens, not on the overview.
3. Color grammar: **yellow** = portfolio / things-to-do, **blue** = spending / accounts,
   green = up, red = down.
4. Breathing room: generous padding, thin rules, mono tabular numerics.

## Architecture

### A. Navigation shell

| Piece | File (new/changed) | Behaviour |
|---|---|---|
| Slim icon rail | `src/components/layout/Sidebar.tsx` (refactor) | Collapsed `w-14` icon-only; expands to `w-56` label overlay on hover/focus-within. Groups + active-yellow preserved. Mobile hamburger drawer unchanged. |
| Command palette | `src/components/layout/CommandPalette.tsx` (new) | `⌘K` / `k` opens a fuzzy list over all 18 routes + quick actions (add txn, import, refresh prices, toggle theme). Hand-rolled filter + list, no `cmdk` dependency. Dialog reuses existing `ui/dialog`. |
| Keyboard nav | `src/components/layout/KeyboardProvider.tsx` + `useKeySequences` hook (new) | `g h`/`g s`/`g p`… go-to sequences; `k`/`⌘K` palette; `/` focus search; `?` shortcuts help. Ignores when focus is in an input/textarea/contenteditable. |
| Status bar | `src/components/layout/StatusBar.tsx` (new) | `PTRK ▸ <screen> · SGD · <date> · prices fresh Ns` + right-aligned "press k". Fed per page via `PageShell`. |
| Footer key-hints | part of `PageShell` | Contextual `g` shortcut strip at page bottom. |

### B. Page primitives (the reuse core — makes all-18 tractable)

| Primitive | File (new) | Purpose |
|---|---|---|
| `PageShell` | `src/components/ui/page-shell.tsx` | Wraps status bar + footer hints + max-width container + entrance animation. Props: `screen` label, `statusRight`, `footerHints`. Replaces each page's ad-hoc header. |
| `HeroBand` + `HeroMetric` | `src/components/ui/hero-band.tsx` | 1.6 / 1 / 1 responsive grid. `HeroMetric` = pill label + one big count-up number + delta row + optional sparkline. Structurally enforces "one big number, ≤2 siblings". |
| `Panel` | `src/components/ui/panel.tsx` | `Card` + existing `SectionLabel` header + body; adds `.lift` when a `href` drill-down is passed. |
| Display bits | `src/components/ui/*` | `StatRow`, `ActivityRow`, `BudgetBar`, `AllocationBar` — extracted so density caps and color grammar stay consistent across pages. |

Reuses existing: `Card`, `SectionLabel` (already renders `▸ LABEL` head), `MetricLabel`,
`Dialog`, `Button`.

### C. Motion / seamless layer (CSS + View Transitions)

- **Route entrance:** keep `animate-fade-up` keyed by pathname (already in layout);
  add a gentle exit variant.
- **View Transitions API:** `src/components/motion/ViewTransitionProvider.tsx` (new) wraps
  client navigation in `document.startViewTransition`. Assign `view-transition-name`
  to shared elements — the rail, the hero number, the status bar — so they **morph**
  across routes instead of hard-cutting. Capability-gated (`if (document.startViewTransition)`),
  CSS fade fallback otherwise. **Risk:** on Next 13.5 App Router, cross-route morph with
  RSC streaming is progressive-enhancement only; the CSS entrance is the reliable base and
  ships regardless.
- **In-page morphs:** tab switch, sort/filter, row expand wrapped in `startViewTransition`.
- **Count-up:** `src/lib/useCountUp.ts` (new) animates big numbers on mount/change; respects
  reduced-motion (snaps to final value).
- **Micro-interactions:** extend `.lift` / `.press`; add `.stagger` list-child entrance and
  a skeleton shimmer, all in `globals.css`.
- **Reduced motion:** `prefers-reduced-motion` is already honored globally; extend the media
  query to cover the new animations.

## Phasing

- **P0 — Foundation.** Motion layer (`ViewTransitionProvider`, `useCountUp`, CSS utils),
  shell primitives (`PageShell`, `HeroBand`/`HeroMetric`, `Panel`, display bits),
  `CommandPalette`, `KeyboardProvider`, slim-rail `Sidebar` refactor. Only visible change
  at end of P0: the rail + working palette/shortcuts.
- **P1 — Hero screens.** Home (`dashboard`), Holdings, Spending, Planner onto the primitives
  (1:1 with the mockup).
- **P2 — Remaining 14 routes.** analytics, budgets, dividends, goals, import, performance,
  rebalancer, report, risk, settings, signals, subscriptions, transactions — onto
  `PageShell` / `HeroBand` / `Panel`, in waves by nav group (Money, Invest, Plan).
- **P3 — Polish.** Density caps, empty states, consistency sweep, reduced-motion QA,
  non-Chromium fallback check.

## Non-goals

- No change to the color tokens / fonts (already correct).
- No `cmdk`, `framer-motion`, or other runtime UI deps.
- No data-model / backend changes — presentation only.
- No auth/routing structure changes beyond the nav shell.

## Success criteria

- Every route renders through `PageShell` with a single dominant number.
- `⌘K`/`k` palette and `g _` shortcuts navigate to all routes.
- Rail collapses to icons and expands on hover; mobile drawer still works.
- Cross-route navigation morphs (Chromium) or fades (fallback); no hard cut.
- `prefers-reduced-motion` disables transforms/animations everywhere.
- No new runtime dependency added to `package.json`.

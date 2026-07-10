# Aureus — Redesign Notes & UX Features (for Claude Code)

This document describes the redesign of the finance tracker (formerly the "Finance Console")
into **Aureus**, and lists the UX features to implement in the real Next.js codebase
(`errnasty/portfolio-tracker-2`).

The design prototypes live in:
- `Dashboard Directions.dc.html` — the 3 explored directions (Ledger / Meridian / Onyx).
- `Aureus.dc.html` (titled "Atlas" internally, now branded Aureus) — the redesigned app:
  Dashboard, Holdings, Spending, Analytics, with a light↔dark theme toggle.
- `Aureus Landing.dc.html` — the marketing / sign-up landing page.

---

## Design system (replaces the old "Console" theme)

Two coherent themes sharing one layout. Swap the CSS variables in `globals.css`
(`:root` = light, `.dark` = dark). Keep everything else token-driven.

**Light — "Ledger" (default)**
```
--bg #F6F3EC   --sidebar #FBFAF6   --card #FFFFFF
--ink #1B1A16  --muted #726C60     --faint #9A9384
--border #E7E1D5  --hair #EFEAE0
--accent #2E5E4E (forest green)  --accent-soft #EAF0EC
--up #2E7D5B  --down #B4552F  --cool #3C6E8F  --warn #C6923E
display font: Newsreader (serif) · UI font: Hanken Grotesk · mono: IBM Plex Mono
```

**Dark — "Onyx"**
```
--bg #0E0F13   --sidebar #101216   --card #16181E
--ink #ECEAE3  --muted #8B8C93     --faint #5E606A
--border #262A32  --hair #1C1F26
--accent #C6A96A (champagne gold)  --accent-soft rgba(198,169,106,.14)
--up #64C68C  --down #E0785B  --cool #74A7D8  --warn #D6B15E
display font: Spectral (serif) · UI font: Hanken Grotesk · mono: IBM Plex Mono
```

Radius `16px`. Large figures use the serif display font; labels use IBM Plex Mono
uppercase with letter-spacing. Body keeps `font-variant-numeric: tabular-nums`.

**Key intent vs. the old design:** more breathing room (28–32px card padding, 20px grid
gaps), friendlier (serif numbers, warm palette, no terminal `▸`/`PTRK` chrome), stronger
hierarchy (one dominant serif number per card), calmer color (muted accents, not neon).

---

## UX features added in the redesign — implement these

1. **Persisted theme toggle** *(done in prototype)*
   Light/Dark segmented control in the sidebar footer; choice saved to
   `localStorage['aureus-theme']` and restored on load. In the app, wire this into the
   existing `next-themes` provider (it already supports `class` strategy) and drop the
   old "dark-only console" assumption so light mode is a true first-class theme.

2. **Command palette / global search (⌘K)** *(entry point added in sidebar)*
   The repo already has `CommandPalette.tsx` + `KeyboardProvider.tsx`. Surface it with a
   visible search field at the top of the sidebar (placeholder + `⌘K` hint) so new users
   discover it — today it's keyboard-only and invisible.

3. **Neater, persistent sidebar**
   Replace the hover-to-expand slim rail with a fixed 250px labelled sidebar: grouped
   (Overview / Money / Invest / Plan) with mono uppercase group headers, consistent row
   rhythm, a single accent-soft pill for the active route, and a user chip + theme toggle
   pinned to the footer. Friendlier and less "techy" than the icon rail.

4. **One dominant metric per surface**
   Each page leads with a hero band: the primary number in the large serif display face
   with 1D/7D/30D deltas + a sparkline, then two supporting metrics. Improves scannability.

5. **"Needs your attention" action cards**
   Keep the deterministic alerts (drift, uncategorized txns, over-budget, subscriptions)
   but render them as calm bordered cards with a coloured left rule + primary CTA, capped
   at 3 — instead of dense console rows.

6. **Look-through analytics as horizontal bars + donuts**
   Replace cramped recharts blocks with roomy bar lists (geo / sector / currency) and a
   simple donut for asset type. Concentration shown as 4 big serif stats.

### Seamless-UX pass added to `Aureus Dashboard.dc.html` (this iteration)

10. **Working command palette (⌘K / ⌃K)** — the sidebar search field and the
    `⌘K` shortcut now open a real overlay palette. Type-to-filter across all pages
    (grouped Overview / Money / Invest / Plan) plus quick actions (Add position,
    Add transaction, Refresh prices, Switch theme, Sign out). Full keyboard control:
    ↑/↓ to move, ↵ to run, Esc to close; hover syncs the selection; the input
    auto-focuses on open. This turns the previously invisible, keyboard-only
    `CommandPalette.tsx` into a discoverable primary navigation surface.

11. **Animated page transitions** — switching screens now fades + rises the incoming
    section (`sectionIn` keyframe) instead of an instant display swap, so navigation
    reads as one continuous app rather than separate pages.

12. **Slide-over drawers for create actions** — "Add position" (Holdings) and
    "Add transaction" (Spending) open a right-hand slide-over with the correct
    context-specific fields, a dimmed backdrop, Cancel/Save, and Esc-to-close.
    Save confirms via a toast. Replaces dead buttons with real create flows.

13. **Toast notifications** — a single, theme-aware toast system confirms actions
    (Prices updated, Position/Transaction added, Signed out, Opening rebalancer…),
    auto-dismissing after ~2.6s. Gives every action immediate feedback.

14. **Live "Refresh prices"** — the header refresh is now a button that shows a
    spinning indicator + "Refreshing…" state, then stamps an "Updated just now"
    timestamp and fires a confirmation toast.

15. **Hover affordances everywhere** — nav rows, action buttons, the search field,
    "Execute"/"Review" attention CTAs, and drawer/palette items all have smooth
    hover/transition states so interactive elements feel tappable. "Execute" and
    "Review" on the attention cards now route (Review → Transactions).

16. **Functional month picker** (Spending) — the month chip opens a dropdown to
    switch the active period, with the selection reflected in the control.

> Implementation note for the Next.js app: these map onto existing primitives —
> #10 → `CommandPalette.tsx` + `KeyboardProvider.tsx`; #12 → a `Sheet`/`Dialog`;
> #13 → a toast/sonner provider; #11 → route-level `AnimatePresence` or CSS. State
> in the prototype is local; wire to the real stores/actions on integration.

### Nice-to-haves (not yet in prototype, recommended)
7. **Skeleton + empty states** in the new visual language (shimmer already exists).
8. **Reduced-motion & count-up** — keep `useCountUp` for hero numbers; honour
   `prefers-reduced-motion` (already handled in `globals.css`).
9. **Sticky page sub-header** with month picker (Spending) / add-position (Holdings)
   actions, replacing the old `StatusBar` strip.

---

## Landing page (`Aureus Landing.dc.html`) — new

A marketing/sign-up page for new users: gold-on-charcoal hero with a live product mock,
trust strip, 6-feature grid, look-through analytics spotlight, testimonial, and a 2-tier
pricing block (Personal free / Pro $9). Build as a public route (e.g. `app/(marketing)/page.tsx`)
outside the authed `(dashboard)` group; route unauthenticated users here instead of
straight to `/login`.

---

## Still TODO (deferred by user)
- Apply the Aureus theme to the remaining 13 pages (Performance, Risk, Transactions,
  Dividends, Rebalancer, Planner, Signals, Report, Subscriptions, Budgets, Import,
  Goals, Settings).
- Build real ⌘K search UI styling to match.
- Responsive/mobile pass for the fixed sidebar (drawer on < md).

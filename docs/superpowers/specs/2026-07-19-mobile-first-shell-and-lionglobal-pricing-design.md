# Mobile-first finance shell + LionGlobal auto-pricing — Design

**Date:** 2026-07-19
**Status:** Approved (brainstorming), pending spec review

## Goal

Redesign the app so a user who just wants to track their finances easily has a
simple, mobile-tailored experience. Keep all existing power-user pages reachable
but demoted behind an ellipsis/drawer menu. Separately, wire LionGlobal fund NAV
auto-pricing into the existing holdings price-provider system.

Approach chosen (from brainstorming): **Option A — simple mobile shell over the
existing app.** Core surfaces up front; the ~30 existing pages stay reachable and
grouped behind "More". Keep the current design system; restructure layout only.

## Existing infrastructure (do not rebuild)

The mobile shell is ~60% already built. Reuse, do not recreate:

- `src/components/layout/MobileTabBar.tsx` — fixed bottom bar, 4 tabs + raised
  center "+" that dispatches `add-expense`. Hidden on `md+`.
- `src/components/layout/QuickAddDialog.tsx` — the quick-add surface the "+" opens.
- `src/components/layout/Sidebar.tsx` — full route list; renders as a hamburger
  drawer on mobile. This **is** the "More" menu.
- `src/lib/nav-registry.ts` — single source of truth: `NAV_ROUTES`, `MOBILE_TABS`,
  `SUB_NAVS`, groups (Overview/Money/Invest/Plan).
- `src/lib/fund-providers.ts` — client-safe provider metadata list
  (`FUND_PROVIDER_LIST`); server fetch impls live in
  `src/lib/server/fund-scrapers/`.
- Holdings pricing columns already exist (added 2026-07):
  `price_source` (`auto`|`custom`), `custom_price`, `price_provider`, plus a
  documented **daily job + on-demand Refresh button** flow for provider-priced
  holdings.

No new tables or columns are required.

## 1. Navigation shell

Keep the 4-tab + raised-center-"+" pattern. It is good thumb UX; do not force a
literal 5th "More" tab.

- Bottom tab bar: `[Home] [Spending] (+) [Accounts] [Invest]` (current
  `MOBILE_TABS`). Unchanged in structure.
- "More" = the existing hamburger drawer (Sidebar), holding all ~30 routes
  grouped. Polish for touch: larger tap targets, clear group headers, comfortable
  spacing. Every non-core page remains reachable and unchanged in function.
- The tab bar's `matches` arrays already fold sub-pages under their parent tab
  (e.g. `/cpf`, `/networth` → Accounts) for active-state; keep as-is.

**Interface:** navigation config stays centralized in `nav-registry.ts`. Layout
components consume it; no route logic is duplicated.

## 2. Home screen — rebuild `/dashboard` mobile-first

Vertical card stack on mobile, approved order top→bottom:

1. **Net worth** — large number, small sparkline/trend, liquid vs locked split
   (reuse existing net-worth split logic/components).
2. **This month** — spent vs income, budget progress bar.
3. **Accounts strip** — horizontally scrollable balance chips.
4. **Recent activity** — last ~5 transactions.
5. **Quick links** — shortcuts into common More destinations.

Desktop retains its denser dashboard; mobile gets the stacked layout via
responsive breakpoints. Same data sources and underlying components — this is
layout restructuring, not a data-layer change.

**Isolation:** each home card is a self-contained component that takes already-
loaded portfolio/spending context as input and renders one concern. A card can be
reordered or hidden without touching the others.

## 3. Quick-add (+)

`+` already dispatches `add-expense` → `QuickAddDialog`. Refine into a mobile
bottom sheet:

- Amount-first: large, numpad-friendly amount field focused on open.
- Income/expense toggle.
- Category picker, account picker.
- Save writes an expense/income transaction via the existing insert path.

**Email-ingestion seam (future, blocked on domain setup):** route all transaction
creation — manual and future email-parsed — through one insert function that
accepts a `source` discriminator (e.g. `'manual' | 'email'`). Quick-add passes
`'manual'`. When email forwarding lands, the parser reuses the same function with
`'email'`. No schema change needed now; just ensure the insert path is a single,
reusable function rather than inline in the dialog.

## 4. LionGlobal auto-pricing (new provider)

Additive plug-in to the existing provider system. No new price plumbing.

**Endpoints (confirmed working, return XML):**

- Price: `https://api.lionglobalinvestors.com/fundlist?fname=&fcode=<CODE>&ftype=&cpage=&ctotal=`
  - `<f_code>` fund code, `<eng_lgi>` name, `<currency>`, `<nav>` unit price,
    `<dealdate>` NAV date.
- Optional trend: `https://api.lionglobalinvestors.com/foverview?fcode=<CODE>`
  - adds `<prev_nav>`, `<prev_diff>`, `<nav_last_update>`.

Example (`fcode=SST6`): `<nav>1.0620</nav>`, `<dealdate>2026-07-16</dealdate>`,
`<eng_lgi>LionGlobal Singapore Trust Fund Class O SGD (MDist)</eng_lgi>`.

**Changes:**

1. Add provider `lionglobal` to `FUND_PROVIDER_LIST` in `fund-providers.ts`
   (label + help text: "enter your LionGlobal fund code, e.g. SST6"). The ref
   field holds the fund code.
2. Add a server scraper `src/lib/server/fund-scrapers/lionglobal.ts` that fetches
   `fundlist`, parses the XML, and returns `{ price, currency, name, asOf }`.
   Use a lightweight XML parse (regex/`fast-xml-parser` — match whatever the
   other scrapers use; check before adding a dependency).
3. Register the provider in whatever dispatch map the daily job and the Refresh
   button already use, so provider-priced holdings with `price_provider =
   'lionglobal'` fetch through it. NAV writes to `custom_price`; `dealdate` can
   surface as the price "as of" date if the UI shows one.
4. **Refresh cadence (Option C):** Supabase cron daily (existing job picks up the
   new provider automatically once registered) + the existing manual Refresh
   button. No new cron to author if the daily job iterates all provider holdings.

**Error handling:** if the fetch fails or the code is unknown (empty `<funds>` /
no `<nav>`), leave the last known `custom_price` untouched and surface a
non-blocking error on manual refresh — mirror how existing providers report fetch
failures.

## 5. Housekeeping (required by CLAUDE.md)

- **Changelog:** new version entry at top of `src/lib/changelog.ts` — mobile home
  revamp + LionGlobal pricing, with deep-link hrefs.
- **Onboarding tour:** update `OnboardingTour.tsx` for the new mobile home and the
  "+" quick-add.
- **Guide:** update `src/app/(dashboard)/guide/page.tsx` with how to find a
  LionGlobal fund code and enable auto-pricing.
- **Nav registry:** no changes needed (tabs/groups already correct).
- **Schema:** no new tables/columns; provider columns already exist in both
  `supabase-schema.sql` and migrations.

## Out of scope (YAGNI)

- Email forwarding / parsing itself (blocked on domain; only the insert seam is
  built now).
- Restyling every one of the 30 pages (Option B) — only Home, the drawer polish,
  and quick-add change layout.
- Any new design system / theme refresh.
- Pruning or merging pages (Option C from scope question — rejected).

## Success criteria

- On a phone, a user lands on Home and sees net worth, this-month, accounts, and
  recent activity without scrolling far, and can log an expense in ≤3 taps via "+".
- All existing pages remain reachable via the drawer, grouped.
- A holding with a LionGlobal fund code auto-prices daily and on manual Refresh,
  matching the fund's published NAV.

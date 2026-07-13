# Aureus roadmap: fully track your financial life, effortlessly

Goal: track the user's **entire financial life as closely as possible**, and make **updating it as
easy as possible** — on both desktop and phone. Confirmed gaps in coverage: CPF, loans/debts,
crypto, fixed deposits / T-bills.

How to use this file: pick items in tier order (or follow the suggested batches at the bottom).
Check items off as they ship. Per repo convention (CLAUDE.md), every user-facing change must also
update `src/lib/changelog.ts`, the onboarding tour, the guide page, and the nav registry.

---

## Tier 0 — Fixes that undermine what's already shipped (do first, all Small)

- [ ] **0.1 Kill currency coercion.** `src/lib/ibkr-parser.ts` / the import page's `asCurrency`
  and the holdings add-dialog `CURRENCIES` list only accept USD/SGD/EUR and silently coerce
  everything else to USD. Replace with `CURRENCY_CODES` from `src/types` everywhere. A GBP/AUD
  position imported today is mis-denominated.
- [ ] **0.2 Goals should start from real net worth.** `src/app/(dashboard)/goals/page.tsx` seeds
  its Monte Carlo from holdings value only. Use `netWorthBase` (already in `PortfolioContext`),
  with a per-goal toggle "portfolio only / total net worth".
- [ ] **0.3 Planner what-ifs hardcode `$`.** `src/components/planner/FiForecastTab.tsx` labels say
  "+$1,000/mo" regardless of base currency; format with `formatCurrency(…, base)`.
- [ ] **0.4 Email parser `$` → SGD assumption.** Fine for DBS; document it and widen the currency
  map when adding more banks (see 1.4).

## Tier 1 — Effortless updating (biggest lever for "easy to update")

| # | Item | Why / How | Effort |
|---|------|-----------|--------|
| 1.1 | **Command palette actions** | The `Item.run` abstraction in `CommandPalette.tsx` already exists (only theme-toggle uses it). Add: *Add expense / income / transfer / IOU / planned payment / holding*, *Refresh prices*, *Replay tour*, *Jump to ticker*. Global `a` key opens quick-add. Cheapest high-value win in the codebase. | S |
| 1.2 | **Quick-add with smart parsing** | One input: type `14.50 lunch grab` → amount + description parsed, category auto-guessed via existing `categorize()`, account defaulted. One Enter to save from anywhere (palette + a mobile floating action button). | M |
| 1.3 | **Recurring transactions** | Salary, rent, allowance auto-post monthly. Reuse the `planned_payments` recurrence machinery (`advanceDate` in `src/lib/payments.ts`): add a `post_as_transaction` flag — when a due autopay payment passes, insert the bank transaction and advance the date (client-side on load, like the existing net-worth snapshot pattern). Gets salary in automatically without bank emails. | M |
| 1.4 | **More banks in email ingestion** | `parseDbsAlert` is one tolerant parser; refactor to a parser registry and add OCBC/UOB/credit-card alert formats (same webhook, same review queue). Each new bank is mostly regex + fixtures/tests (pattern: `src/lib/__tests__/dbs-email-parser.fixtures.test.ts`). | M per bank |
| 1.5 | **Review queue power-ups** | Bulk-confirm; "create rule from this row" (pre-filled `CategoryRulesCard` dialog); "apply rule retroactively" (batch update where description matches). Removes the last repetitive chore in categorization. | S–M |
| 1.6 | **Balance reconciliation** | On any account: "Set actual balance" → app computes the delta and books an adjustment transaction. Keeping balances truthful becomes a 5-second task. | S |
| 1.7 | **Import UX** | Drag-and-drop, and a column-mapping step for arbitrary bank CSVs (map Date/Description/Amount visually instead of requiring exact headers in `posb-parser.ts` / the generic parser). | M |

## Tier 2 — Complete picture (new asset & liability types)

| # | Item | Why / How | Effort |
|---|------|-----------|--------|
| 2.1 | **Assets & liabilities ledger** | New `assets` table: kind (`cpf_oa/cpf_sa/cpf_ma`, `loan`, `mortgage`, `fixed_deposit`, `tbill/ssb`, `property`, `other`), balance, currency, interest rate, maturity date, monthly contribution, notes. Net worth = accounts + holdings + assets − liabilities (extend `PortfolioContext.netWorthBase`). One page, one table, huge completeness win — unlocks 2.2–2.4. | M |
| 2.2 | **CPF specifics** | Start manual (three balances). Later: auto-post monthly contributions derived from Salary-category income (rates by age band), reusing the recurring-transaction engine (1.3). | S after 2.1 |
| 2.3 | **Loans with payoff view** | Amortization split (principal vs interest), projected payoff date, link the installment to `planned_payments` so it shows in Upcoming. | M after 2.1 |
| 2.4 | **FDs / T-bills maturity alerts** | Maturity dates feed the existing Payments "Upcoming" list (`buildUpcoming`) as "matures — decide reinvestment"; show accrued interest from rate. | S after 2.1 |
| 2.5 | **Crypto** | Yahoo already quotes `BTC-USD`/`ETH-USD`, so the existing `/api/prices` + holdings flow works as-is. Allow those tickers in the holdings dialog and classify `quoteType: CRYPTOCURRENCY` as its own asset class in analytics. | S |

## Tier 3 — Insights & alerts (the app tells *you* things)

| # | Item | Why / How | Effort |
|---|------|-----------|--------|
| 3.1 | **Expand "Needs your attention"** | The dashboard already derives 3 action types. Add: bills due/overdue (from `buildUpcoming`), budget pace breach (spend-curve data already computed on dashboard), balance gone negative, FD maturing, IOU stale > 60 days. One prioritized inbox for the whole financial life. | S–M |
| 3.2 | **Month-end digest** | Auto-generated monthly summary (narrative + numbers): income vs spend vs budget, top category movers (logic exists in `spending/page.tsx` `movers`), savings rate, net-worth delta, tithe status. Rendered as a page/card; reuse `portfolio-narrative.ts` style. | M |
| 3.3 | **Anomaly flags** | Unusually large transaction vs payee history, duplicate-charge suspicion (extend `findFuzzyDuplicate`), subscription price increase (`detectSubscriptions` already keeps per-merchant history). Surface via review queue + attention list. | M |
| 3.4 | **Cashflow forecast** | Project end-of-month balance: current balances + scheduled income/bills (1.3, payments) − average daily spend pace. Small chart on dashboard hero. | M |
| 3.5 | **Money flow (Sankey)** | Income sources → categories → savings for a month range; makes the whole system legible at a glance. | M |

## Tier 4 — Front-end & mobile polish

| # | Item | Why / How | Effort |
|---|------|-----------|--------|
| 4.1 | **PWA install** | Web manifest + icons + `viewport`/`themeColor` metadata in `src/app/layout.tsx` + minimal service worker. The responsive shell (sidebar drawer, `TableScroll`, responsive grids) already exists — this makes it a home-screen app on the phone. | S |
| 4.2 | **Mobile quick-entry FAB** | Floating + button on mobile → quick-add sheet (1.2). Phone entry becomes two taps. | S after 1.2 |
| 4.3 | **New-user dashboard** | Panels currently hide until data exists, leaving a sparse first-run page. Replace with guided empty-state cards ("Add your first account", "Forward a bank email") reusing `OnboardingTour` step content/links. | S |
| 4.4 | **Net worth page** | Full-size trend (daily snapshots exist in `networth_snapshots`, currently only a hero sparkline) with range selector + stacked composition (cash/investments/assets/liabilities — add composition columns to the daily snapshot writer). | M |
| 4.5 | **Global search in palette** | Search transactions/payees/tickers from ⌘K (client-side over loaded `bankTransactions` + the existing `/api/search`). | S–M |
| 4.6 | **Data health strip** | Yahoo Finance is a single point of failure; when quotes/FX fail the UI just goes blank. Add a small status indicator ("prices stale since …") using the existing fetch error paths. | S |

## Suggested sequencing

1. **Batch A (quick wins):** Tier 0 fixes + 1.1 palette actions + 4.1 PWA + 2.5 crypto + 1.6 reconciliation.
2. **Batch B (capture):** 1.2 quick-add + 1.3 recurring + 1.5 review-queue power-ups + 4.2 FAB.
3. **Batch C (completeness):** 2.1 assets/liabilities ledger + 4.4 net-worth page, then 2.2–2.4.
4. **Batch D (insights):** 3.1 attention inbox + 3.2 digest, then 3.3–3.5.
5. **Ongoing:** 1.4 one bank at a time; 1.7 import UX.

# Real Monte Carlo FI Planner + cross-domain Report

Date: 2026-07-01
Status: Approved (brainstorming) → planning

## Goal

Turn `/planner` from a portfolio-composition-only sandbox into one that also
answers "when can I stop working" using a real Monte Carlo simulation driven
by the user's actual financial data — not manually-typed assumptions. Extend
`/report` with the same cross-domain view (net worth + FI outlook) so the two
screens agree and both draw on the full financial picture (spending + net
worth + portfolio), not portfolio data alone.

## Context (what already exists)

- `src/lib/projection.ts` — tested (9 passing tests) GBM Monte Carlo engine:
  `monteCarlo(inputs, target?)` returns a percentile series (p5/p25/p50/p75/p95
  per month) plus `successRate` at the horizon. Also `monthsBetween`,
  `requiredMonthlyDeterministic`, `requiredMonthlyForSuccess`. **Not modified.**
- `/goals` already uses this engine per named goal, with **manually typed**
  inputs (target amount, monthly contribution, expected return %, expected
  vol %). Goals stays exactly as-is — it's for user-defined named targets
  (house downpayment, etc.); the new FI tab is the single "real data" forecast.
  Both share the same underlying engine; no duplication of simulation math.
- `PortfolioContext` already computes `netWorthBase = holdingsValueBase +
  accountsNetBase` (portfolio + cash/accounts combined) — this is the
  "cross-domain" starting value, already available, no new plumbing.
- `SpendingContext.statsForMonth(ym)` returns `{ income, expense, net,
  byCategory }` per month — the source for a real trailing savings rate.
- `src/lib/risk-metrics.ts` — `computeRiskMetrics()` returns `cagr` and
  `annualizedVol` from a real historical portfolio price series (already
  built by `/risk` via `buildPortfolioSeries`). Used as a real-data default
  for expected return/vol when history is long enough.
- `/planner` today: 4 tabs (Composition, vs Current [comparison], Look-through,
  Backtest) — a hypothetical-portfolio sandbox. Untouched by this design
  except for one new tab added first.
- `/report`: month-scoped Spending section + Portfolio section (holdings only,
  not net worth) + Geographic/Sector/Currency/Look-through breakdowns. Prints
  via `window.print()` with existing `print:` Tailwind variants + a `<style
  jsx global>` block.

## Decisions locked during brainstorming

1. **Composition tool**: kept, unchanged, moved to a non-default tab. Nothing
   removed.
2. **"Global"** = cross-domain **real data** (net worth + real savings rate +
   real portfolio return/vol feed the calc automatically). Nav placement
   unchanged (Planner/Report stay under the "Invest" sidebar group). Report's
   existing month-scoped Spending view is unchanged — the new sections are
   point-in-time (net worth) / forward-looking (FI), which sit naturally
   alongside a month-scoped section rather than replacing it.
3. **FI target** = auto-computed from real annual expenses × a safe-withdrawal
   multiple (default 4% → 25×), editable.
4. **Planner tab layout**: FI is a fully self-contained tab (like the other
   four) — no persistent cross-tab hero. Switching tabs replaces the whole
   panel.
5. **Report section placement**: **Net Worth** section added right after the
   report header (before Spending) — the "where you stand today" cover stat.
   **FI Outlook** section added at the very end (after the breakdown tables)
   — the forward-looking closing note.

## Architecture

### New file: `src/lib/fi.ts`

Four pure functions (small, focused, independently testable — no React,
no I/O):

```ts
// Average real net savings (income - expense) over the trailing N months.
// Returns null if referenceMonth and all months before it have zero
// income+expense (no data yet — see edge cases).
export function trailingMonthlyNetSavings(
  statsForMonth: (ym: string) => { income: number; expense: number; net: number },
  referenceMonth: string, // 'YYYY-MM'
  months?: number,        // default 3
): number | null

// Sum of real expense over the trailing N months (default 12) — the basis
// for the FI target. A longer window than the savings-rate average above,
// specifically to smooth out seasonal spending (e.g. annual insurance,
// holidays) rather than reacting to one unusually quiet or heavy month.
// Returns null under the same no-data condition as above.
export function trailingAnnualExpenses(
  statsForMonth: (ym: string) => { income: number; expense: number; net: number },
  referenceMonth: string,
  months?: number,        // default 12
): number | null

// FI target = annualExpenses * (100 / swrPct). swrPct=4 -> 25x multiple.
// Returns null when annualExpenses is null or <= 0.
export function fiTarget(annualExpenses: number | null, swrPct: number): number | null

// Walks a monteCarlo() ProjectionPoint[] to find the first month each
// percentile crosses `target`. Returns years (month/12), or null if that
// percentile never crosses within the series' horizon.
export function yearsToTarget(
  series: ProjectionPoint[],
  percentileKey: 'p5' | 'p50' | 'p95',
  target: number,
): number | null
```

`ProjectionPoint` is imported from `projection.ts` (existing type, unchanged).

### `/planner` changes

**File:** `src/app/(dashboard)/planner/page.tsx` (modify)

- `<Tabs defaultValue="fi">` (was `"composition"`). New
  `<TabsTrigger value="fi">Financial Independence</TabsTrigger>` inserted
  first; existing 4 triggers unchanged, just reordered after it.
- New `<TabsContent value="fi">` renders a new component:
  **`src/components/planner/FiForecastTab.tsx`** (new file) — keeps the page
  file from growing further, matches the existing pattern of extracting
  planner sub-views into `components/planner/*`.
- `FiForecastTab` inputs (computed in the tab, not the page, since nothing
  else in `/planner` needs them):
  - `startingValue` = `netWorthBase` (from `usePortfolio()`)
  - `monthlyContribution` = `trailingMonthlyNetSavings(statsForMonth, thisMonth())` (from `useSpending()`)
  - `expectedAnnualReturnPct` / `expectedAnnualVolPct` = from `computeRiskMetrics()`
    on the real portfolio series when ≥ 12 months of history exist, else a
    7% / 15% default — both are plain number inputs the user can edit (small
    disclosure, closed by default, matching the existing Goals form's number
    inputs).
  - `target` = `fiTarget(trailingAnnualExpenses(statsForMonth, thisMonth()), swrPct)`,
    `swrPct` defaults to 4 (editable).
- Runs `monteCarlo({ startingValue, monthlyContribution, expectedAnnualReturnPct,
  expectedAnnualVolPct, months: 480 }, target)` (480 months = 40 years) once
  per input change (memoized).
- Renders: `HeroBand` with 3 `HeroMetric`s (years-to-FI big, success
  probability, range) — reusing the existing P1 primitives — then the
  percentile-band chart (recharts, styled like the existing Backtest chart in
  the same file) with a dashed target line and a marker at the p50 crossing,
  then a 3-card "what if" row (save more / spend less / lower return) that
  re-runs `monteCarlo` with one input tweaked.

### `/report` changes

**File:** `src/app/(dashboard)/report/page.tsx` (modify)

- New `<Section title="Net worth">` inserted immediately after the header
  block, before the existing `Spending` section. Shows `netWorthBase`,
  `accountsNetBase` (cash/accounts), `holdingsValueBase` (portfolio) as three
  `SummaryStat`s — same component already used for the other sections.
- New `<Section title="Financial independence outlook">` appended after the
  existing Geographic/Sector/Currency/Look-through grid, before the closing
  disclaimer paragraph. Reuses `fi.ts` + `projection.ts` exactly as the
  Planner tab does (same inputs, same computation) — shows years-to-FI,
  success probability, target amount, and current progress %.
- Both new sections follow the existing `hasHoldings`/data-presence guards —
  don't render if there isn't enough underlying data (see edge cases below).
- No changes to the month picker, CSV export, or print styling.

## Data flow

```
PortfolioContext (netWorthBase, accountsNetBase, holdingsValueBase)
SpendingContext  (statsForMonth -> trailing savings, trailing annual expenses)
        │
        ▼
   src/lib/fi.ts  (trailingMonthlyNetSavings, trailingAnnualExpenses,
                   fiTarget, yearsToTarget)
        │
        ▼
src/lib/projection.ts monteCarlo()   (existing, untouched)
        │
        ├──► FiForecastTab  (/planner)
        └──► "Financial independence outlook" section (/report)
```

Both consumers call the same three `fi.ts` functions with the same real
inputs, so the numbers shown on Planner and Report always agree.

## Edge cases

- **Thin/no spending history** (new user): `trailingMonthlyNetSavings`
  returns `null` when there isn't at least 1 month of real data. Both
  consumers show an empty state ("add a few months of spending to see your
  FI forecast") instead of computing from zero.
- **Zero annual expenses**: `fiTarget` returns `null` (can't derive a
  meaningful target from no spending data) — same empty state as above.
- **Never crosses the target within 40 years** (e.g. negative savings rate):
  `yearsToTarget` returns `null` for that percentile — UI shows "not on
  track within 40 years" rather than a fabricated number.
- **No holdings, cash-only net worth**: works normally — sim just starts
  from a lower base value.
- **Short portfolio history** (< 12 months): falls back to the 7%/15%
  default return/vol instead of `computeRiskMetrics()`.

## Testing

`src/lib/__tests__/fi.test.ts` (new, pure-function, no React/DOM — matches
existing `projection.test.ts` conventions):
- `trailingMonthlyNetSavings`: correct average over N months; `null` with no
  data.
- `trailingAnnualExpenses`: correct sum over N months; `null` with no data;
  distinct result from `trailingMonthlyNetSavings` given the same input data
  (different window, sum vs average).
- `fiTarget`: multiple SWR% inputs (4% → 25×, 3.33% → 30×); `null` at zero or
  `null` expenses.
- `yearsToTarget`: crosses at the expected month; `null` when a percentile
  never crosses; p5 crosses later than p95 for the same series (sanity check
  on percentile ordering).

## Non-goals

- No change to `/goals` or its manual-input Monte Carlo usage.
- No change to `projection.ts`'s simulation math or its percentile set
  (staying at p5/p25/p50/p75/p95 — UI labels the range "5th–95th
  percentile", not "10th–90th", to avoid touching tested engine code for a
  label).
- No change to Report's month picker, CSV export, or nav placement.
- No new runtime dependencies.

## Success criteria

- `/planner` defaults to the "Financial Independence" tab; the other 4 tabs
  are reachable and unchanged.
- FI tab and Report's FI Outlook section show the same years-to-FI number
  for the same underlying data.
- All FI inputs are real (net worth, trailing savings, optionally real
  portfolio return/vol) with an editable override, not blank manual entry.
- Report's Net Worth section combines accounts + holdings correctly.
- Empty/edge states render sensibly instead of nonsense numbers.
- `npx tsc --noEmit`, `npm run build`, `npm run test`, `npm run lint` all
  green.

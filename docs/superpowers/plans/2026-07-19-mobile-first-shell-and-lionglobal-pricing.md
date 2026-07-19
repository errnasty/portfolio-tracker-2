# Mobile-first shell + LionGlobal pricing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-price LionGlobal funds by fund code, and tighten the existing mobile shell (home order, quick-add sheet, drawer touch targets) so a casual user can track finances easily on a phone.

**Architecture:** The mobile shell (bottom tab bar + raised "+", hamburger drawer, `QuickAddDialog` with a single `addBankTransaction` insert path and `source` discriminator) already exists — this plan refines it, it does not rebuild it. LionGlobal is an additive provider that plugs into the existing `FUND_PROVIDERS` registry, so the daily cron (`/api/cron/fund-prices`) and manual Refresh (`/api/fund-price`) wire up automatically.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind, Supabase, Recharts, Vitest.

**Reality note (read before starting):** During brainstorming we confirmed the email-ingestion seam already exists (`addBankTransaction(... source: 'manual'|'paste')` + `/api/extract` + `inbound_addresses`). So no work is needed there now. The mobile home already surfaces net worth / invested / spent / accounts / activity; Tasks 4–6 are targeted polish, not a rewrite.

---

## File Structure

- Create: `src/lib/server/fund-scrapers/lionglobal.ts` — parse + fetch LionGlobal NAV. One responsibility: turn a fund code into a `FundQuoteWithCurrency`.
- Create: `src/lib/__tests__/lionglobal.test.ts` — unit tests for the pure XML parser.
- Modify: `src/lib/server/fund-scrapers/index.ts` — swap the deprecated `lionglobal → Yahoo` mapping for the real impl.
- Modify: `src/lib/fund-providers.ts` — add `lionglobal` to the user-facing provider list.
- Modify: `src/app/(dashboard)/dashboard/page.tsx` — mobile ordering of the details grid + a mobile accounts strip.
- Modify: `src/components/layout/QuickAddDialog.tsx` — bottom-sheet framing on mobile.
- Modify: `src/components/layout/Sidebar.tsx` — larger drawer tap targets.
- Modify: `src/lib/changelog.ts`, `src/app/(dashboard)/guide/page.tsx`, `src/components/layout/OnboardingTour.tsx` — housekeeping per CLAUDE.md.

---

### Task 1: LionGlobal XML parser (pure function)

**Files:**
- Create: `src/lib/server/fund-scrapers/lionglobal.ts`
- Test: `src/lib/__tests__/lionglobal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/lionglobal.test.ts
import { describe, it, expect } from 'vitest'
import { parseLionGlobalFundlist } from '@/lib/server/fund-scrapers/lionglobal'

const OK = `<funds totalpage="1"><fund><f_code><![CDATA[SST6]]></f_code>` +
  `<eng_lgi><![CDATA[LionGlobal Singapore Trust Fund Class O SGD (MDist)]]></eng_lgi>` +
  `<currency><![CDATA[SGD]]></currency><nav>1.0620</nav><dealdate>2026-07-16</dealdate></fund></funds>`

const EMPTY = `<funds totalpage="0"></funds>`

describe('parseLionGlobalFundlist', () => {
  it('extracts nav, date, name, currency (CDATA-wrapped or not)', () => {
    expect(parseLionGlobalFundlist(OK)).toEqual({
      price: 1.062,
      asOf: '2026-07-16',
      name: 'LionGlobal Singapore Trust Fund Class O SGD (MDist)',
      currency: 'SGD',
    })
  })

  it('returns null when the fund code is unknown (no nav)', () => {
    expect(parseLionGlobalFundlist(EMPTY)).toBeNull()
  })

  it('returns null on a zero/garbage nav', () => {
    expect(parseLionGlobalFundlist('<funds><fund><nav>0</nav></fund></funds>')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/lionglobal.test.ts`
Expected: FAIL — `parseLionGlobalFundlist` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/server/fund-scrapers/lionglobal.ts
import type { FundQuoteWithCurrency } from './yahoo-fund'

// LionGlobal's fundlist endpoint returns XML (not JSON). Tag values are
// sometimes CDATA-wrapped (eng_lgi, currency) and sometimes bare (nav,
// dealdate). Pull each tag's inner text and strip a CDATA wrapper if present.
function tagText(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  if (!m) return null
  const inner = m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()
  return inner || null
}

export function parseLionGlobalFundlist(xml: string): FundQuoteWithCurrency | null {
  const price = Number(tagText(xml, 'nav'))
  if (!(price > 0)) return null
  return {
    price,
    asOf: tagText(xml, 'dealdate'),
    name: tagText(xml, 'eng_lgi'),
    currency: tagText(xml, 'currency'),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/lionglobal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/fund-scrapers/lionglobal.ts src/lib/__tests__/lionglobal.test.ts
git commit -m "feat(pricing): parse LionGlobal fundlist XML for NAV"
```

---

### Task 2: LionGlobal network fetch

**Files:**
- Modify: `src/lib/server/fund-scrapers/lionglobal.ts`

- [ ] **Step 1: Add the fetcher (network — verified by manual smoke test in Step 3, not unit-tested to avoid hitting the live API in CI)**

Append to `src/lib/server/fund-scrapers/lionglobal.ts`:

```ts
const LG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/xml, text/xml, */*',
}

// `ref` is a LionGlobal fund code, e.g. "SST6". Fetches the latest NAV from
// the public fundlist endpoint (returns XML). Signature matches the other
// scrapers so it slots straight into the FUND_PROVIDERS registry.
export async function fetchLionGlobalQuote(ref: string): Promise<FundQuoteWithCurrency> {
  const code = ref.trim().toUpperCase()
  if (!code) throw new Error('LionGlobal: no fund code provided')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const url = `https://api.lionglobalinvestors.com/fundlist?fname=&fcode=${encodeURIComponent(code)}&ftype=&cpage=&ctotal=`
    const res = await fetch(url, { headers: LG_HEADERS, signal: controller.signal })
    if (!res.ok) throw new Error(`LionGlobal: HTTP ${res.status} for "${code}"`)
    const xml = await res.text()
    const quote = parseLionGlobalFundlist(xml)
    if (!quote) throw new Error(`LionGlobal: no NAV for fund code "${code}". Check the code (e.g. SST6) on lionglobalinvestors.com.`)
    return quote
  } finally {
    clearTimeout(timeout)
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Smoke-test the live fetch**

Run:
```bash
npx tsx -e "import('./src/lib/server/fund-scrapers/lionglobal.ts').then(m => m.fetchLionGlobalQuote('SST6')).then(console.log)"
```
Expected: an object like `{ price: 1.062, asOf: '2026-07-16', name: 'LionGlobal Singapore Trust Fund Class O SGD (MDist)', currency: 'SGD' }` (exact numbers will differ by date). If `tsx` is unavailable, skip and rely on the in-app Refresh button test in Task 3, Step 4.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/fund-scrapers/lionglobal.ts
git commit -m "feat(pricing): fetch LionGlobal NAV by fund code"
```

---

### Task 3: Register LionGlobal as a real provider

**Files:**
- Modify: `src/lib/server/fund-scrapers/index.ts:1-20`
- Modify: `src/lib/fund-providers.ts` (`FUND_PROVIDER_LIST`)

- [ ] **Step 1: Wire the real impl into the registry**

In `src/lib/server/fund-scrapers/index.ts`, add the import:

```ts
import { fetchLionGlobalQuote } from './lionglobal'
```

Then replace the deprecated back-compat line in `IMPLS`:

```ts
  // was: lionglobal: fetchYahooFundQuote  (old site scrape never worked)
  lionglobal: fetchLionGlobalQuote,
```

Leave the rest of `IMPLS` and the two back-compat blocks unchanged.

- [ ] **Step 2: Add LionGlobal to the user-facing provider list**

In `src/lib/fund-providers.ts`, add this entry to `FUND_PROVIDER_LIST` (place it directly after the `sgfund` entry):

```ts
  {
    id: 'lionglobal',
    label: 'LionGlobal unit trust (auto, by fund code)',
    helpText: 'Enter your LionGlobal fund code exactly as it appears on your statement — e.g. "SST6" for LionGlobal Singapore Trust Class O SGD (MDist). The NAV is pulled straight from LionGlobal daily, so MDist classes that aren\'t on Yahoo Finance still auto-price. Test-fetch and confirm the price matches your statement before saving.',
  },
```

(No `nativeCurrency` — the fund reports its own currency, same as `sgfund`. The `ref` field stays free-text for the fund code.)

- [ ] **Step 3: Type-check + run the full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no new type errors; all tests pass (including Task 1's).

- [ ] **Step 4: In-app verification (manual)**

Start the app (`npm run dev`), open Holdings, add/edit a holding with price source = custom, provider = "LionGlobal unit trust", ref = `SST6`, click Test-fetch/Refresh. Confirm the NAV populates and matches the fund's published price. Then hit the Refresh button on the dashboard and confirm no error.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/fund-scrapers/index.ts src/lib/fund-providers.ts
git commit -m "feat(pricing): register LionGlobal provider (daily cron + manual refresh)"
```

---

### Task 4: Mobile home ordering + accounts strip

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Context:** The console card (net worth hero + attention + activity) already leads the page. The details grid (line 347) currently orders as: Cashflow, Spend-by-category, Spend-curve, Accounts, Allocation, Budgets, Subscriptions. On mobile the agreed priority is **accounts and recent activity high up**. Activity already lives in the console card near the top, so the one gap is **Accounts** — surface it earlier on mobile.

- [ ] **Step 1: Give the details grid a mobile order that floats Accounts up**

In `src/app/(dashboard)/dashboard/page.tsx`, the details grid opens at line 347:

```tsx
<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
```

Add `order-*` utilities so Accounts comes first on mobile only, without changing desktop layout. Change the Accounts `Panel` wrapper (currently around line 407–420) to add an order class, and push the others after it:

```tsx
{accounts.length > 0 && (
  <div className="order-first md:order-none">
    <Panel label="ACCOUNTS" tone="cool" right={formatCurrency(accountsNetBase, base)} href="/spending">
      {/* ...existing account rows unchanged... */}
    </Panel>
  </div>
)}
```

Rationale: `order-first` only affects flow order; on `md+` `order-none` restores the natural position. Wrapping in a plain `div` preserves the existing `Panel` markup verbatim.

- [ ] **Step 2: Verify on a mobile viewport**

Run `npm run dev`, open the dashboard in devtools responsive mode at 390px wide. Confirm: after the console card, the **Accounts** panel appears before Cashflow/Spend panels. At `md` width and above, the grid order is unchanged (Cashflow first).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat(mobile): float Accounts panel to top of details grid on phones"
```

---

### Task 5: Quick-add as a bottom sheet on mobile

**Files:**
- Modify: `src/components/layout/QuickAddDialog.tsx:163`

**Context:** `QuickAddDialog` is a centered `Dialog` (`max-w-[520px]`, `rounded-2xl`). On phones a bottom-anchored sheet is more thumb-friendly and feels native. Keep desktop centered.

- [ ] **Step 1: Make the dialog content bottom-anchored on mobile**

Change the `DialogContent` className at line 163 from:

```tsx
<DialogContent className="max-w-[520px] gap-0 overflow-hidden rounded-2xl border border-border p-0 shadow-2xl" aria-describedby={undefined}>
```

to:

```tsx
<DialogContent className="fixed bottom-0 left-0 right-0 top-auto max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-t-2xl rounded-b-none border border-border p-0 shadow-2xl data-[state=open]:slide-in-from-bottom sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl" aria-describedby={undefined}>
```

Rationale: on mobile it pins to the bottom with a top-rounded sheet; `sm:` restores the centered rounded dialog. (Verify the `sm:` overrides win against the shadcn `DialogContent` base transform — if the base uses `!` important utilities, mirror them; check `src/components/ui/dialog.tsx` before finalizing and match its centering utilities.)

- [ ] **Step 2: Verify open/close on both viewports**

Run `npm run dev`. At 390px: tap the tab-bar "+" — the sheet slides up from the bottom, amount field autofocuses, Save works. At desktop width: the dialog is centered as before. Confirm no horizontal overflow.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/QuickAddDialog.tsx
git commit -m "feat(mobile): quick-add opens as a bottom sheet on phones"
```

---

### Task 6: Drawer touch-target polish

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:37`

**Context:** The drawer (mobile "More") nav links use `py-2` (~34px tall). Apple/Material guidance is ≥44px for touch. Bump vertical padding on the nav links — this affects both desktop rail and mobile drawer since they share `NavItems`; the small increase is fine on desktop too.

- [ ] **Step 1: Increase link tap height**

In `src/components/layout/Sidebar.tsx`, the `TLink` className inside `NavItems` (line 36–41) contains `px-3 py-2`. Change `py-2` to `py-2.5` and add `min-h-[40px]`:

```tsx
'animate-nav-in flex min-h-[40px] items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium leading-none transition-all duration-200',
```

- [ ] **Step 2: Verify**

Run `npm run dev`, open the mobile drawer (hamburger at 390px). Confirm links are comfortably tappable and the list still fits without clipping. Confirm the desktop rail still looks balanced.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(mobile): larger drawer nav tap targets"
```

---

### Task 7: Housekeeping — changelog, guide, onboarding (required by CLAUDE.md)

**Files:**
- Modify: `src/lib/changelog.ts:18` (top of `CHANGELOG`)
- Modify: `src/app/(dashboard)/guide/page.tsx`
- Modify: `src/components/layout/OnboardingTour.tsx`

- [ ] **Step 1: Add a changelog entry at the TOP of `CHANGELOG`**

Insert as the first element of the `CHANGELOG` array (newest first), directly before the `version: '2026.07.15'` entry:

```ts
  {
    version: '2026.07.19',
    date: '2026-07-19',
    title: 'Easier on mobile + LionGlobal auto-pricing',
    items: [
      { title: 'LionGlobal funds auto-price', desc: 'Custom holdings can now use provider "LionGlobal unit trust" and just a fund code (e.g. SST6). The NAV updates daily and on Refresh — MDist classes that aren\'t on Yahoo finally price themselves.', href: '/holdings' },
      { title: 'Faster on your phone', desc: 'Quick-add now slides up as a bottom sheet, your accounts float to the top of the home screen on mobile, and the menu has bigger tap targets.', href: '/dashboard' },
    ],
  },
```

- [ ] **Step 2: Update the guide with the LionGlobal how-to**

In `src/app/(dashboard)/guide/page.tsx`, find the holdings/pricing section and add a short note on LionGlobal auto-pricing. First locate the relevant step:

Run: `grep -n "provider\|Yahoo\|fund code\|custom price\|price source" "src/app/(dashboard)/guide/page.tsx"`

Add a sentence to that step (match the file's existing copy style): "For LionGlobal unit trusts, pick provider ‘LionGlobal unit trust’ and enter your fund code (e.g. SST6) — the NAV updates automatically." If no pricing step exists, add one adjacent to the "Add your holdings" step.

- [ ] **Step 3: Touch up the onboarding tour**

In `src/components/layout/OnboardingTour.tsx`, confirm the quick-add "+" and home are covered. First inspect:

Run: `grep -n "step\|target\|title\|dashboard\|Quick\|\\+" src/components/layout/OnboardingTour.tsx`

If a quick-add step already exists, update its copy to mention the bottom sheet on mobile. If not, add one step pointing at the tab-bar "+": title "Log money fast", body "Tap + any time to add an expense or income in seconds." Keep the step shape identical to the surrounding steps.

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/changelog.ts "src/app/(dashboard)/guide/page.tsx" src/components/layout/OnboardingTour.tsx
git commit -m "docs: changelog, guide, and tour for mobile + LionGlobal pricing"
```

---

## Self-Review

**Spec coverage:**
- §1 Navigation shell → Task 6 (drawer polish); shell structure already exists (noted).
- §2 Home screen → Task 4 (mobile ordering + accounts). Net worth / month / activity already present in the console card.
- §3 Quick-add → Task 5 (bottom sheet). Email seam already exists (`addBankTransaction` + `source`), so no new insert-path task — documented in the Reality note.
- §4 LionGlobal → Tasks 1–3.
- §5 Housekeeping → Task 7. No schema changes (columns exist) — correctly omitted.

**Placeholder scan:** No TBD/TODO. Task 2 Step 1 is intentionally not unit-tested (live network) with a smoke-test substitute — stated explicitly. Tasks 2 Step 1, 5 Step 1 include a "check the base component before finalizing" instruction (dialog.tsx transform utilities); this is a real verification, not a placeholder.

**Type consistency:** `parseLionGlobalFundlist` returns `FundQuoteWithCurrency | null`; `fetchLionGlobalQuote(ref: string): Promise<FundQuoteWithCurrency>` matches the `FundProvider['fetchQuote']` signature `(ref: string) => Promise<FundQuote>` (FundQuoteWithCurrency extends FundQuote). Provider id `lionglobal` matches between `IMPLS` and `FUND_PROVIDER_LIST`.

# Robust email→transaction parsing + payee tooling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably land the email counterparty (`To:` for payments, `From:` for receipts) in the transaction description, group repeat payees by a stable key, flag low-confidence rows for review, and soft-dedupe alert+confirmation pairs.

**Architecture:** Rework the tolerant regex parser into a two-pass (colon-strict → bare-word loose) extractor that scans all matches; derive a stable `payee_key`; add `payee_key` + `needs_review` columns and a `payee_aliases` table; wire the sync route to persist them and flag fuzzy duplicates; resolve aliases at render time in the spending page + a review-queue card.

**Tech Stack:** Next.js 13 (app router), TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind + Radix UI, Recharts.

Spec: `docs/superpowers/specs/2026-07-02-robust-email-parsing-payee-design.md`

---

## File map

- Modify `supabase-schema.sql` — migration (2 columns + `payee_aliases` table).
- Modify `src/types/index.ts` — `BankTransaction` fields + `PayeeAlias`.
- Modify `src/lib/dbs-email-parser.ts` — two-pass extractor, `cleanMerchant`, `derivePayeeKey`, `payeeKey`/`confidence`.
- Modify `src/lib/__tests__/dbs-email-parser.test.ts` — update credit expectation, add cases.
- Create `src/lib/__tests__/fixtures/dbs-templates.ts` + `src/lib/__tests__/dbs-email-parser.fixtures.test.ts`.
- Create `src/lib/txn-dedupe.ts` + `src/lib/__tests__/txn-dedupe.test.ts`.
- Modify `src/app/api/bank/gmail-sync/route.ts` — persist `payee_key`/`needs_review`, soft fuzzy-dedup.
- Modify `src/context/SpendingContext.tsx` — payee aliases state + `resolveDescription`.
- Create `src/components/spending/ReviewQueueCard.tsx`.
- Modify `src/app/(dashboard)/spending/page.tsx` — mount review card, alias display, sort-by-payee.

---

## Task 1: Schema migration + types

**Files:**
- Modify: `supabase-schema.sql` (append after the `bank_transactions` block, before `category_rules`)
- Modify: `src/types/index.ts`

- [ ] **Step 1: Append migration to `supabase-schema.sql`**

Add immediately after the `bank_transactions` policy block (after the line ending the `"Users manage own bank transactions"` policy, ~line 258):

```sql
-- Payee grouping + review queue (added 2026-07). payee_key is a stable
-- per-counterparty key (mobile:9989 / acct:0152 / name:...); needs_review flags
-- rows the email parser was unsure about or that look like duplicates.
alter table bank_transactions add column if not exists payee_key   text;
alter table bank_transactions add column if not exists needs_review boolean not null default false;
create index if not exists idx_bank_txns_user_review
  on bank_transactions(user_id, needs_review) where needs_review;
create index if not exists idx_bank_txns_user_payeekey
  on bank_transactions(user_id, payee_key);

-- Friendly names for masked payees, keyed by payee_key. Resolved at render time
-- so a rename propagates to all past + future rows.
create table if not exists payee_aliases (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  payee_key  text not null,
  alias      text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, payee_key)
);
create index if not exists idx_payee_aliases_user on payee_aliases(user_id);
alter table payee_aliases enable row level security;
drop policy if exists "Users manage own payee aliases" on payee_aliases;
create policy "Users manage own payee aliases" on payee_aliases for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Extend `BankTransaction` + add `PayeeAlias` in `src/types/index.ts`**

In the `BankTransaction` interface, after `notes: string | null`, add:

```ts
  payee_key?: string | null    // stable per-payee grouping key
  needs_review?: boolean        // parser low-confidence or possible duplicate
```

(Both optional so existing insert sites — CSV import, manual add — compile unchanged; the DB supplies defaults.)

Then add a new interface below `BankTransaction`:

```ts
export interface PayeeAlias {
  id: string
  user_id: string
  payee_key: string
  alias: string
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add supabase-schema.sql src/types/index.ts
git commit -m "feat(spending): add payee_key/needs_review columns + payee_aliases table"
```

---

## Task 2: Parser helpers — `cleanMerchant` + `derivePayeeKey`

**Files:**
- Modify: `src/lib/dbs-email-parser.ts`
- Test: `src/lib/__tests__/dbs-email-parser.test.ts`

- [ ] **Step 1: Write failing tests**

Append inside the existing `describe('parseDbsAlert', ...)` block's file (add a new `describe` at the bottom of `src/lib/__tests__/dbs-email-parser.test.ts`):

```ts
import { cleanMerchant, derivePayeeKey } from '../dbs-email-parser'

describe('cleanMerchant', () => {
  it('strips a trailing (MOBILE ending NNNN)', () => {
    expect(cleanMerchant('MX TAX HUAXX REX (MOBILE ending 9989)')).toBe('MX TAX HUAXX REX')
  })
  it('strips a trailing A/C ending', () => {
    expect(cleanMerchant('Ernest Ng Savings A/C ending 0152')).toBe('Ernest Ng Savings')
  })
  it('leaves a plain name untouched', () => {
    expect(cleanMerchant('NTUC FAIRPRICE')).toBe('NTUC FAIRPRICE')
  })
})

describe('derivePayeeKey', () => {
  it('prefers mobile-ending', () => {
    expect(derivePayeeKey('MX TAX REX (MOBILE ending 9989)')).toBe('mobile:9989')
  })
  it('falls back to account-ending', () => {
    expect(derivePayeeKey('Some Biz account ending 0152')).toBe('acct:0152')
  })
  it('falls back to a normalized name', () => {
    expect(derivePayeeKey('TAY KAI YUN CHARMAINE')).toBe('name:tay-kai-yun-charmaine')
  })
  it('returns null for empty input', () => {
    expect(derivePayeeKey(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run src/lib/__tests__/dbs-email-parser.test.ts`
Expected: FAIL — `cleanMerchant`/`derivePayeeKey` are not exported.

- [ ] **Step 3: Implement the helpers**

In `src/lib/dbs-email-parser.ts`, add these exported functions above `const CUR_MAP`:

```ts
// Drop a trailing "(MOBILE ending 9989)" / "(account ending 0152)" /
// "A/C ending 0152" so the merchant is just the name (keeps category-rule
// substring matching stable).
export function cleanMerchant(raw: string): string {
  return raw
    .replace(/\s*\((?:mobile|account|a\/c)\s+ending\s+\d+\)\s*$/i, '')
    .replace(/\s+(?:a\/c|account)\s+ending\s+\d+\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Stable per-payee grouping key. Mobile-ending is the most stable identifier
// (masked names vary run to run), then account-ending, then a normalized name.
export function derivePayeeKey(raw: string | null): string | null {
  if (!raw) return null
  const mobile = raw.match(/mobile\s+ending\s+(\d{3,})/i)
  if (mobile) return `mobile:${mobile[1]}`
  const acct = raw.match(/(?:account|a\/c)\s+ending\s+(\d{3,})/i)
  if (acct) return `acct:${acct[1]}`
  const name = cleanMerchant(raw).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return name ? `name:${name}` : null
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run src/lib/__tests__/dbs-email-parser.test.ts`
Expected: the new `cleanMerchant` + `derivePayeeKey` tests PASS. (Some existing `parseDbsAlert` tests may still pass; the credit test is updated in Task 3.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/dbs-email-parser.ts src/lib/__tests__/dbs-email-parser.test.ts
git commit -m "feat(parser): add cleanMerchant + derivePayeeKey helpers"
```

---

## Task 3: Parser — two-pass extractor + `parseDbsAlert` rewrite

**Files:**
- Modify: `src/lib/dbs-email-parser.ts`
- Test: `src/lib/__tests__/dbs-email-parser.test.ts`

- [ ] **Step 1: Write the failing test (the real PayNow-out confirmation)**

Add inside `describe('parseDbsAlert', ...)` in `src/lib/__tests__/dbs-email-parser.test.ts`:

```ts
it('parses the PayNow outgoing confirmation → To: becomes description', () => {
  const r = parseDbsAlert(
    'DBS PayNow Transaction Completed',
    'Dear Customer, We refer to your PAYNOW dated 02 Jul. We are pleased to confirm ' +
    'that the transaction was completed. Date & Time: 02 Jul 14:55 (SGT) Amount: SGD53.00 ' +
    'From: Ernest Ng Savings A/C ending 0152 ' +
    'To: MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX (MOBILE ending 9989) ' +
    'If unauthorised, please call our DBS hotline. To view transaction details, please login to digibank. ' +
    'Thank you for banking with us.',
  )
  expect(r).not.toBeNull()
  expect(r!.amount).toBe(-53)
  expect(r!.currency).toBe('SGD')
  expect(r!.description).toBe('MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX (MOBILE ending 9989)')
  expect(r!.merchant).toBe('MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX')
  expect(r!.payeeKey).toBe('mobile:9989')
  expect(r!.confidence).toBe('high')
})

it('flags low confidence when no counterparty is found', () => {
  const r = parseDbsAlert('GIRO deduction alert', 'A GIRO deduction of SGD 88.00 was made on 03 Jul 2026.')
  expect(r!.confidence).toBe('low')
  expect(r!.payeeKey).toBeNull()
})
```

Also **update the existing credit test** `parses a real PayNow received-transfer alert` — change its last two assertions from:

```ts
    expect(r!.merchant).toBe('TAY KAI YUN CHARMAINE')
    expect(r!.description).toBe('Received from TAY KAI YUN CHARMAINE')
```

to:

```ts
    expect(r!.merchant).toBe('TAY KAI YUN CHARMAINE')
    expect(r!.description).toBe('TAY KAI YUN CHARMAINE')
    expect(r!.payeeKey).toBe('name:tay-kai-yun-charmaine')
```

- [ ] **Step 2: Run tests — verify the new/updated ones fail**

Run: `npx vitest run src/lib/__tests__/dbs-email-parser.test.ts`
Expected: FAIL — current parser returns `description` = subject for the PayNow-out case and `Received from …` for the credit case; `payeeKey`/`confidence` are undefined.

- [ ] **Step 3: Rewrite the interface, extractor, and `parseDbsAlert`**

In `src/lib/dbs-email-parser.ts`:

(a) Replace the `ParsedEmailTxn` interface with:

```ts
export interface ParsedEmailTxn {
  date: string | null          // YYYY-MM-DD, or null if not found (caller fills from message date)
  description: string
  merchant: string | null
  amount: number               // signed
  currency: string
  payeeKey: string | null      // stable grouping key (see derivePayeeKey)
  confidence: 'high' | 'low'   // 'low' when no counterparty could be extracted
}
```

(b) Replace the `STOP` constant and the whole `extractField` function with:

```ts
// Stop capture at the next field label, trailing boilerplate, or punctuation.
const STOP = '(?=\\s+(?:to|from|on|ref|dear|thank|didn|via|account|your|if|kindly|please)\\b|[.,;]|$)'

// Values that are never a real counterparty.
function rejectValue(v: string): boolean {
  return !v
    || /^your\b/i.test(v)
    || /your\b[\s\S]*account ending/i.test(v)
    || /view transaction|login|digibank/i.test(v)
}

// Pull a counterparty after a label. `strict` requires a colon (real field
// lines like "To:"), which structurally skips decoys ("refer to your",
// "To view details"). `loose` allows a bare word ("at NTUC", "from JOHN").
// We scan ALL matches and return the first that isn't a rejected value, so one
// decoy no longer aborts the search.
function extractField(text: string, labels: string[], mode: 'strict' | 'loose'): string | null {
  const sep = mode === 'strict' ? ':\\s*' : '\\s+'
  for (const label of labels) {
    const re = new RegExp(`\\b${label}${sep}([A-Za-z0-9][\\s\\S]{1,80}?)${STOP}`, 'ig')
    for (const m of text.matchAll(re)) {
      const v = m[1].trim().replace(/\s+/g, ' ')
      if (!rejectValue(v)) return v
    }
  }
  return null
}
```

(c) Replace the whole `parseDbsAlert` function body (from `const isCredit` through the `return`) with:

```ts
  const isCredit = /credited|received|incoming|refund|deposit|inward|salary/i.test(text)
  const amount = isCredit ? magnitude : -magnitude

  // Credit = money in → counterparty is the sender (From). Debit = money out →
  // recipient (To). Colon-anchored field lines first, then bare-word forms.
  const counterparty =
    extractField(text, isCredit ? ['from'] : ['to'], 'strict') ??
    extractField(text, isCredit ? ['from', 'at'] : ['at', 'merchant'], 'loose')

  const confidence: 'high' | 'low' = counterparty ? 'high' : 'low'
  const description = counterparty
    ? counterparty.slice(0, 300)
    : (subject.trim() || 'DBS transaction alert')

  return {
    date: findDate(text),
    description,
    merchant: counterparty ? cleanMerchant(counterparty) : null,
    amount,
    currency,
    payeeKey: derivePayeeKey(counterparty),
    confidence,
  }
```

- [ ] **Step 4: Run the full parser test file — verify pass**

Run: `npx vitest run src/lib/__tests__/dbs-email-parser.test.ts`
Expected: PASS (all cases, including the two new ones and the updated credit case).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dbs-email-parser.ts src/lib/__tests__/dbs-email-parser.test.ts
git commit -m "feat(parser): two-pass extractor, raw counterparty description, confidence+payeeKey"
```

---

## Task 4: Fixture-based regression suite

**Files:**
- Create: `src/lib/__tests__/fixtures/dbs-templates.ts`
- Create: `src/lib/__tests__/dbs-email-parser.fixtures.test.ts`

- [ ] **Step 1: Create the fixtures**

`src/lib/__tests__/fixtures/dbs-templates.ts`:

```ts
import type { ParsedEmailTxn } from '@/lib/dbs-email-parser'

export interface Fixture {
  name: string
  subject: string
  body: string
  expected: Partial<ParsedEmailTxn>
}

// One anonymized sample per real DBS/POSB template. Add a template = add an entry.
export const DBS_FIXTURES: Fixture[] = [
  {
    name: 'PayNow outgoing confirmation',
    subject: 'DBS PayNow Transaction Completed',
    body:
      'Dear Customer, We refer to your PAYNOW dated 02 Jul. We are pleased to confirm ' +
      'that the transaction was completed. Date & Time: 02 Jul 14:55 (SGT) Amount: SGD53.00 ' +
      'From: Ernest Ng Savings A/C ending 0152 ' +
      'To: MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX (MOBILE ending 9989) ' +
      'If unauthorised, please call our DBS hotline. Thank you for banking with us.',
    expected: {
      amount: -53,
      currency: 'SGD',
      description: 'MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX (MOBILE ending 9989)',
      merchant: 'MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX',
      payeeKey: 'mobile:9989',
      confidence: 'high',
    },
  },
  {
    name: 'PayNow incoming transfer',
    subject: "digibank Alerts - You've received a transfer",
    body:
      'Transaction Ref: 012606290119148480 Dear Customer, You have received SGD 30.00 via PayNow ' +
      'on 29 Jun 2026 16:13 SGT. From: TAY KAI YUN CHARMAINE To: Your DBS/ POSB account ending 0152 ' +
      "Didn't expect these funds? Thank you for banking with us.",
    expected: {
      amount: 30,
      currency: 'SGD',
      description: 'TAY KAI YUN CHARMAINE',
      payeeKey: 'name:tay-kai-yun-charmaine',
      confidence: 'high',
    },
  },
  {
    name: 'Card debit alert',
    subject: 'DBS Card Transaction Alert',
    body: 'You made a transaction of SGD 25.50 at NTUC FAIRPRICE on 15 Jun 2025.',
    expected: { amount: -25.5, merchant: 'NTUC FAIRPRICE', date: '2025-06-15', confidence: 'high' },
  },
  {
    name: 'PayLah! payment (S$, HTML body)',
    subject: 'Alert',
    body: '<p>Payment of <b>S$12.00</b> at <span>GRAB</span></p>',
    expected: { amount: -12, currency: 'SGD', merchant: 'GRAB', confidence: 'high' },
  },
  {
    name: 'GIRO deduction (no counterparty → low confidence)',
    subject: 'GIRO deduction alert',
    body: 'A GIRO deduction of SGD 88.00 was made on 03 Jul 2026.',
    expected: { amount: -88, confidence: 'low', payeeKey: null },
  },
]
```

- [ ] **Step 2: Create the fixture test runner**

`src/lib/__tests__/dbs-email-parser.fixtures.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseDbsAlert, type ParsedEmailTxn } from '../dbs-email-parser'
import { DBS_FIXTURES } from './fixtures/dbs-templates'

describe('DBS template fixtures', () => {
  for (const fx of DBS_FIXTURES) {
    it(fx.name, () => {
      const r = parseDbsAlert(fx.subject, fx.body)
      expect(r).not.toBeNull()
      for (const [k, v] of Object.entries(fx.expected)) {
        expect(r![k as keyof ParsedEmailTxn]).toBe(v)
      }
    })
  }
})
```

- [ ] **Step 3: Run the fixture suite — verify pass**

Run: `npx vitest run src/lib/__tests__/dbs-email-parser.fixtures.test.ts`
Expected: PASS — all 5 fixtures.

- [ ] **Step 4: Commit**

```bash
git add src/lib/__tests__/fixtures/dbs-templates.ts src/lib/__tests__/dbs-email-parser.fixtures.test.ts
git commit -m "test(parser): fixture-based DBS template regression suite"
```

---

## Task 5: Fuzzy-dedupe helper

**Files:**
- Create: `src/lib/txn-dedupe.ts`
- Test: `src/lib/__tests__/txn-dedupe.test.ts`

- [ ] **Step 1: Write failing tests**

`src/lib/__tests__/txn-dedupe.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { findFuzzyDuplicate } from '../txn-dedupe'

describe('findFuzzyDuplicate', () => {
  const existing = [{ id: 'a', date: '2026-07-02', amount: -53, payee_key: 'mobile:9989' }]

  it('matches same date + amount + payee_key', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-02', amount: -53, payee_key: 'mobile:9989' }, existing)?.id).toBe('a')
  })
  it('never matches a candidate without a payee_key', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-02', amount: -53, payee_key: null }, existing)).toBeNull()
  })
  it('does not match a different amount', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-02', amount: -54, payee_key: 'mobile:9989' }, existing)).toBeNull()
  })
  it('does not match a different date', () => {
    expect(findFuzzyDuplicate({ date: '2026-07-03', amount: -53, payee_key: 'mobile:9989' }, existing)).toBeNull()
  })
})
```

- [ ] **Step 2: Run — verify fail**

Run: `npx vitest run src/lib/__tests__/txn-dedupe.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/txn-dedupe.ts`:

```ts
export interface DupRow {
  id?: string
  date: string
  amount: number | string
  payee_key: string | null
}

// A candidate is a fuzzy duplicate of an existing row when it shares the stable
// payee_key, the same date, and (within rounding) the same amount. Requires a
// payee_key — rows we couldn't key are never auto-matched. Used to FLAG (not
// drop) alert+confirmation pairs of the same transaction.
export function findFuzzyDuplicate(candidate: DupRow, existing: DupRow[]): DupRow | null {
  if (!candidate.payee_key) return null
  return existing.find((e) =>
    e.payee_key === candidate.payee_key &&
    e.date === candidate.date &&
    Math.abs(Number(e.amount) - Number(candidate.amount)) < 0.005,
  ) ?? null
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/lib/__tests__/txn-dedupe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/txn-dedupe.ts src/lib/__tests__/txn-dedupe.test.ts
git commit -m "feat(spending): fuzzy-duplicate detector for synced transactions"
```

---

## Task 6: Sync route — persist payee_key/needs_review + soft dedup

**Files:**
- Modify: `src/app/api/bank/gmail-sync/route.ts`

- [ ] **Step 1: Import the dedupe helper**

At the top of `src/app/api/bank/gmail-sync/route.ts`, after the existing `import { guessCategoryName } ...` line, add:

```ts
import { findFuzzyDuplicate } from '@/lib/txn-dedupe'
```

- [ ] **Step 2: Persist `payee_key` + `needs_review` on each row**

In the `rows.push({ ... })` object (inside the `for (const { id } of messages)` loop), add these two fields (e.g. after `merchant: parsed.merchant,`):

```ts
      payee_key: parsed.payeeKey,
      needs_review: parsed.confidence === 'low',
```

- [ ] **Step 3: Flag fuzzy duplicates before insert**

Find the block that computes `fresh` (the external_id-dedup filter):

```ts
    const seen = new Set((ex ?? []).map((r) => r.external_id))
    const fresh = rows.filter((r) => !seen.has(r.external_id as string))
    if (fresh.length > 0) {
```

Insert the following immediately **after** the `const fresh = ...` line and **before** `if (fresh.length > 0) {`:

```ts
    // Soft fuzzy-dedup: alert + confirmation of the same transaction share
    // date+amount+payee_key. Flag (needs_review) rather than drop, so a genuine
    // same-day repeat payment is never silently lost.
    const dupDates = Array.from(new Set(fresh.map((r) => r.date as string)))
    let priorRows: { id: string; date: string; amount: number; payee_key: string | null }[] = []
    if (dupDates.length > 0) {
      const { data: prior } = await supabase
        .from('bank_transactions')
        .select('id, date, amount, payee_key')
        .eq('user_id', user.id)
        .in('date', dupDates)
      priorRows = prior ?? []
    }
    const batchSeen: { date: string; amount: number; payee_key: string | null }[] = []
    for (const r of fresh) {
      const cand = { date: r.date as string, amount: Number(r.amount), payee_key: (r.payee_key ?? null) as string | null }
      const dup = findFuzzyDuplicate(cand, [...priorRows, ...batchSeen])
      if (dup) {
        r.needs_review = true
        r.notes = `possible duplicate of ${(dup as { id?: string }).id ?? 'existing transaction'}`
      }
      batchSeen.push(cand)
    }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (`rows` is `Record<string, unknown>[]`, so the new fields and mutations are permitted.)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/bank/gmail-sync/route.ts
git commit -m "feat(gmail-sync): persist payee_key/needs_review + soft fuzzy dedup"
```

---

## Task 7: Context — payee aliases + `resolveDescription`

**Files:**
- Modify: `src/context/SpendingContext.tsx`

- [ ] **Step 1: Import the `PayeeAlias` type**

In the `import type { ... } from '@/types'` block, add `PayeeAlias` to the list.

- [ ] **Step 2: Extend the context interface**

In `interface SpendingContextValue`, add after `budgets`-related members:

```ts
  payeeAliases: PayeeAlias[]
  refreshPayeeAliases: () => Promise<void>
  upsertPayeeAlias: (payeeKey: string, alias: string) => Promise<void>
  resolveDescription: (t: BankTransaction) => string
```

- [ ] **Step 3: Add state, loader, mutator, and resolver**

(a) After `const [budgets, setBudgets] = useState<Budget[]>([])`, add:

```ts
  const [payeeAliases, setPayeeAliases] = useState<PayeeAlias[]>([])
```

(b) After the `refreshBudgets` useCallback, add:

```ts
  const refreshPayeeAliases = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('payee_aliases').select('*').eq('user_id', user.id)
    setPayeeAliases(data ?? [])
  }, [])

  const upsertPayeeAlias = async (payeeKey: string, alias: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase.from('payee_aliases').upsert(
      { user_id: user.id, payee_key: payeeKey, alias: alias.trim(), updated_at: new Date().toISOString() },
      { onConflict: 'user_id,payee_key' },
    )
    if (err) { toast.error(`Save name failed: ${err.message}`); throw err }
    await refreshPayeeAliases()
  }
```

(c) In the `init()` effect, add `await refreshPayeeAliases()` alongside the other refreshes, and add `refreshPayeeAliases` to that effect's dependency array.

(d) After the `catNameById` useMemo (near the other memos), add:

```ts
  const aliasByKey = useMemo(
    () => Object.fromEntries(payeeAliases.map((a) => [a.payee_key, a.alias])) as Record<string, string>,
    [payeeAliases],
  )

  const resolveDescription = useCallback(
    (t: BankTransaction) => (t.payee_key ? aliasByKey[t.payee_key] : undefined) || t.description,
    [aliasByKey],
  )
```

- [ ] **Step 4: Expose the new members in the provider value**

In the `<SpendingContext.Provider value={{ ... }}>`, add:

```ts
      payeeAliases, refreshPayeeAliases, upsertPayeeAlias, resolveDescription,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/context/SpendingContext.tsx
git commit -m "feat(spending): payee-alias state + render-time resolveDescription"
```

---

## Task 8: ReviewQueueCard component

**Files:**
- Create: `src/components/spending/ReviewQueueCard.tsx`

- [ ] **Step 1: Create the component**

`src/components/spending/ReviewQueueCard.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useSpending } from '@/context/SpendingContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, AlertTriangle } from 'lucide-react'

// Rows the parser flagged (low confidence or possible duplicate). Lets the user
// fix the description, optionally name the payee (writes a payee_alias), and
// clear the flag. Renders nothing when the queue is empty.
export function ReviewQueueCard() {
  const { bankTransactions, updateBankTransaction, upsertPayeeAlias } = useSpending()
  const rows = useMemo(() => bankTransactions.filter((t) => t.needs_review), [bankTransactions])
  const [drafts, setDrafts] = useState<Record<string, { description: string; alias: string }>>({})

  if (rows.length === 0) return null

  const draftFor = (id: string, description: string) => drafts[id] ?? { description, alias: '' }
  const setDraft = (
    id: string,
    patch: Partial<{ description: string; alias: string }>,
    description: string,
  ) => setDrafts((d) => ({ ...d, [id]: { ...draftFor(id, description), ...patch } }))

  const confirm = async (t: (typeof rows)[number]) => {
    const d = draftFor(t.id, t.description)
    if (d.alias.trim() && t.payee_key) await upsertPayeeAlias(t.payee_key, d.alias)
    await updateBankTransaction(t.id, {
      description: d.description.trim() || t.description,
      needs_review: false,
    })
  }

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Needs review · {rows.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((t) => {
          const d = draftFor(t.id, t.description)
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{t.date}</span>
              <Input
                value={d.description}
                onChange={(e) => setDraft(t.id, { description: e.target.value }, t.description)}
                className="h-8 flex-1 min-w-[180px] text-sm"
                placeholder="Description"
              />
              {t.payee_key && (
                <Input
                  value={d.alias}
                  onChange={(e) => setDraft(t.id, { alias: e.target.value }, t.description)}
                  className="h-8 w-40 text-sm"
                  placeholder={`Name (${t.payee_key})`}
                />
              )}
              <span className="tabular-nums text-sm whitespace-nowrap">
                {Number(t.amount).toFixed(2)} {t.currency}
              </span>
              <Button size="sm" className="h-8" onClick={() => confirm(t)}>
                <Check className="h-3.5 w-3.5 mr-1" /> Confirm
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/spending/ReviewQueueCard.tsx
git commit -m "feat(spending): review-queue card for low-confidence transactions"
```

---

## Task 9: Spending page — mount review card, alias display, sort-by-payee

**Files:**
- Modify: `src/app/(dashboard)/spending/page.tsx`

- [ ] **Step 1: Import the review card**

Near the other `@/components/spending/...` imports (or with the component imports at the top), add:

```ts
import { ReviewQueueCard } from '@/components/spending/ReviewQueueCard'
```

- [ ] **Step 2: Pull `resolveDescription` from context**

In the `useSpending()` destructure (currently):

```ts
    bankTransactions, categories, categoryById, statsForMonth, loading, error,
    addBankTransaction, updateBankTransaction, deleteBankTransaction, categorize,
```

add `resolveDescription`:

```ts
    bankTransactions, categories, categoryById, statsForMonth, loading, error,
    addBankTransaction, updateBankTransaction, deleteBankTransaction, categorize, resolveDescription,
```

- [ ] **Step 3: Add sort state + sorted list**

After the `const [catFilter, setCatFilter] = useState('all')` line, add:

```ts
  const [sortBy, setSortBy] = useState<'date' | 'payee'>('date')
```

After the `const filtered = useMemo(...)` block, add:

```ts
  const sorted = useMemo(() => {
    if (sortBy !== 'payee') return filtered
    return [...filtered].sort((a, b) => resolveDescription(a).localeCompare(resolveDescription(b)))
  }, [filtered, sortBy, resolveDescription])
```

- [ ] **Step 4: Add a sort control next to the filters**

In the transactions card header, find:

```tsx
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    <SelectItem value="uncat">Uncategorized</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
```

Immediately **after** that `</Select>`, add:

```tsx
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'date' | 'payee')}>
                  <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Sort: Date</SelectItem>
                    <SelectItem value="payee">Sort: Payee</SelectItem>
                  </SelectContent>
                </Select>
```

- [ ] **Step 5: Render the sorted list + resolved description**

Change the table body map from:

```tsx
                  {filtered.map((t) => {
```

to:

```tsx
                  {sorted.map((t) => {
```

And change the description cell from:

```tsx
                          <div className="text-sm truncate max-w-[220px]">{t.description}</div>
```

to:

```tsx
                          <div className="text-sm truncate max-w-[220px]">{resolveDescription(t)}</div>
```

- [ ] **Step 6: Mount the review card**

Find the trends section marker:

```tsx
      {/* Month-over-month trends */}
```

Immediately **before** it, add:

```tsx
      <ReviewQueueCard />

```

- [ ] **Step 7: Typecheck + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests PASS.

- [ ] **Step 8: Manual verification (dev server)**

Run: `npm run dev`, open `/spending`.
Expected:
- "Sort: Payee" reorders the transaction list alphabetically by displayed description.
- After applying the migration + a Gmail sync, a PayNow-out row shows the `To:` recipient as its description.
- A low-confidence/duplicate row appears in the amber "Needs review" card; editing + Confirm removes it from the queue; typing a payee name and confirming makes that friendly name show everywhere for that payee.

(Requires the Task 1 migration applied in Supabase and Gmail connected. If not testable locally, note it and rely on the unit + fixture suites.)

- [ ] **Step 9: Commit**

```bash
git add src/app/(dashboard)/spending/page.tsx
git commit -m "feat(spending): review queue, alias-resolved descriptions, sort by payee"
```

---

## Post-implementation

1. **Apply the migration:** run the updated `supabase-schema.sql` in the Supabase SQL editor (adds `payee_key`, `needs_review`, `payee_aliases`). Safe/additive — existing rows unaffected.
2. **Re-sync Gmail** to backfill `payee_key`/`needs_review` on newly imported alerts. Historical rows keep `payee_key = null` (out of scope to backfill).
3. Run `graphify update .` to refresh the knowledge graph (per project CLAUDE.md).

## Self-review notes

- **Spec coverage:** parser two-pass + raw counterparty (Task 3) ✓; payee_key derivation (Task 2) ✓; confidence→needs_review (Tasks 3, 6) ✓; migration + types (Task 1) ✓; sync route payee_key/needs_review/fuzzy-dedup (Task 6) ✓; alias table + render-time resolution (Tasks 1, 7) ✓; review-queue UI (Tasks 8, 9) ✓; fixture suite (Task 4) ✓.
- **Type consistency:** `ParsedEmailTxn.payeeKey`/`confidence`, `BankTransaction.payee_key`/`needs_review`, `PayeeAlias`, `findFuzzyDuplicate(DupRow)`, `resolveDescription(BankTransaction)` — names consistent across tasks.
- **No placeholders:** every code step is complete.

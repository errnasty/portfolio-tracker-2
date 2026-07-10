# Robust email→transaction parsing + payee tooling — Design

Date: 2026-07-02
Status: Approved (pending spec review)

## Goal

Make DBS/POSB email ingestion robust enough that the **counterparty** (the `To:`
recipient for a payment, `From:` sender for a receipt) reliably lands in the
transaction `description`, so the user can sort/group transactions by who they
paid. Add supporting tooling: friendly payee aliases, a review queue for rows the
parser is unsure about, a fixture-based regression suite, and soft fuzzy-dedup.

## Motivation / current state (evidence)

Input is the Gmail message body (HTML/plaintext), not an OCR'd image
([gmail-sync/route.ts](../../../src/app/api/bank/gmail-sync/route.ts) →
`extractBody`). It is fed to `parseDbsAlert`
([dbs-email-parser.ts](../../../src/lib/dbs-email-parser.ts)).

For the real PayNow *confirmation* template:

```
Dear Customer, We refer to your PAYNOW dated 02 Jul. We are pleased to confirm
that the transaction was completed. Date & Time: 02 Jul 14:55 (SGT)
Amount: SGD53.00 From: Ernest Ng Savings A/C ending 0152
To: MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX (MOBILE ending 9989)
If unauthorised, please call our DBS hotline. To view transaction details...
```

Verified failure: `extractField(text, ['to', ...])` matches the decoy
"refer **to** your PAYNOW" first, the `^your` guard rejects it, and the function
gives up (it only inspects the *first* regex match per label). Result:
`merchant = null`, so `description` falls back to the email subject. The real
`To:` recipient never reaches the row. Amount (−53.00) and the message-date
fallback already work.

Three structural weaknesses:
1. `extractField` aborts after one decoy match instead of scanning all matches.
2. No handling for the `To: <name> (MOBILE ending NNNN)` shape or a trailing
   `If unauthorised…` clause with no punctuation separator.
3. This template carries no debit keyword; correct sign is currently luck (the
   default branch happens to be debit).

## Scope

**In:** parser refactor; `payee_key` derivation; per-row confidence →
`needs_review`; schema migration (`payee_key`, `needs_review`, `payee_aliases`);
sync-route changes (payee_key, needs_review, soft fuzzy-dedup); payee-alias
resolution + edit UI; review-queue UI on the transactions page; fixture-based
parser test suite.

**Out (future):** non-DBS banks (UOB/OCBC); ML categorization; idempotent balance
rederivation; encrypting the stored Google refresh token (worth doing, tracked
separately).

## Design

### A. Parser refactor — `src/lib/dbs-email-parser.ts`

Replace single-match `extractField` with a two-pass extractor:

- **Strict pass (colon-anchored):** `\b<label>\s*:\s*<capture>` for
  `To`, `From`, `at`. The field lines use colons; the decoys ("refer to your",
  "To view details") do not, so they are skipped structurally.
- **Loose pass (bare word):** `\b<label>\s+<capture>` for card/PayLah alerts
  ("at NTUC FAIRPRICE", "from JOHN TAN"). Only used if the strict pass finds
  nothing for that role.
- Iterate **all** matches per label (`matchAll` / global regex); return the first
  value that passes the guards, so a single decoy no longer aborts the search.

Guards (reject a candidate value when):
- starts with `your` (existing);
- matches `your .* account ending` (self-account, e.g. the `To:` line of an
  incoming transfer);
- matches `view transaction` / `login`.

Capture tuning:
- Stop set extended with `if|kindly|please` so `…9989) If unauthorised` cuts
  cleanly; keep existing `to|from|on|ref|dear|thank|didn|via|account|your` and
  `[.,;]`/end.
- Length cap 60 → 80 (the real `To:` line is ~60 chars, currently on the edge).

Counterparty role by direction (unchanged detection via `isCredit`):
- debit → counterparty = `To` (fallback `at`/`merchant`)
- credit → counterparty = `From` (fallback `at`)

`description` / `merchant`:
- `description` = **raw counterparty text**, verb-free, for both debit and credit
  (e.g. `MX TAX CHXX KIAXX &/XX MX TAX HUAXX REX (MOBILE ending 9989)` /
  `TAY KAI YUN CHARMAINE`). Updates the existing credit test expectation from
  `Received from TAY…` to `TAY…`.
- `merchant` = **cleaned name**: raw counterparty minus the trailing
  `(MOBILE ending NNNN)` / `(account ending NNNN)` / `A/C ending NNNN` suffix.
  Keeps `category_rules` substring matching stable.
- When no counterparty is found: `description` = subject fallback (as today) and
  confidence = `low` (see C).

Extended `ParsedEmailTxn`:

```ts
export interface ParsedEmailTxn {
  date: string | null
  description: string
  merchant: string | null
  amount: number
  currency: string
  payeeKey: string | null          // NEW — stable grouping key (see B)
  confidence: 'high' | 'low'       // NEW — 'low' when counterparty not extracted
}
```

### B. `payee_key` derivation (pure helper in the parser module)

`derivePayeeKey(rawCounterparty): string | null`, first match wins:
1. `(MOBILE ending NNNN)` → `mobile:NNNN`   ← primary stable key
2. `account ending NNNN` / `A/C ending NNNN` → `acct:NNNN`
3. else normalized name → `name:<lowercased, punctuation-stripped, spaces→->`

Rationale: the masked name varies but the mobile-ending is stable per payee, so
`mobile:9989` groups repeat payments together. `payee_key` is null only when
confidence is `low`.

### C. Confidence → review queue

`confidence: 'low'` whenever the counterparty could not be extracted (parser fell
back to subject). The sync route maps `confidence === 'low'` **or** a fuzzy-dup
hit (E) to `needs_review = true`.

### D. Schema migration — append to `supabase-schema.sql`

```sql
alter table bank_transactions add column if not exists payee_key   text;
alter table bank_transactions add column if not exists needs_review boolean not null default false;
create index if not exists idx_bank_txns_user_review
  on bank_transactions(user_id, needs_review) where needs_review;
create index if not exists idx_bank_txns_user_payeekey
  on bank_transactions(user_id, payee_key);

create table if not exists payee_aliases (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  payee_key  text not null,
  alias      text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, payee_key)
);
alter table payee_aliases enable row level security;
drop policy if exists "Users manage own payee aliases" on payee_aliases;
create policy "Users manage own payee aliases" on payee_aliases for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Mirror the new fields in `BankTransaction` (`src/types/index.ts`) and add a
`PayeeAlias` type.

### E. Sync route — `src/app/api/bank/gmail-sync/route.ts`

- Persist `payee_key` and `needs_review` on each inserted row
  (`needs_review = parsed.confidence === 'low'`).
- **Soft fuzzy-dedup** (before insert, after the existing `external_id` skip):
  for each fresh candidate, query existing rows for the user matching
  `date == candidate.date AND amount == candidate.amount AND payee_key == candidate.payee_key`
  (payee_key non-null). On a hit, still insert but set `needs_review = true` and
  `notes = 'possible duplicate of <existing id>'`. Never auto-drop — protects
  genuine same-day repeat payments.
- Category resolution unchanged (still uses description + merchant).

### F. Payee aliases — resolution + edit

- **Resolution (render-time):** on the transactions page, batch-load the user's
  `payee_aliases` into a `Map<payee_key, alias>`. Displayed label and the sort
  key are `alias ?? description`. Raw `description` is preserved in the DB, so
  renaming an alias propagates to all past and future rows without a data
  migration.
- **Edit UI:** on a transaction row with a `payee_key`, a small "name this payee"
  affordance opens an input; save upserts `payee_aliases(user_id, payee_key,
  alias)`. Reuse existing dialog/input primitives (Radix) already in the app.

### G. Review-queue UI — transactions page

- A "Needs review" filter/segment (count badge) listing rows where
  `needs_review = true`.
- Each row: inline-edit `description` and `merchant`; a "name this payee" action
  (writes an alias per F); a "looks right / not a duplicate" action that clears
  `needs_review`. Saving edits also clears `needs_review`.
- Follows the existing transactions-page table + edit patterns; no new global
  state store.

### H. Fixture-based parser test suite

- `src/lib/__tests__/fixtures/dbs/` — one file per template holding
  `{ subject, body, expected: Partial<ParsedEmailTxn> }` (anonymized).
- Seed: card debit, PayLah, PayNow-out confirmation (this email), PayNow-in
  transfer, GIRO. Fold in the existing inline cases.
- A single `dbs-email-parser.fixtures.test.ts` iterates the directory and asserts
  each `expected`. Adding a template = adding a fixture file.

## Data flow

```
Gmail body ─▶ parseDbsAlert ──▶ { description(raw counterparty),
                                   merchant(clean), payeeKey, confidence, amount, date }
                                        │
              sync route ──────────────┤ needs_review = low-confidence OR fuzzy-dup
                                        ▼
                              bank_transactions row (+ payee_key, needs_review)
                                        │
   transactions page ◀── payee_aliases Map ──▶ label/sort = alias ?? description
                                        │
                        review queue: edit desc/merchant, set alias, clear flag
```

## Error handling / edge cases

- Counterparty not found → `confidence:'low'`, `payee_key:null`, subject
  fallback, `needs_review:true` (visible, not silently wrong).
- Self-account `To:`/`From:` (incoming transfer) rejected by guard → correct role
  chosen.
- `SGD53.00` (no space), `S$`, `$` already handled; keep those tests.
- `02 Jul` (no year) → date null → message-date fallback (unchanged).
- Fuzzy-dedup false positive (real repeat payment) → flagged, never dropped.
- Alias upsert conflict → `unique(user_id, payee_key)` upsert (update alias).

## Testing

- Unit: two-pass extractor (decoy `to your` / `To view` ignored, real `To:`
  captured), `derivePayeeKey` (mobile / account / name fallbacks), clean-merchant
  suffix stripping, credit=raw-From, confidence flagging.
- Fixture suite (H) as regression guard.
- Sync route: fuzzy-dup flags rather than drops (logic-level test around the dedup
  predicate; full route is integration-heavy — keep the dedup decision pure and
  unit-test that function).
- Existing `dbs-email-parser.test.ts` updated for the raw-credit change.

## Rollout

Additive migration (new nullable column + `needs_review` default false + new
table). Existing rows: `payee_key` null, `needs_review` false — unaffected.
Backfill of `payee_key` on historical rows is optional/out of scope.

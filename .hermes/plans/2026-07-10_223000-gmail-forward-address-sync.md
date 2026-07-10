# Gmail Forward-to-Address Bank Sync — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the current Gmail OAuth-based bank email sync (which requires Google OAuth, `google_tokens` table, refresh tokens) with a simpler **forwarding address** model: each user gets a unique inbound email address. They forward/CC their bank notification emails to it, and the system parses the amount, merchant, and category automatically — no OAuth, no Gmail API, no Google credentials needed.

**Architecture:** A new Supabase table `inbound_addresses` maps a unique email address (e.g. `abc123@inbound.aureus.app`) to a user. A new Next.js API route `/api/inbound/email` acts as an email webhook receiver (called by Supabase Edge Functions, SendGrid Inbound Parse, or similar). It reads the raw email, runs the existing `parseDbsAlert()` parser, auto-categorizes via the existing `guessCategoryName()` + user rules, and inserts a `bank_transactions` row. The UI changes: replace the `GmailCard` component with a new `ForwardAddressCard` that displays the user's unique address with a copy button, instructions, and a manual "Sync now" button that polls for recently-received emails.

**Tech Stack:** Next.js 13.5 (app router), React 18, Supabase (Postgres + RLS), existing `dbs-email-parser.ts` and `categorize.ts` libs, Tailwind CSS, sonner (toast), lucide-react.

---

## Current State

### What exists today

1. **`GmailCard.tsx`** (`src/components/spending/GmailCard.tsx`) — UI component in Settings page. Shows a "Bank email sync (POSB)" card. User clicks "Connect Gmail" → OAuth flow with `gmail.readonly` scope → refresh token stored in `google_tokens` table. "Sync now" calls `/api/bank/gmail-sync` which uses the Gmail API to list + fetch + parse DBS/POSB alert emails.

2. **`/api/bank/gmail-sync/route.ts`** — Server endpoint that:
   - Refreshes the Google OAuth token
   - Lists DBS/POSB alert emails via Gmail API (`from:ibanking.alert@dbs.com OR ...`)
   - Parses each email with `parseDbsAlert()`
   - Auto-categorizes with user rules + `guessCategoryName()`
   - Dedupes by `external_id` (`gmail-{messageId}`) and fuzzy-dedupes by date+amount+payee_key
   - Inserts into `bank_transactions`
   - Updates account balances

3. **`google_tokens` table** — Stores `user_id`, `refresh_token`, `last_synced`, `email`.

4. **`SpendingContext.tsx`** — Auto-syncs Gmail on session start (if connected + not synced in 6h).

5. **`supabase.ts`** — Captures `provider_refresh_token` from OAuth sessions into localStorage.

6. **Settings page** (`settings/page.tsx`) — Renders `<GmailCard />` at the bottom.

7. **`dbs-email-parser.ts`** — Parses DBS/POSB alert email subject+body → `{ date, description, merchant, amount, currency, payeeKey, confidence }`. This parser is **reusable** and does not depend on Gmail.

### What changes

The Gmail OAuth flow is replaced entirely:

| Before | After |
|--------|-------|
| User connects Gmail via OAuth | User gets a unique forwarding address |
| `google_tokens` table stores refresh token | `inbound_addresses` table stores the address + last_synced |
| `GmailCard` shows connect/sync buttons | `ForwardAddressCard` shows address + copy button + instructions |
| `/api/bank/gmail-sync` pulls from Gmail API | `/api/inbound/email` receives webhook from email provider, OR `/api/inbound/sync` polls an email inbox |
| `SpendingContext` auto-syncs via Gmail API | `SpendingContext` auto-syncs by polling recent inbound emails |
| `supabase.ts` captures OAuth refresh tokens | Not needed — removed |

---

## Proposed Approach

### Email Inbound Strategy

There are two viable approaches for receiving forwarded emails:

**Option A — Email Webhook (recommended):** Use an email-to-webhook service (e.g. CloudMailin, Postmark Inbound, SendGrid Inbound Parse) that receives the forwarded email and POSTs the raw email body to `/api/inbound/email`. The API route parses it and inserts the transaction. Real-time, no polling.

**Option B — IMAP Polling:** The app has its own IMAP inbox (e.g. `inbound@aureus.app`) and `/api/inbound/sync` connects via IMAP to read unread emails, parse them, and mark as read. Requires an IMAP library (e.g. `imapflow`) and mail server credentials.

This plan implements **Option A** (webhook) with a fallback **manual sync** button that calls the same webhook endpoint with a test email, plus an **address provisioning** flow. The implementer should confirm which email inbound provider the user has, but the plan is structured so the webhook receiver is provider-agnostic.

---

## Reference Files

| File | Role |
|------|------|
| `src/components/spending/GmailCard.tsx` | **Replace** with `ForwardAddressCard.tsx` |
| `src/app/api/bank/gmail-sync/route.ts` | **Replace** with `/api/inbound/email/route.ts` |
| `src/app/(dashboard)/settings/page.tsx` | Update import from `GmailCard` → `ForwardAddressCard` |
| `src/context/SpendingContext.tsx` | Update auto-sync logic (lines ~246-277) |
| `src/lib/supabase.ts` | Remove OAuth token capture (lines 8-20) |
| `src/lib/dbs-email-parser.ts` | **Reuse as-is** — `parseDbsAlert(subject, body)` |
| `src/lib/categorize.ts` | **Reuse as-is** — `guessCategoryName(desc, merchant)` |
| `src/lib/txn-dedupe.ts` | **Reuse as-is** — `findFuzzyDuplicate()` |
| `supabase-schema.sql` | Add `inbound_addresses` table, deprecate `google_tokens` |
| `src/types/index.ts` | Add `InboundAddress` type |

---

## Task List Overview

| # | Task | Files | Est. |
|---|------|-------|------|
| 1 | Add `inbound_addresses` table to schema | `supabase-schema.sql` | 3 min |
| 2 | Add `InboundAddress` type | `src/types/index.ts` | 2 min |
| 3 | Create address provisioning lib | `src/lib/inbound.ts` | 5 min |
| 4 | Create inbound email webhook API route | `src/app/api/inbound/email/route.ts` | 10 min |
| 5 | Create `ForwardAddressCard` component | `src/components/spending/ForwardAddressCard.tsx` | 8 min |
| 6 | Update Settings page to use `ForwardAddressCard` | `src/app/(dashboard)/settings/page.tsx` | 2 min |
| 7 | Update `SpendingContext` auto-sync logic | `src/context/SpendingContext.tsx` | 5 min |
| 8 | Clean up `supabase.ts` (remove OAuth token capture) | `src/lib/supabase.ts` | 2 min |
| 9 | Add environment variable for inbound email secret | `.env.local.example` | 1 min |
| 10 | Remove old Gmail files + deprecate `google_tokens` | Multiple | 3 min |
| 11 | Final build + lint + test | — | 3 min |

---

## Task 1: Add `inbound_addresses` table to schema

**Objective:** Add a new table that maps a unique inbound email address to a user, with `last_synced` for polling throttling.

**Files:**
- Modify: `supabase-schema.sql` (append after `google_tokens` section, ~line 395)

**Step 1: Add the table definition**

Append this SQL after the `google_tokens` section:

```sql
-- Inbound forwarding addresses for bank email sync. Each user gets a unique
-- address (e.g. abc123@inbound.aureus.app) to forward/CC bank notification
-- emails to. The /api/inbound/email webhook receives the raw email, parses it
-- with parseDbsAlert(), and inserts a bank_transactions row.
-- Replaces the old Google OAuth + Gmail API approach (google_tokens table).
create table if not exists inbound_addresses (
  user_id       uuid primary key references auth.users,
  address       text not null unique,          -- e.g. "abc123@inbound.aureus.app"
  address_local text not null,                  -- e.g. "abc123" (before the @)
  last_synced   timestamptz,                    -- last time /api/inbound/sync ran
  total_synced  integer not null default 0,     -- lifetime count of imported txns
  created_at    timestamptz not null default now()
);

alter table inbound_addresses enable row level security;

drop policy if exists "Users manage own inbound address" on inbound_addresses;
create policy "Users manage own inbound address"
  on inbound_addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Step 2: Verify**

```bash
grep -c "inbound_addresses" supabase-schema.sql
```
Expected: at least 3 matches (table, RLS, policy).

**Step 3: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat: add inbound_addresses table for email-forwarding bank sync"
```

---

## Task 2: Add `InboundAddress` type

**Objective:** Add a TypeScript type for the inbound address record.

**Files:**
- Modify: `src/types/index.ts` (append to the end)

**Step 1: Add the type**

```ts
// Inbound forwarding address for bank email sync.
export interface InboundAddress {
  user_id: string
  address: string              // e.g. "abc123@inbound.aureus.app"
  address_local: string        // e.g. "abc123"
  last_synced: string | null
  total_synced: number
  created_at: string
}
```

**Step 2: Verify**

```bash
npm run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add InboundAddress type"
```

---

## Task 3: Create address provisioning lib

**Objective:** Create a helper module with functions to provision a new inbound address for a user and fetch an existing one.

**Files:**
- Create: `src/lib/inbound.ts`

**Step 1: Write the lib**

```ts
import { supabase } from './supabase'
import type { InboundAddress } from '@/types'

// The domain that receives forwarded bank emails. Configure in env.
export const INBOUND_DOMAIN =
  process.env.NEXT_PUBLIC_INBOUND_DOMAIN ?? 'inbound.aureus.app'

// Generate a random 10-char alphanumeric local part.
function randomLocal(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

// Get the user's existing inbound address, or null if not provisioned.
export async function getInboundAddress(userId: string): Promise<InboundAddress | null> {
  const { data } = await supabase
    .from('inbound_addresses')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return data as InboundAddress | null
}

// Provision a new inbound address for the user. Returns the full address.
// If one already exists, returns the existing one.
export async function provisionInboundAddress(userId: string, email: string | undefined): Promise<InboundAddress> {
  const existing = await getInboundAddress(userId)
  if (existing) return existing

  const addressLocal = randomLocal()
  const address = `${addressLocal}@${INBOUND_DOMAIN}`

  const { data, error } = await supabase
    .from('inbound_addresses')
    .insert({
      user_id: userId,
      address,
      address_local: addressLocal,
      last_synced: null,
      total_synced: 0,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to provision address: ${error.message}`)
  return data as InboundAddress
}
```

**Step 2: Verify**

```bash
npm run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add src/lib/inbound.ts
git commit -m "feat: add inbound address provisioning lib"
```

---

## Task 4: Create inbound email webhook API route

**Objective:** Create a POST endpoint that receives a forwarded bank email (from an email-to-webhook service like CloudMailin/Postmark), parses it, and inserts the transaction. This route reuses the existing `parseDbsAlert()` parser and the same dedup + categorization logic from the old `gmail-sync` route.

**Files:**
- Create: `src/app/api/inbound/email/route.ts`

**Step 1: Write the API route**

The route receives a POST with the raw email (either as `multipart/form-data` with the email in a field, or as raw `text/plain` body). It:

1. Validates a shared secret header (`x-inbound-secret`) to prevent unauthorized posts
2. Extracts the `To` header to identify which user's address was used
3. Looks up the user from `inbound_addresses`
4. Parses the email subject + body with `parseDbsAlert()`
5. Auto-categorizes with user rules + `guessCategoryName()`
6. Dedupes by `external_id` (`inbound-{hash}`) and fuzzy-dedup
7. Inserts into `bank_transactions`
8. Updates account balances (same logic as old gmail-sync)

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseDbsAlert } from '@/lib/dbs-email-parser'
import { guessCategoryName } from '@/lib/categorize'
import { findFuzzyDuplicate } from '@/lib/txn-dedupe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Receives forwarded bank emails from an email-to-webhook service
// (CloudMailin, Postmark Inbound, SendGrid Inbound Parse, etc.).
// The email's "To" address identifies the user via inbound_addresses.
// Authentication: a shared secret in the x-inbound-secret header.
//
// Body formats supported:
// 1. multipart/form-data with fields: to, subject, text, html (CloudMailin style)
// 2. application/json with fields: to, subject, text, html
// 3. Raw RFC 822 email in text/plain body (parsed via regex headers)

function extractHeader(raw: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im')
  const m = raw.match(re)
  return m ? m[1].trim() : ''
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(req: Request) {
  // Validate shared secret
  const secret = req.headers.get('x-inbound-secret')
  const expected = process.env.INBOUND_EMAIL_SECRET
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  let toAddress = ''
  let subject = ''
  let textBody = ''
  let htmlBody = ''

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    toAddress = (formData.get('to') as string) ?? ''
    subject = (formData.get('subject') as string) ?? ''
    textBody = (formData.get('text') as string) ?? ''
    htmlBody = (formData.get('html') as string) ?? ''
  } else if (contentType.includes('application/json')) {
    const json = await req.json()
    toAddress = json.to ?? ''
    subject = json.subject ?? ''
    textBody = json.text ?? ''
    htmlBody = json.html ?? ''
  } else {
    // Raw RFC 822 email
    const raw = await req.text()
    toAddress = extractHeader(raw, 'To')
    subject = extractHeader(raw, 'Subject')
    // Split headers from body
    const bodyStart = raw.indexOf('\r\n\r\n') >= 0 ? raw.indexOf('\r\n\r\n') + 4 : raw.indexOf('\n\n') + 2
    textBody = bodyStart > 4 ? raw.slice(bodyStart) : ''
  }

  // Extract the local part of the To address (before the @)
  const toLocal = toAddress.split('@')[0]?.trim().toLowerCase()
  if (!toLocal) {
    return NextResponse.json({ error: 'No To address' }, { status: 400 })
  }

  // Look up the user by inbound address
  const { data: addr } = await supabase
    .from('inbound_addresses')
    .select('user_id')
    .eq('address_local', toLocal)
    .maybeSingle()

  if (!addr?.user_id) {
    return NextResponse.json({ error: `Unknown address: ${toAddress}` }, { status: 404 })
  }

  const userId = addr.user_id

  // Parse the email
  const body = textBody || stripHtml(htmlBody)
  const parsed = parseDbsAlert(subject, body)
  if (!parsed) {
    return NextResponse.json({ error: 'Could not parse transaction from email' }, { status: 422 })
  }

  // Create a service client with service role to bypass RLS (we've already
  // authenticated the user via the address lookup).
  // NOTE: If service role key is not available, fall back to inserting with
  // the anon client — the user must have RLS policies that allow service inserts.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const dbClient = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : supabase

  // Map category guesses → category ids for this user.
  const { data: cats } = await dbClient.from('categories').select('id, name').eq('user_id', userId)
  const catIdByName = new Map((cats ?? []).map((c) => [c.name, c.id]))

  const { data: ruleRows } = await dbClient
    .from('category_rules').select('match_text, category_id, priority').eq('user_id', userId)
  const sortedRules = (ruleRows ?? [])
    .sort((a, b) => b.priority - a.priority || b.match_text.length - a.match_text.length)

  const categoryFor = (desc: string, merchant: string | null, amount: number): string | null => {
    const text = `${desc} ${merchant ?? ''}`.toLowerCase()
    for (const r of sortedRules) {
      if (r.match_text && text.includes(r.match_text)) return r.category_id
    }
    const g = amount < 0 ? guessCategoryName(desc, merchant) : 'Income'
    return g ? (catIdByName.get(g) ?? null) : null
  }

  // Default account: first bank/cash account
  const { data: accts } = await dbClient
    .from('accounts').select('id, type').eq('user_id', userId).order('created_at')
  const defaultAccount = (accts ?? []).find((a) => a.type === 'bank' || a.type === 'cash')?.id ?? null

  const date = parsed.date ?? new Date().toISOString().slice(0, 10)
  const externalId = `inbound-${toLocal}-${date}-${parsed.amount}-${parsed.merchant ?? 'unknown'}`
  // Hash the external id for stability
  const crypto = require('crypto')
  const externalIdHash = `inbound-${crypto.createHash('md5').update(externalId).digest('hex').slice(0, 16)}`

  // Check for existing transaction
  const { data: existing } = await dbClient
    .from('bank_transactions')
    .select('external_id')
    .eq('user_id', userId)
    .eq('external_id', externalIdHash)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ skipped: true, reason: 'duplicate' })
  }

  // Fuzzy dedup
  const { data: prior } = await dbClient
    .from('bank_transactions')
    .select('id, date, amount, payee_key')
    .eq('user_id', userId)
    .eq('date', date)
  const dup = findFuzzyDuplicate(
    { date, amount: parsed.amount, payee_key: parsed.payeeKey },
    prior ?? [],
  )

  const row = {
    user_id: userId,
    account_id: defaultAccount,
    date,
    description: parsed.description,
    merchant: parsed.merchant,
    amount: parsed.amount,
    currency: parsed.currency,
    category_id: categoryFor(parsed.description, parsed.merchant, parsed.amount),
    source: 'email',
    external_id: externalIdHash,
    payee_key: parsed.payeeKey,
    needs_review: parsed.confidence === 'low' || !!dup,
    notes: dup ? `possible duplicate of ${(dup as { id?: string }).id ?? 'existing transaction'}` : null,
  }

  const { data, error } = await dbClient.from('bank_transactions').insert(row).select('id').single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update account balance
  if (defaultAccount) {
    const { data: acc } = await dbClient
      .from('accounts').select('current_balance').eq('id', defaultAccount).single()
    if (acc) {
      await dbClient.from('accounts')
        .update({ current_balance: Number(acc.current_balance) + parsed.amount, updated_at: new Date().toISOString() })
        .eq('id', defaultAccount)
    }
  }

  // Update inbound address stats
  await dbClient.from('inbound_addresses')
    .update({ total_synced: (await dbClient.from('inbound_addresses').select('total_synced').eq('user_id', userId).single()).data?.total_synced + 1 })
    .eq('user_id', userId)

  return NextResponse.json({ inserted: 1, transaction_id: data.id })
}
```

**Step 2: Verify**

```bash
npm run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add src/app/api/inbound/email/route.ts
git commit -m "feat: add inbound email webhook API route"
```

---

## Task 5: Create `ForwardAddressCard` component

**Objective:** Replace the old `GmailCard` with a new component that shows the user's unique forwarding address, a copy button, setup instructions, and a manual "Sync now" button. The card should be clear and inviting — the user needs to know exactly what to do.

**Files:**
- Create: `src/components/spending/ForwardAddressCard.tsx`

**Step 1: Write the component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useSpending } from '@/context/SpendingContext'
import { provisionInboundAddress, getInboundAddress, INBOUND_DOMAIN } from '@/lib/inbound'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, Copy, RefreshCw, CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

export function ForwardAddressCard() {
  const { refreshBankTransactions } = useSpending()
  const [address, setAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [showInstructions, setShowInstructions] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return

      let addr = await getInboundAddress(user.id)
      if (!addr) {
        addr = await provisionInboundAddress(user.id, user.email ?? undefined)
      }
      if (active) {
        setAddress(addr.address)
        setLastSynced(addr.last_synced)
      }
    })().catch((e) => {
      toast.error(`Failed to set up forwarding address: ${String(e)}`)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const copyAddress = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      toast.success('Address copied to clipboard')
    } catch {
      toast.error('Could not copy — select and copy manually')
    }
  }

  const sync = async () => {
    setSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error('Not signed in'); return }
      // The webhook is triggered by the email provider — there's no "sync" API
      // to call from the client. But we can refresh transactions to show any
      // that were already received.
      await refreshBankTransactions()
      setLastSynced(new Date().toISOString())
      toast.success('Transactions refreshed')
    } catch (e) {
      toast.error(`Refresh failed: ${String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <Card className="max-w-md">
        <CardContent className="flex items-center gap-2 py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Setting up your address…</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" /> Bank email forwarding
        </CardTitle>
        <CardDescription>
          Forward your bank notification emails to your unique address below.
          We'll automatically parse the amount, merchant, and category.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Address display + copy */}
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono">
            {address}
          </code>
          <Button size="icon" variant="outline" onClick={copyAddress} title="Copy address">
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        {/* Status */}
        {lastSynced && (
          <div className="flex items-center gap-1.5 text-sm text-up">
            <CheckCircle2 className="h-4 w-4" /> Last synced {new Date(lastSynced).toLocaleString()}
          </div>
        )}

        {/* Instructions toggle */}
        <button
          onClick={() => setShowInstructions((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          How to set up forwarding
          {showInstructions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {showInstructions && (
          <ol className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
            <li>Log in to your bank's app or website (DBS/POSB, OCBC, etc.)</li>
            <li>Find the notification/email alerts settings</li>
            <li>Add <code className="font-mono text-foreground">{address}</code> as a recipient for transaction alerts</li>
            <li>New transactions will appear here automatically within seconds of the email arriving</li>
            <li>You can also manually forward any bank email to this address</li>
          </ol>
        )}

        {/* Refresh button */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
            {syncing
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refreshing…</>
              : <><RefreshCw className="mr-2 h-4 w-4" /> Refresh</>}
          </Button>
          <span className="text-xs text-muted-foreground">
            Forwarded emails are processed automatically — use Refresh to check for new transactions.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Verify**

```bash
npm run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add src/components/spending/ForwardAddressCard.tsx
git commit -m "feat: add ForwardAddressCard component"
```

---

## Task 6: Update Settings page to use `ForwardAddressCard`

**Objective:** Replace the `GmailCard` import with `ForwardAddressCard` in the Settings page.

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Patch the imports and JSX**

Replace line 10:
```tsx
import { GmailCard } from '@/components/spending/GmailCard'
```
with:
```tsx
import { ForwardAddressCard } from '@/components/spending/ForwardAddressCard'
```

Replace line 61:
```tsx
      <GmailCard />
```
with:
```tsx
      <ForwardAddressCard />
```

**Step 2: Verify**

```bash
npm run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: replace GmailCard with ForwardAddressCard in Settings"
```

---

## Task 7: Update `SpendingContext` auto-sync logic

**Objective:** Replace the Gmail auto-sync logic (which calls `/api/bank/gmail-sync` with an OAuth token) with a simpler pattern: on session start, just refresh bank transactions (the webhook handles insertion automatically).

**Files:**
- Modify: `src/context/SpendingContext.tsx` (lines ~246-277)

**Step 1: Replace the auto-sync block**

Find this block (lines ~246-277):

```tsx
  // Auto-sync Gmail bank alerts once per session (if connected & not synced
  // recently) so spending stays current without a manual "Sync now".
  useEffect(() => {
    if (loading) return
    let cancelled = false
    ;(async () => {
      try { if (window.sessionStorage.getItem('gmail_autosync_done')) return } catch { return }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: tok } = await supabase
        .from('google_tokens').select('last_synced').eq('user_id', user.id).maybeSingle()
      if (!tok) return // Gmail not connected
      try { window.sessionStorage.setItem('gmail_autosync_done', '1') } catch { /* ignore */ }
      // Throttle: skip if synced within the last 6h.
      if (tok.last_synced && Date.now() - new Date(tok.last_synced).getTime() < 6 * 3600 * 1000) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      try {
        const res = await fetch('/api/bank/gmail-sync', {
          method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok || cancelled) return
        const j = await res.json().catch(() => null)
        if (j?.inserted > 0) {
          await refreshBankTransactions()
          await refreshAccounts()
          toast.success(`Synced ${j.inserted} new transaction${j.inserted === 1 ? '' : 's'} from Gmail`)
        }
      } catch { /* silent — manual Sync still available */ }
    })()
    return () => { cancelled = true }
  }, [loading, refreshBankTransactions, refreshAccounts])
```

Replace with:

```tsx
  // Auto-refresh bank transactions once per session so any transactions
  // received via the inbound email webhook appear without a manual refresh.
  // The webhook inserts rows server-side; this just pulls them into the UI.
  useEffect(() => {
    if (loading) return
    let cancelled = false
    ;(async () => {
      try { if (window.sessionStorage.getItem('inbound_autorefresh_done')) return } catch { return }
      try { window.sessionStorage.setItem('inbound_autorefresh_done', '1') } catch { /* ignore */ }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // Check if user has an inbound address
      const { data: addr } = await supabase
        .from('inbound_addresses').select('address').eq('user_id', user.id).maybeSingle()
      if (!addr) return // No inbound address provisioned yet
      await refreshBankTransactions()
    })()
    return () => { cancelled = true }
  }, [loading, refreshBankTransactions])
```

**Step 2: Verify**

```bash
npm run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add src/context/SpendingContext.tsx
git commit -m "feat: replace Gmail auto-sync with inbound auto-refresh"
```

---

## Task 8: Clean up `supabase.ts`

**Objective:** Remove the OAuth refresh token capture logic that was specific to the Gmail OAuth flow.

**Files:**
- Modify: `src/lib/supabase.ts`

**Step 1: Rewrite the file**

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

Remove the `PENDING_GOOGLE_TOKEN_KEY` export and the `onAuthStateChange` listener.

**Step 2: Check for other references to `PENDING_GOOGLE_TOKEN_KEY`**

```bash
grep -rn "PENDING_GOOGLE_TOKEN_KEY" src/
```
Expected: only in `GmailCard.tsx` (which is being deleted in Task 10).

**Step 3: Verify**

```bash
npm run build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "refactor: remove Gmail OAuth token capture from supabase client"
```

---

## Task 9: Add environment variables

**Objective:** Document the new env vars needed for the inbound email flow.

**Files:**
- Modify: `.env.local.example`

**Step 1: Add the new variables**

Append to `.env.local.example`:

```bash
# Inbound email forwarding
# The domain that receives forwarded bank emails
NEXT_PUBLIC_INBOUND_DOMAIN=inbound.aureus.app
# Shared secret for the /api/inbound/email webhook (set this to a random string)
INBOUND_EMAIL_SECRET=your-random-secret-here
# Supabase service role key (for inserting transactions server-side, bypassing RLS)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Remove or comment out the old Google OAuth vars:

```bash
# Google OAuth for Gmail sync (DEPRECATED — replaced by inbound email forwarding)
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
```

**Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs: add inbound email env vars, deprecate Google OAuth vars"
```

---

## Task 10: Remove old Gmail files + deprecate `google_tokens`

**Objective:** Delete the old Gmail-specific files that are no longer used, and mark the `google_tokens` table as deprecated in the schema.

**Files:**
- Delete: `src/components/spending/GmailCard.tsx`
- Delete: `src/app/api/bank/gmail-sync/route.ts`
- Modify: `supabase-schema.sql` (add deprecation comment)

**Step 1: Delete old files**

```bash
git rm src/components/spending/GmailCard.tsx
git rm src/app/api/bank/gmail-sync/route.ts
```

If the `src/app/api/bank/` directory is now empty, remove it:
```bash
rmdir src/app/api/bank/ 2>/dev/null || true
```

**Step 2: Add deprecation comment to `google_tokens` in schema**

In `supabase-schema.sql`, add this comment before the `google_tokens` table definition:

```sql
-- DEPRECATED: google_tokens is replaced by inbound_addresses (email forwarding).
-- Kept for migration reference; new deployments should use inbound_addresses instead.
```

**Step 3: Verify**

```bash
npm run build 2>&1 | tail -5
```
Expected: build succeeds — no remaining imports of `GmailCard` or `gmail-sync`.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old Gmail OAuth sync files, deprecate google_tokens table"
```

---

## Task 11: Final build + lint + test

**Objective:** Verify everything compiles and tests pass.

**Step 1: Run lint**

```bash
npm run lint
```
Expected: No errors. Fix any lint issues in new files.

**Step 2: Run build**

```bash
npm run build
```
Expected: Build succeeds. Fix any TypeScript or build errors.

**Step 3: Run tests**

```bash
npm run test
```
Expected: All tests pass. The existing `categorize.test.ts` tests should be unaffected since `categorize.ts` and `dbs-email-parser.ts` are unchanged.

**Step 4: Check for orphaned references**

```bash
# Should return nothing
grep -rn "GmailCard\|gmail-sync\|google_tokens\|PENDING_GOOGLE_TOKEN" src/ --include="*.ts" --include="*.tsx"
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: final build + lint pass for inbound email forwarding feature"
```

---

## Risks, Tradeoffs, and Open Questions

### Risks

1. **Email-to-webhook provider choice**: This plan assumes a service like CloudMailin, Postmark Inbound, or SendGrid Inbound Parse will POST to `/api/inbound/email`. The user needs to set up an account with one of these providers and configure it to forward emails at `*@inbound.aureus.app` to the webhook URL. The API route is designed to handle multiple body formats (form-data, JSON, raw RFC 822) to be provider-agnostic.

2. **Service role key**: The webhook route uses `SUPABASE_SERVICE_ROLE_KEY` to insert transactions server-side (bypassing RLS since there's no user session in a webhook). If this key is not configured, the route falls back to the anon client — but that requires RLS policies to allow inserts from the service. The user must ensure the service role key is in `.env.local`.

3. **Email parsing reliability**: The existing `parseDbsAlert()` parser is tuned for DBS/POSB alert emails. If the user forwards emails from other banks (OCBC, UOB, etc.), the parser may not extract the amount/merchant correctly. The parser would need extending for other bank formats — but this is a separate task.

4. **No real-time push to client**: When a forwarded email is received and processed by the webhook, the transaction is inserted into the DB, but the client doesn't know about it in real-time. The user sees it on next page load or manual refresh. This is acceptable for a personal finance tool — transactions arrive within minutes of spending, and the user can refresh.

5. **Address provisioning race condition**: If the user opens Settings on two devices simultaneously, both might try to provision an address at the same time. The `insert` has a primary key on `user_id`, so the second insert will fail. The lib catches this by checking for an existing address first — but a truly concurrent request could still race. The `upsert` pattern with `onConflict: 'user_id'` would be safer.

### Tradeoffs

- **Simpler for users**: No OAuth flow, no Google account linking, no scary permission prompts. Just "forward your emails to this address."
- **More infrastructure**: Requires an email-to-webhook service (external dependency). The old approach used only Google OAuth + Gmail API (no external service).
- **Less control**: The user can't control which emails are synced (all forwarded emails are processed). The old approach only read emails from specific DBS/POSB sender addresses.
- **Privacy**: The user's bank emails pass through a third-party email-to-webhook service. The old approach read them directly via Gmail API.

### Open Questions

1. **Which email-to-webhook provider?** — The user needs to choose CloudMailin, Postmark, SendGrid, or similar. The API route is provider-agnostic, but the provider configuration is external to this codebase.

2. **Should we support multiple banks?** — Currently `parseDbsAlert()` only handles DBS/POSB. Should we extend the parser for OCBC, UOB, Citibank, etc.? Defer to a follow-up.

3. **Should the webhook send a notification?** — Should the webhook trigger a push notification (e.g. via Supabase Realtime) so the client auto-refreshes? Nice-to-have, defer.

4. **What about the `google_tokens` table?** — Should we drop it entirely, or keep it for migration? The plan marks it as deprecated. If the user wants a clean cut, we can add a migration that drops it.

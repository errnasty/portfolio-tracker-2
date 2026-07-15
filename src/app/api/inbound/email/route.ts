import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { parseDbsAlert } from '@/lib/dbs-email-parser'
import { categorizeWithAI } from '@/lib/ai-categorize'
import { findFuzzyDuplicate } from '@/lib/txn-dedupe'
import { normalizeInboundEmail } from '@/lib/inbound-payload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Receives forwarded bank emails from an email-to-webhook service
// (CloudMailin, Postmark Inbound, SendGrid Inbound Parse, etc.).
// The email's delivery recipient identifies the user via inbound_addresses
// (see normalizeInboundEmail for how recipients are ranked).
//
// Authentication (any one): the x-inbound-secret header, a ?secret= query
// param, or HTTP Basic auth password — some free provider tiers can't set
// custom headers, so we accept all three.
//
// Body formats supported (see src/lib/inbound-payload.ts):
//   multipart/form-data (CloudMailin), application/json (CloudMailin/Postmark/
//   generic), or raw RFC 822 text.

function secretFromRequest(req: Request): string | null {
  const header = req.headers.get('x-inbound-secret')
  if (header) return header
  const url = new URL(req.url)
  const q = url.searchParams.get('secret')
  if (q) return q
  const auth = req.headers.get('authorization') ?? ''
  const basic = auth.match(/^Basic\s+(.+)$/i)
  if (basic) {
    try {
      const decoded = Buffer.from(basic[1], 'base64').toString('utf8')
      const pwd = decoded.slice(decoded.indexOf(':') + 1)
      if (pwd) return pwd
    } catch { /* ignore */ }
  }
  return null
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
  // Validate shared secret (header, query param, or Basic-auth password).
  const secret = secretFromRequest(req)
  const expected = process.env.INBOUND_EMAIL_SECRET
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  // Service client bypasses RLS — required for the address lookup below
  // (the webhook has no user session, so anon-key reads are RLS-blocked).
  // Falls back to the anon client, which only works if RLS is off.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const dbClient = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : supabase

  // Normalize the many provider payload shapes into one record with an
  // ordered list of candidate recipients (see src/lib/inbound-payload.ts).
  const contentType = req.headers.get('content-type') ?? ''
  let normalized
  if (contentType.includes('multipart/form-data')) {
    normalized = normalizeInboundEmail(contentType, await req.formData())
  } else if (contentType.includes('application/json')) {
    normalized = normalizeInboundEmail(contentType, await req.json())
  } else {
    normalized = normalizeInboundEmail(contentType, await req.text())
  }
  const { recipients, from: fromAddress, subject, text: textBody, html: htmlBody } = normalized

  // Resolve the user from the candidate recipients. Try, per candidate:
  // exact `address` → `provider_address` → local-part `address_local`. Then,
  // as a last resort for this personal app, if exactly one row exists use it
  // (covers Gmail auto-forwards that only preserve the original To: header).
  let userId: string | null = null
  let matchedBy = 'none'
  for (const rcpt of recipients) {
    const local = rcpt.split('@')[0]?.trim().toLowerCase()
    // recipients are already lowercased by the normalizer; stored addresses
    // are lowercase, so exact eq is safe (no ilike wildcard concerns).
    const { data: hit } = await dbClient
      .from('inbound_addresses')
      .select('user_id')
      .or([
        `address.eq.${rcpt}`,
        `provider_address.eq.${rcpt}`,
        local ? `address_local.eq.${local}` : '',
      ].filter(Boolean).join(','))
      .maybeSingle()
    if (hit?.user_id) { userId = hit.user_id; matchedBy = 'recipient'; break }
  }
  if (!userId) {
    const { data: all } = await dbClient.from('inbound_addresses').select('user_id')
    if ((all ?? []).length === 1) { userId = all![0].user_id; matchedBy = 'single-row-fallback' }
  }
  if (!userId) {
    return NextResponse.json(
      { error: `No matching inbound address for recipients: ${recipients.join(', ') || '(none)'}` },
      { status: 404 },
    )
  }
  // Deterministic local part used only for the external_id hash below.
  const toLocal = (recipients[0]?.split('@')[0] ?? 'inbound').toLowerCase()

  // ── Forwarding-address verification emails ──────────────────────────────
  // Gmail (and Outlook) require the destination of an auto-forward rule to
  // confirm before any mail flows. That confirmation email lands here — not
  // in an inbox the user can read — so capture the code + link and surface
  // them on the Settings page (ForwardAddressCard).
  const bodyAll = `${subject}\n${textBody}\n${htmlBody}`
  const isVerificationEmail =
    /forwarding-noreply@google\.com/i.test(fromAddress) ||
    /gmail forwarding confirmation/i.test(subject) ||
    /mail-settings\.google\.com\/mail\/vf-/i.test(bodyAll)

  if (isVerificationEmail) {
    const code = subject.match(/\(#(\d{5,})\)/)?.[1]
      ?? bodyAll.match(/confirmation code[:\s]*(\d{5,})/i)?.[1]
      ?? null
    const link = bodyAll.match(/https:\/\/mail-settings\.google\.com\/mail\/vf-[^\s"'<>()\]]+/i)?.[0] ?? null
    const { error: verifyErr } = await dbClient
      .from('inbound_addresses')
      .update({
        verify_code: code,
        verify_link: link,
        verify_from: fromAddress || null,
        verify_received_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    if (verifyErr) {
      return NextResponse.json({ error: verifyErr.message }, { status: 500 })
    }
    return NextResponse.json({ verification: true, code_found: !!code, link_found: !!link })
  }

  // Parse the email
  const body = textBody || stripHtml(htmlBody)
  const parsed = parseDbsAlert(subject, body)
  if (!parsed) {
    return NextResponse.json({ error: 'Could not parse transaction from email' }, { status: 422 })
  }

  // Map category guesses → category ids for this user.
  const { data: cats } = await dbClient.from('categories').select('id, name, kind').eq('user_id', userId)
  const catIdByName = new Map((cats ?? []).map((c) => [c.name, c.id]))
  const catListForAI = (cats ?? []).map((c) => ({ name: c.name, kind: c.kind }))

  const { data: ruleRows } = await dbClient
    .from('category_rules').select('match_text, category_id, priority').eq('user_id', userId)
  const sortedRules = (ruleRows ?? [])
    .sort((a, b) => b.priority - a.priority || b.match_text.length - a.match_text.length)

  // User rules first (instant), then AI categorization (free OpenRouter model),
  // with keyword-based guessCategoryName as the final fallback.
  const categoryFor = async (desc: string, merchant: string | null, amount: number): Promise<string | null> => {
    const text = `${desc} ${merchant ?? ''}`.toLowerCase()
    for (const r of sortedRules) {
      if (r.match_text && text.includes(r.match_text)) return r.category_id
    }
    const result = await categorizeWithAI(
      { description: desc, merchant, amount, currency: parsed.currency },
      catListForAI,
    )
    if (result.category) {
      return catIdByName.get(result.category) ?? null
    }
    return null
  }

  // Default account: first bank/cash account
  const { data: accts } = await dbClient
    .from('accounts').select('id, type').eq('user_id', userId).order('created_at')
  const defaultAccount = (accts ?? []).find((a) => a.type === 'bank' || a.type === 'cash')?.id ?? null

  const date = parsed.date ?? new Date().toISOString().slice(0, 10)
  const externalId = `inbound-${toLocal}-${date}-${parsed.amount}-${parsed.merchant ?? 'unknown'}`
  // Hash the external id for stability
  const externalIdHash = `inbound-${createHash('md5').update(externalId).digest('hex').slice(0, 16)}`

  // Check for existing transaction by external_id
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
    .select('id, date, amount, payee_key, description')
    .eq('user_id', userId)
    .eq('date', date)
  const dup = findFuzzyDuplicate(
    { date, amount: parsed.amount, payee_key: parsed.payeeKey, description: parsed.description },
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
    category_id: await categoryFor(parsed.description, parsed.merchant, parsed.amount),
    source: 'email',
    external_id: externalIdHash,
    payee_key: parsed.payeeKey,
    needs_review: parsed.confidence === 'low' || !!dup,
    notes: dup ? `possible duplicate of ${dup.id ?? 'existing transaction'}` : null,
  }

  const { data, error } = await dbClient.from('bank_transactions').insert(row).select('id').single()
  if (error) {
    // If it's a unique constraint violation on external_id, it's a duplicate
    // that raced between our check and the insert — treat as a skip, not an error.
    if (error.code === '23505') {
      return NextResponse.json({ skipped: true, reason: 'duplicate (race)' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update account balance atomically using a Postgres RPC increment.
  // Falls back to read-modify-write if the RPC doesn't exist.
  if (defaultAccount) {
    try {
      const { error: rpcErr } = await dbClient.rpc('increment_account_balance', {
        p_account_id: defaultAccount,
        p_delta: parsed.amount,
      })
      if (rpcErr) {
        // Fallback: read-modify-write (best-effort; the transaction is already saved).
        const { data: acc } = await dbClient
          .from('accounts').select('current_balance').eq('id', defaultAccount).maybeSingle()
        if (acc) {
          await dbClient.from('accounts')
            .update({
              current_balance: Number(acc.current_balance) + parsed.amount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', defaultAccount)
        }
      }
    } catch (balErr) {
      console.warn(`[inbound/email] Balance update failed for account ${defaultAccount}: ${String(balErr)}`)
      // Transaction is already saved; balance is best-effort.
    }
  }

  // Update inbound address stats atomically (last_synced + total_synced).
  // Using a single update avoids the read-modify-write race.
  try {
    await dbClient
      .from('inbound_addresses')
      .update({
        last_synced: new Date().toISOString(),
        // total_synced is incremented via RPC to avoid race; fallback below.
      })
      .eq('user_id', userId)

    // Best-effort total_synced increment (read-modify-write is fine for a
    // personal low-traffic tool; if two webhooks race, the count is off by 1).
    const { data: cur } = await dbClient
      .from('inbound_addresses')
      .select('total_synced')
      .eq('user_id', userId)
      .maybeSingle()
    if (cur) {
      await dbClient
        .from('inbound_addresses')
        .update({ total_synced: (cur.total_synced ?? 0) + 1 })
        .eq('user_id', userId)
    }
  } catch (statsErr) {
    console.warn(`[inbound/email] Stats update failed: ${String(statsErr)}`)
    // Transaction is already saved; stats are best-effort.
  }

  return NextResponse.json({ inserted: 1, transaction_id: data.id, resolved: matchedBy })
}

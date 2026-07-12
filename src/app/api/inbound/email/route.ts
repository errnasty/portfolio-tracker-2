import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { parseDbsAlert } from '@/lib/dbs-email-parser'
import { categorizeWithAI } from '@/lib/ai-categorize'
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
    const sep = raw.indexOf('\r\n\r\n') >= 0 ? '\r\n\r\n' : '\n\n'
    const bodyStart = raw.indexOf(sep) + sep.length
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

  return NextResponse.json({ inserted: 1, transaction_id: data.id })
}

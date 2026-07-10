import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
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
    notes: dup ? `possible duplicate of ${dup.id ?? 'existing transaction'}` : null,
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

  // Update inbound address stats (bump last_synced; increment total_synced).
  // Read-modify-write is safe enough for a personal low-traffic tool.
  const { data: cur } = await dbClient
    .from('inbound_addresses')
    .select('total_synced')
    .eq('user_id', userId)
    .maybeSingle()
  await dbClient
    .from('inbound_addresses')
    .update({
      total_synced: (cur?.total_synced ?? 0) + 1,
      last_synced: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return NextResponse.json({ inserted: 1, transaction_id: data.id })
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseDbsAlert } from '@/lib/dbs-email-parser'
import { guessCategoryName } from '@/lib/categorize'
import { findFuzzyDuplicate } from '@/lib/txn-dedupe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Reads DBS/POSB transaction-alert emails via the Gmail API and inserts them as
// bank_transactions. Auth: the client passes its Supabase access token as a
// Bearer header so all DB access runs under the user's RLS policies.
//
// Requires env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. The user must have
// connected Gmail (read-only) in Settings, which stores a refresh token in the
// google_tokens table.

// Sender-only filter is the most reliable — DBS/POSB alerts all come from these
// addresses. parseDbsAlert() drops anything without a transaction amount.
const GMAIL_QUERY =
  'from:(ibanking.alert@dbs.com OR alert@dbs.com.sg OR dbs.com.sg OR dbs.com OR posb.com.sg)'

function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

// Recursively pull the best text body out of a Gmail message payload.
function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data && /text\/(plain|html)/.test(payload.mimeType ?? '')) {
    return decodeB64Url(payload.body.data)
  }
  let plain = ''
  let html = ''
  for (const part of payload.parts ?? []) {
    if (part.mimeType === 'text/plain' && part.body?.data) plain += decodeB64Url(part.body.data)
    else if (part.mimeType === 'text/html' && part.body?.data) html += decodeB64Url(part.body.data)
    else if (part.parts) { const nested = extractBody(part); if (nested) plain += nested }
  }
  return plain || html
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Gmail sync not configured (missing GOOGLE_CLIENT_ID/SECRET).' }, { status: 500 })
  }

  // Supabase client scoped to the caller's JWT → RLS applies.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )

  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: tok } = await supabase
    .from('google_tokens').select('refresh_token, last_synced').eq('user_id', user.id).single()
  if (!tok?.refresh_token) {
    return NextResponse.json({ error: 'Gmail not connected. Connect it in Settings.' }, { status: 400 })
  }

  // 1) Refresh → access token.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: tok.refresh_token, grant_type: 'refresh_token',
    }),
  })
  const tokenJson = await tokenRes.json().catch(() => ({} as Record<string, unknown>))
  if (!tokenRes.ok) {
    const detail = `${tokenJson.error ?? ''} ${tokenJson.error_description ?? ''}`.trim()
    return NextResponse.json(
      { error: `Failed to refresh Google token (${tokenRes.status})${detail ? `: ${detail}` : ''}. Reconnect Gmail.` },
      { status: 502 },
    )
  }
  const accessToken = tokenJson.access_token as string
  // Scopes actually attached to this access token. Google returns these on
  // refresh; if gmail.readonly is absent, the stored refresh token predates the
  // Gmail grant (reconnect needed) even though the account shows the permission.
  const grantedScope = (tokenJson.scope as string | undefined) ?? ''

  // 2) List candidate messages.
  const since = tok.last_synced
    ? `after:${Math.floor(new Date(tok.last_synced).getTime() / 1000)}`
    : 'newer_than:30d'
  const q = encodeURIComponent(`${GMAIL_QUERY} ${since}`)
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!listRes.ok) {
    const body = await listRes.text().catch(() => '')
    console.error('gmail-sync list failed', { status: listRes.status, grantedScope, body: body.slice(0, 500) })
    const hasGmailScope = /gmail\.readonly|mail\.google\.com/.test(grantedScope)
    const hint = !hasGmailScope
      ? 'Stored Google token is missing Gmail read access — disconnect and reconnect Gmail, keeping the "Read your email" permission checked.'
      : `Gmail API returned ${listRes.status}: ${body.slice(0, 300)}`
    return NextResponse.json(
      { error: `Gmail list failed. ${hint}`, status: listRes.status, grantedScope },
      { status: 502 },
    )
  }
  const messages: { id: string }[] = (await listRes.json()).messages ?? []

  // Map category guesses → category ids for this user.
  const { data: cats } = await supabase.from('categories').select('id, name').eq('user_id', user.id)
  const catIdByName = new Map((cats ?? []).map((c) => [c.name, c.id]))
  // User-defined rules run before the built-in keyword matcher.
  const { data: ruleRows } = await supabase
    .from('category_rules').select('match_text, category_id, priority').eq('user_id', user.id)
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
  // Default account: first bank/cash account, else null.
  const { data: accts } = await supabase
    .from('accounts').select('id, type').eq('user_id', user.id).order('created_at')
  const defaultAccount = (accts ?? []).find((a) => a.type === 'bank' || a.type === 'cash')?.id ?? null

  // 3) Fetch + parse each message.
  const rows: Record<string, unknown>[] = []
  for (const { id } of messages) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!msgRes.ok) continue
    const msg = await msgRes.json()
    const subject = (msg.payload?.headers ?? []).find((h: any) => h.name === 'Subject')?.value ?? ''
    const body = extractBody(msg.payload)
    const parsed = parseDbsAlert(subject, body)
    if (!parsed) continue

    const date = parsed.date ?? new Date(Number(msg.internalDate)).toISOString().slice(0, 10)
    rows.push({
      user_id: user.id,
      account_id: defaultAccount,
      date,
      description: parsed.description,
      merchant: parsed.merchant,
      amount: parsed.amount,
      currency: parsed.currency,
      category_id: categoryFor(parsed.description, parsed.merchant, parsed.amount),
      source: 'email',
      external_id: `gmail-${id}`,
      payee_key: parsed.payeeKey,
      needs_review: parsed.confidence === 'low',
      notes: null,
    })
  }

  let inserted = 0
  if (rows.length > 0) {
    // Skip messages already imported (dedupe by external_id) without ON CONFLICT.
    const ids = rows.map((r) => r.external_id as string)
    const { data: ex } = await supabase
      .from('bank_transactions').select('external_id').eq('user_id', user.id).in('external_id', ids)
    const seen = new Set((ex ?? []).map((r) => r.external_id))
    const fresh = rows.filter((r) => !seen.has(r.external_id as string))

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

    if (fresh.length > 0) {
      const { data, error } = await supabase.from('bank_transactions').insert(fresh).select('id')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      inserted = data?.length ?? 0
      // Keep the account balance connected to synced flows.
      if (defaultAccount) {
        const delta = fresh.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
        const { data: acc } = await supabase
          .from('accounts').select('current_balance').eq('id', defaultAccount).single()
        if (acc) {
          await supabase.from('accounts')
            .update({ current_balance: Number(acc.current_balance) + delta, updated_at: new Date().toISOString() })
            .eq('id', defaultAccount)
        }
      }
      // Money sent to Interactive Brokers → brokerage cash account.
      const ibkrDelta = fresh
        .filter((r) => /interactive br|rec trust|ibkr/i.test(`${r.description} ${r.merchant ?? ''}`) && Number(r.amount) < 0)
        .reduce((sum, r) => sum + -(Number(r.amount) || 0), 0)
      if (ibkrDelta > 0) {
        const { data: cashAcc } = await supabase
          .from('accounts').select('id, current_balance')
          .eq('user_id', user.id).eq('type', 'cash').ilike('name', '%interactive%').limit(1).maybeSingle()
        if (cashAcc) {
          await supabase.from('accounts')
            .update({ current_balance: Number(cashAcc.current_balance) + ibkrDelta, updated_at: new Date().toISOString() })
            .eq('id', cashAcc.id)
        } else {
          await supabase.from('accounts').insert({
            user_id: user.id, name: 'Interactive Brokers', type: 'cash',
            institution: 'Interactive Brokers', currency: 'SGD', current_balance: ibkrDelta, is_active: true,
          })
        }
      }
    }
  }

  await supabase.from('google_tokens')
    .update({ last_synced: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  return NextResponse.json({ scanned: messages.length, inserted })
}

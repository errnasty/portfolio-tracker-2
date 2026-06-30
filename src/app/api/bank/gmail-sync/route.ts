import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseDbsAlert } from '@/lib/dbs-email-parser'
import { guessCategoryName } from '@/lib/categorize'

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
  if (!tokenRes.ok) {
    return NextResponse.json({ error: 'Failed to refresh Google token. Reconnect Gmail.' }, { status: 502 })
  }
  const accessToken = (await tokenRes.json()).access_token as string

  // 2) List candidate messages.
  const since = tok.last_synced
    ? `after:${Math.floor(new Date(tok.last_synced).getTime() / 1000)}`
    : 'newer_than:30d'
  const q = encodeURIComponent(`${GMAIL_QUERY} ${since}`)
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!listRes.ok) return NextResponse.json({ error: 'Gmail list failed' }, { status: 502 })
  const messages: { id: string }[] = (await listRes.json()).messages ?? []

  // Map category guesses → category ids for this user.
  const { data: cats } = await supabase.from('categories').select('id, name').eq('user_id', user.id)
  const catIdByName = new Map((cats ?? []).map((c) => [c.name, c.id]))
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
    const guess = parsed.amount < 0 ? guessCategoryName(parsed.description, parsed.merchant) : 'Income'
    rows.push({
      user_id: user.id,
      account_id: defaultAccount,
      date,
      description: parsed.description,
      merchant: parsed.merchant,
      amount: parsed.amount,
      currency: parsed.currency,
      category_id: guess ? (catIdByName.get(guess) ?? null) : null,
      source: 'email',
      external_id: `gmail-${id}`,
      notes: null,
    })
  }

  let inserted = 0
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = data?.length ?? 0
  }

  await supabase.from('google_tokens')
    .update({ last_synced: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  return NextResponse.json({ scanned: messages.length, inserted })
}

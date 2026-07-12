import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Provisions (or returns) a unique inbound forwarding address for the
// authenticated user. Uses the service role key to bypass RLS, so it works
// even before the user's RLS policies are fully set up. The address is
// deterministic per user (hash of user_id) so two calls always agree.
//
// GET /api/inbound/provision  →  { address, last_synced, total_synced }

const INBOUND_DOMAIN = process.env.NEXT_PUBLIC_INBOUND_DOMAIN ?? 'inbound.aureus.app'

function deterministicLocal(userId: string): string {
  // 10-char base36 hash of the user_id. Stable across calls, so we never
  // generate a second address for the same user even on concurrent requests.
  return createHash('md5').update(userId).digest('hex').slice(0, 10)
}

export async function GET(req: Request) {
  // Authenticate via the Authorization header (Bearer token from the client).
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Verify the user's JWT.
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await authClient.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = user.id

  // Use service role key to bypass RLS for the address lookup/insert.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const dbClient = serviceKey
    ? createClient(supabaseUrl, serviceKey)
    : authClient // fallback: anon client with user's JWT (RLS applies)

  // Check for existing address.
  const { data: existing } = await dbClient
    .from('inbound_addresses')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(existing)
  }

  // Provision a new address.
  const addressLocal = deterministicLocal(userId)
  const address = `${addressLocal}@${INBOUND_DOMAIN}`

  const { data, error } = await dbClient
    .from('inbound_addresses')
    .upsert(
      {
        user_id: userId,
        address,
        address_local: addressLocal,
        last_synced: null,
        total_synced: 0,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single()

  if (error) {
    return NextResponse.json(
      { error: `Failed to provision address: ${error.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json(data)
}

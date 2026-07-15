import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { FUND_PROVIDERS } from '@/lib/server/fund-scrapers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Fetches a fund's current NAV from its price_provider (see the registry in
// src/lib/server/fund-scrapers). Two uses from the holdings page:
//  - Preview while adding/editing a holding: pass {provider, ref} only.
//  - "Refresh now" on an existing holding: also pass holding_id, and this
//    route persists custom_price/custom_price_asof directly (one round trip).
//
// POST { provider, ref, holding_id? }
//  -> { price, asOf, name } | { error }
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await client.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { provider, ref, holding_id } = (await req.json()) as {
    provider?: string; ref?: string; holding_id?: string
  }
  if (!provider || !ref) {
    return NextResponse.json({ error: 'provider and ref are required' }, { status: 400 })
  }

  const impl = FUND_PROVIDERS[provider]
  if (!impl) return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 })

  try {
    const quote = await impl.fetchQuote(ref)

    if (holding_id) {
      // RLS (auth.uid() = user_id) scopes this update to the caller's own row.
      const { error } = await client
        .from('holdings')
        .update({
          custom_price: quote.price,
          custom_price_asof: quote.asOf ?? new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        })
        .eq('id', holding_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(quote)
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 502 })
  }
}

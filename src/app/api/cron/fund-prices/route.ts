import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { FUND_PROVIDERS } from '@/lib/server/fund-scrapers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Daily job (see vercel.json) that refreshes custom_price for every holding
// with an auto-refresh price_provider set (e.g. LionGlobal unit trusts).
// Protected by CRON_SECRET, which Vercel Cron sends as a Bearer token
// automatically. On a per-holding fetch failure, the last known custom_price
// is left untouched — a broken scrape never wipes out a good price.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  const { data: holdings, error } = await db
    .from('holdings')
    .select('id, ticker, price_provider, price_provider_ref')
    .eq('price_source', 'custom')
    .not('price_provider', 'is', null)
    .not('price_provider_ref', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { ticker: string; ok: boolean; detail: string }[] = []

  for (const h of holdings ?? []) {
    const impl = FUND_PROVIDERS[h.price_provider as string]
    if (!impl) {
      results.push({ ticker: h.ticker, ok: false, detail: `unknown provider ${h.price_provider}` })
      continue
    }
    try {
      const quote = await impl.fetchQuote(h.price_provider_ref as string)
      const { error: updErr } = await db
        .from('holdings')
        .update({
          custom_price: quote.price,
          custom_price_asof: quote.asOf ?? new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        })
        .eq('id', h.id)
      if (updErr) throw updErr
      results.push({ ticker: h.ticker, ok: true, detail: `price=${quote.price}` })
    } catch (err) {
      // Leave custom_price as-is — last known good value survives a failed scrape.
      results.push({ ticker: h.ticker, ok: false, detail: String((err as Error).message ?? err) })
    }
  }

  return NextResponse.json({ checked: results.length, results })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchQuotes } from '@/lib/server/yahoo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/prices  Body: { tickers: string[] }  -> { quotes: {...} }
// Live-fetches from Yahoo; any ticker that comes back at price 0 (rate
// limited, delisted lookup hiccup, etc.) is backfilled from price_cache —
// the daily cron's last-known-good snapshot — so a transient Yahoo failure
// never shows $0 to the user. Cache entries are also warmed opportunistically
// from live fetches here (best-effort, not required for correctness).
export async function POST(req: NextRequest) {
  try {
    const { tickers } = (await req.json()) as { tickers: string[] }
    if (!tickers || tickers.length === 0) return NextResponse.json({ quotes: {} })

    const quotes = await fetchQuotes(tickers)

    const failed = tickers.filter((t) => !quotes[t] || quotes[t].price <= 0)
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey)

      if (failed.length > 0) {
        const { data: cached } = await db
          .from('price_cache').select('*').in('ticker', failed)
        for (const row of cached ?? []) {
          quotes[row.ticker] = {
            ticker: row.ticker,
            price: Number(row.price),
            currency: row.currency,
            change: Number(row.change) || 0,
            changePercent: Number(row.change_percent) || 0,
            longName: row.long_name ?? undefined,
            stale: true,
            asOf: row.fetched_at,
          } as any
        }
      }

      // Warm the cache with fresh good quotes. Awaited (not fire-and-forget)
      // so a serverless function doesn't get frozen mid-write.
      const fresh = tickers.filter((t) => quotes[t]?.price > 0 && !failed.includes(t))
      if (fresh.length > 0) {
        const rows = fresh.map((t) => ({
          ticker: t, price: quotes[t].price, currency: quotes[t].currency,
          change: quotes[t].change, change_percent: quotes[t].changePercent,
          long_name: quotes[t].longName ?? null, fetched_at: new Date().toISOString(),
        }))
        await db.from('price_cache').upsert(rows, { onConflict: 'ticker' })
      }
    }

    return NextResponse.json({ quotes })
  } catch (err) {
    console.error('[prices] route error:', err)
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 })
  }
}

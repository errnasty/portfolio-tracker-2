import { NextRequest, NextResponse } from 'next/server'

export interface SearchResult {
  symbol: string
  shortname: string
  longname?: string
  exchange: string
  quoteType: string
  currency?: string
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 1) return NextResponse.json({ results: [] })

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&enableFuzzyQuery=false&lang=en-US`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://finance.yahoo.com',
        },
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      const quotes: SearchResult[] = (data?.quotes ?? [])
        .filter((q: any) => q.symbol && ['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX', 'CRYPTOCURRENCY'].includes(q.quoteType))
        .map((q: any) => ({
          symbol: q.symbol,
          shortname: q.shortname ?? q.symbol,
          longname: q.longname,
          exchange: q.exchDisp ?? q.exchange ?? '',
          quoteType: q.typeDisp ?? q.quoteType ?? '',
          currency: q.currency,
        }))

      return NextResponse.json({ results: quotes })
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ results: [] })
  }
}

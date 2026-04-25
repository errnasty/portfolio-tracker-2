import { NextRequest, NextResponse } from 'next/server'

// Frankfurter.app: free, no API key, ECB data (supports USD, SGD, EUR + many more)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const base = searchParams.get('base') ?? 'USD'
    const symbols = searchParams.get('symbols') ?? 'SGD,EUR,USD'

    const url = `https://api.frankfurter.app/latest?from=${base}&to=${symbols}`
    const res = await fetch(url, { next: { revalidate: 3600 } })

    if (!res.ok) throw new Error('FX API error')

    const data = await res.json()
    // Add the base currency itself with rate 1
    const rates = { ...data.rates, [base]: 1 }

    return NextResponse.json({ base, rates })
  } catch {
    // Fallback to approximate static rates if API fails
    return NextResponse.json({
      base: 'USD',
      rates: { USD: 1, SGD: 1.34, EUR: 0.92 },
    })
  }
}

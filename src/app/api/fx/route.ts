import { NextRequest, NextResponse } from 'next/server'
import { fetchFxRates } from '@/lib/server/fx'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const base = (searchParams.get('base') ?? 'USD').toUpperCase()
  const symbolsParam = (searchParams.get('symbols') ?? 'SGD,EUR,USD').toUpperCase()
  const requested = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean)

  const result = await fetchFxRates(base, requested)
  return NextResponse.json(result)
}

import { NextRequest, NextResponse } from 'next/server'

// Generate a plain-English portfolio summary using Claude.
// Expects ANTHROPIC_API_KEY in env.

const SYSTEM_PROMPT = `You are a portfolio analyst writing a short, plain-English summary for an individual investor.

Style:
- 2 short paragraphs, ~120 words total. No headers or lists.
- Concrete: cite specific numbers from the data (allocations, returns, top positions).
- Honest: surface real concerns, not generic platitudes. If something is healthy, say so.
- No financial advice (no "you should buy X"). Frame observations, not recommendations.
- Conversational but precise. Avoid jargon unless you immediately explain it.
- No mention of being an AI or model.`

interface SummaryRequest {
  baseCurrency: string
  totalValue: number
  totalCost: number
  totalGainPct: number
  dayChangePct: number
  holdingsCount: number
  topHoldings: { ticker: string; name?: string | null; pct: number; gainPct: number }[]
  geographic: { label: string; pct: number }[]
  sectors: { label: string; pct: number }[]
  currencies: { label: string; pct: number }[]
  concentration: { hhi: number; effectiveHoldings: number; largestPct: number; top5Pct: number }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set on the server' },
      { status: 503 },
    )
  }

  let body: SummaryRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const userPrompt = formatPrompt(body)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[summary] Anthropic API error:', res.status, errText)
      return NextResponse.json(
        { error: `Claude API returned ${res.status}` },
        { status: 502 },
      )
    }

    const data = await res.json()
    const text = data?.content?.[0]?.text ?? ''
    const usage = data?.usage ?? {}

    return NextResponse.json({
      summary: text,
      model: data?.model,
      cacheCreation: usage.cache_creation_input_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    })
  } catch (err) {
    console.error('[summary] route error:', err)
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }
}

function formatPrompt(b: SummaryRequest): string {
  const num = (n: number, d = 1) => n.toFixed(d)
  const cur = (n: number) => `${b.baseCurrency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  const lines: string[] = []
  lines.push(`Base currency: ${b.baseCurrency}`)
  lines.push(`Total value: ${cur(b.totalValue)}  ·  Cost basis: ${cur(b.totalCost)}  ·  Total return: ${num(b.totalGainPct, 1)}%`)
  lines.push(`Day change: ${num(b.dayChangePct, 2)}%  ·  Holdings: ${b.holdingsCount}`)
  lines.push(`Concentration: HHI ${b.concentration.hhi.toFixed(0)}, ${b.concentration.effectiveHoldings.toFixed(1)} effective holdings, largest ${num(b.concentration.largestPct, 1)}%, top-5 ${num(b.concentration.top5Pct, 1)}%`)
  lines.push('')
  lines.push('Top holdings:')
  for (const h of b.topHoldings.slice(0, 5)) {
    lines.push(`  ${h.ticker}  ${num(h.pct)}%  (return: ${num(h.gainPct, 1)}%)${h.name ? ` — ${h.name}` : ''}`)
  }
  lines.push('')
  lines.push('Geographic exposure (look-through):')
  for (const g of b.geographic.slice(0, 5)) lines.push(`  ${g.label}: ${num(g.pct)}%`)
  lines.push('')
  lines.push('Sectors (look-through):')
  for (const s of b.sectors.slice(0, 6)) lines.push(`  ${s.label}: ${num(s.pct)}%`)
  lines.push('')
  lines.push('Currency exposure (look-through):')
  for (const c of b.currencies.slice(0, 4)) lines.push(`  ${c.label}: ${num(c.pct)}%`)
  lines.push('')
  lines.push('Write a 2-paragraph plain-English summary. First paragraph: what this portfolio is. Second paragraph: one or two things worth flagging — concentration, geographic skew, currency mismatch, sector imbalance, etc. Be specific with numbers.')
  return lines.join('\n')
}

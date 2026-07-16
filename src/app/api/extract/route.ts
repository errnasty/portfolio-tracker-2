import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseDbsAlert } from '@/lib/dbs-email-parser'
import { buildExtractPrompt, validateExtractResponse, EXTRACT_TEXT_MODELS, type TxnDraft } from '@/lib/extract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/extract  Body: { text }
//   -> { draft: TxnDraft, source: 'regex' | 'ai' } | 422 { error }
// Auth: Supabase bearer token (prevents an open LLM proxy). Tries the DBS
// regex parser first (free, instant), then an OpenRouter free model.

async function callOpenRouter(prompt: string, apiKey: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    for (const model of EXTRACT_TEXT_MODELS) {
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'HTTP-Referer': 'https://aureus.app',
            'X-Title': 'Aureus Portfolio Tracker',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'You output only compact JSON. No prose, no markdown fences.' },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 200,
            temperature: 0,
          }),
          signal: controller.signal,
        })
        if (!resp.ok) continue
        const data = await resp.json()
        const text = data?.choices?.[0]?.message?.content?.trim()
        if (text) return text
      } catch { /* try next model */ }
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data: { user }, error: authErr } = await authClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  // 1. Regex-first (DBS/POSB). Feed the first line as subject, rest as body.
  const firstLine = text.split('\n')[0] ?? ''
  const regex = parseDbsAlert(firstLine, text) ?? parseDbsAlert('', text)
  if (regex) {
    const draft: TxnDraft = {
      amount: regex.amount,
      currency: regex.currency,
      date: regex.date,
      merchant: regex.merchant,
      description: regex.description,
      confidence: regex.confidence,
    }
    return NextResponse.json({ draft, source: 'regex' })
  }

  // 2. LLM fallback (free OpenRouter model), if configured.
  const apiKey = process.env.OPENROUTER_API_KEY
  if (apiKey) {
    const aiText = await callOpenRouter(buildExtractPrompt(text), apiKey)
    const draft = aiText ? validateExtractResponse(aiText) : null
    if (draft) return NextResponse.json({ draft, source: 'ai' })
  }

  return NextResponse.json(
    { error: 'Could not find a transaction in that text. Enter it manually instead.' },
    { status: 422 },
  )
}

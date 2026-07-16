import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { VISION_EXTRACT_PROMPT, EXTRACT_VISION_MODELS, validateExtractResponse, type TxnDraft } from '@/lib/extract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/extract-image  Body: { image: dataURL }
//   -> { draft: TxnDraft } | 422 { error }
// Auth: Supabase bearer token. Vision models over OpenRouter free tier; the
// image is never written to disk or a bucket — it's read into memory for
// the API call and discarded when the request completes.
const MAX_IMAGE_BYTES = 2_000_000 // ~2MB data URL (client already downscales to ~200KB-1MB)

async function callOpenRouterVision(imageDataUrl: string, apiKey: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    for (const model of EXTRACT_VISION_MODELS) {
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
              {
                role: 'user',
                content: [
                  { type: 'text', text: VISION_EXTRACT_PROMPT },
                  { type: 'image_url', image_url: { url: imageDataUrl } },
                ],
              },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 300,
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
  const image = typeof body?.image === 'string' ? body.image : ''
  if (!image.startsWith('data:image/')) {
    return NextResponse.json({ error: 'image must be a data: URL' }, { status: 400 })
  }
  if (image.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image too large — try a smaller photo.' }, { status: 400 })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Receipt scanning isn\'t configured on this deployment (missing OPENROUTER_API_KEY).' },
      { status: 422 },
    )
  }

  const aiText = await callOpenRouterVision(image, apiKey)
  const draft: TxnDraft | null = aiText ? validateExtractResponse(aiText) : null
  if (!draft) {
    return NextResponse.json(
      { error: 'Could not read an amount from that photo. Enter it manually instead.' },
      { status: 422 },
    )
  }

  return NextResponse.json({ draft })
}

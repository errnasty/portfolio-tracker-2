import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { categorizeWithAI } from '@/lib/ai-categorize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/categorize
// Body: { description, merchant?, amount, currency? }
// Returns: { category, source, confidence }
//
// Authenticates the user via their JWT, loads their category list, and
// calls the AI categorizer. Falls back to keyword-based categorization
// when OPENROUTER_API_KEY is not set or the AI call fails.

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await authClient.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  // Load the user's categories.
  const { data: cats } = await authClient
    .from('categories')
    .select('name, kind')
    .eq('user_id', user.id)

  const result = await categorizeWithAI(
    {
      description: body.description,
      merchant: body.merchant ?? null,
      amount: Number(body.amount) || 0,
      currency: body.currency ?? 'SGD',
    },
    cats ?? [],
  )

  return NextResponse.json(result)
}

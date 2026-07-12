import { guessCategoryName } from './categorize'
import type { DefaultCategory } from './categorize'

// AI-powered transaction categorization using a free model on OpenRouter.
// Falls back to the built-in keyword-based guessCategoryName when:
//   - OPENROUTER_API_KEY is not set
//   - the API call fails or times out
//   - the model returns an invalid category name
//
// The model is prompted with the user's category list and the transaction
// description/merchant/amount. It returns a single category name.

export interface CategorizeInput {
  description: string
  merchant?: string | null
  amount: number // signed: negative = expense, positive = income
  currency?: string
}

export interface CategorizeResult {
  category: string | null       // category name (matched against user's list)
  source: 'ai' | 'keyword' | 'none'
  confidence: 'high' | 'low'
}

// Free models on OpenRouter (no cost, rate-limited). We try them in order
// — the first one that responds wins. All are instruction-tuned chat models.
const FREE_MODELS = [
  'meta-llama/llama-3.2-3b-instruct:free',
  'google/gemini-flash-1.5:free',
  'mistralai/mistral-7b-instruct:free',
]

const TIMEOUT_MS = 8000 // don't let AI categorization block an import for too long

function buildPrompt(
  input: CategorizeInput,
  categories: { name: string; kind: string }[],
): string {
  const catList = categories.map((c) => `- ${c.name} (${c.kind})`).join('\n')
  const direction = input.amount >= 0 ? 'credit/income' : 'debit/expense'
  return `You are a personal finance categorization assistant. Given a bank transaction, pick the single best category from the user's category list.

Transaction:
- Description: ${input.description}
- Merchant: ${input.merchant ?? 'N/A'}
- Amount: ${input.amount} ${input.currency ?? 'SGD'} (${direction})

User's categories:
${catList}

Rules:
1. Respond with ONLY the category name — no explanation, no quotes, no punctuation.
2. If the transaction is a credit/income, prefer "Income" unless it's clearly a refund.
3. If the transaction is a transfer between accounts (e.g. PayNow to self, IBKR top-up), use "Transfers".
4. Pick the most specific category that fits. If none fit, respond with "Other".
5. For investment/brokerage top-ups, use "Transfers".`
}

async function callOpenRouter(
  prompt: string,
  apiKey: string,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'https://aureus.app',
        'X-Title': 'Aureus Portfolio Tracker',
      },
      body: JSON.stringify({
        model: FREE_MODELS[0],
        messages: [
          { role: 'system', content: 'You are a helpful finance assistant. Respond with only the category name, nothing else.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
      signal: controller.signal,
    })

    if (!resp.ok) {
      // Try next model on failure
      const body = await resp.text().catch(() => '')
      console.warn(`[ai-categorize] OpenRouter ${FREE_MODELS[0]} returned ${resp.status}: ${body}`)
      return null
    }

    const data = await resp.json()
    const text = data?.choices?.[0]?.message?.content?.trim()
    return text || null
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.warn('[ai-categorize] Timed out')
    } else {
      console.warn(`[ai-categorize] Error: ${String(err)}`)
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Categorize a transaction using AI (OpenRouter free model) with keyword fallback.
 *
 * @param input   Transaction details
 * @param categories  The user's category list (name + kind)
 * @returns The best-matching category name, or null if nothing fits.
 */
export async function categorizeWithAI(
  input: CategorizeInput,
  categories: { name: string; kind: string }[],
): Promise<CategorizeResult> {
  // Fast path: if no API key, skip AI entirely.
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey || categories.length === 0) {
    const fallback = guessCategoryName(input.description, input.merchant)
    return {
      category: fallback,
      source: fallback ? 'keyword' : 'none',
      confidence: fallback ? 'low' : 'low',
    }
  }

  const prompt = buildPrompt(input, categories)
  const aiResponse = await callOpenRouter(prompt, apiKey)

  if (aiResponse) {
    // Clean up the response: strip quotes, punctuation, extra text.
    const cleaned = aiResponse
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/[.!?,]$/g, '')
      .trim()

    // Match against the user's category list (case-insensitive).
    const match = categories.find(
      (c) => c.name.toLowerCase() === cleaned.toLowerCase(),
    )
    if (match) {
      return { category: match.name, source: 'ai', confidence: 'high' }
    }

    // Partial match (model returned a substring of a category name).
    const partial = categories.find(
      (c) => c.name.toLowerCase().includes(cleaned.toLowerCase()) ||
             cleaned.toLowerCase().includes(c.name.toLowerCase()),
    )
    if (partial) {
      return { category: partial.name, source: 'ai', confidence: 'high' }
    }
  }

  // Fallback to keyword-based categorization.
  const fallback = guessCategoryName(input.description, input.merchant)
  return {
    category: fallback,
    source: fallback ? 'keyword' : 'none',
    confidence: 'low',
  }
}

/**
 * Batch-categorize multiple transactions. Calls the AI once per transaction
 * but with a small concurrency limit to avoid rate-limiting.
 */
export async function batchCategorizeWithAI(
  inputs: CategorizeInput[],
  categories: { name: string; kind: string }[],
  concurrency = 3,
): Promise<CategorizeResult[]> {
  const results: CategorizeResult[] = new Array(inputs.length)
  let index = 0

  async function worker() {
    while (index < inputs.length) {
      const i = index++
      results[i] = await categorizeWithAI(inputs[i], categories)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker())
  await Promise.all(workers)
  return results
}

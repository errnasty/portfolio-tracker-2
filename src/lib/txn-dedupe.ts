export interface DupRow {
  id?: string
  date: string
  amount: number | string
  payee_key: string | null
  description?: string | null
}

// Normalize text for comparison: lowercase, collapse whitespace, strip
// common bank-statement noise tokens (ref numbers, trailing digits).
function normalizeDesc(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/\bref\b[:#]?\s*\d+/gi, '')
    .replace(/\b\d{6,}\b/g, '') // long digit sequences (ref numbers)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// A candidate is a fuzzy duplicate of an existing row when:
//  1. They share the same date, AND
//  2. The amount matches within rounding (±0.005), AND
//  3. EITHER:
//     a. They share the same payee_key (strongest signal — masked phone/acct), OR
//     b. The normalized descriptions match (for CSV rows without payee_key)
//        with at least 70% similarity (token overlap ratio).
//
// Used to FLAG (not drop) potential duplicates so the user can review them.
export function findFuzzyDuplicate(candidate: DupRow, existing: DupRow[]): DupRow | null {
  const candAmount = Number(candidate.amount)
  const candDesc = normalizeDesc(candidate.description)

  return existing.find((e) => {
    if (e.date !== candidate.date) return false
    if (Math.abs(Number(e.amount) - candAmount) >= 0.005) return false

    // Strong signal: matching payee_key.
    if (candidate.payee_key && e.payee_key === candidate.payee_key) return true

    // Fallback: description similarity (for CSV imports without payee_key).
    if (candDesc && e.description) {
      const eDesc = normalizeDesc(e.description)
      if (eDesc && tokenSimilarity(candDesc, eDesc) >= 0.6) return true
    }

    return false
  }) ?? null
}

// Jaccard-like token similarity: |intersection| / |union| of word tokens.
// Returns 0–1. "ntuc fairprice" vs "fairprice ntuc" → 1.0.
function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(' ').filter(Boolean))
  const tokensB = new Set(b.split(' ').filter(Boolean))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersection = 0
  for (const t of Array.from(tokensA)) {
    if (tokensB.has(t)) intersection++
  }
  const union = tokensA.size + tokensB.size - intersection
  return union > 0 ? intersection / union : 0
}

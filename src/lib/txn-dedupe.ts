export interface DupRow {
  id?: string
  date: string
  amount: number | string
  payee_key: string | null
}

// A candidate is a fuzzy duplicate of an existing row when it shares the stable
// payee_key, the same date, and (within rounding) the same amount. Requires a
// payee_key — rows we couldn't key are never auto-matched. Used to FLAG (not
// drop) alert+confirmation pairs of the same transaction.
export function findFuzzyDuplicate(candidate: DupRow, existing: DupRow[]): DupRow | null {
  if (!candidate.payee_key) return null
  return existing.find((e) =>
    e.payee_key === candidate.payee_key &&
    e.date === candidate.date &&
    Math.abs(Number(e.amount) - Number(candidate.amount)) < 0.005,
  ) ?? null
}

// Subsequence fuzzy score: null if `query` is not an in-order subsequence of
// `text`. Higher is better; consecutive and earlier (prefix) matches score more.
export function fuzzyScore(text: string, query: string): number | null {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (!q) return 0
  let ti = 0
  let score = 0
  let streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    let found = -1
    for (; ti < t.length; ti++) {
      if (t[ti] === q[qi]) { found = ti; break }
    }
    if (found === -1) return null
    streak = qi > 0 && t[found - 1] === q[qi - 1] ? streak + 1 : 1
    score += 10 + streak * 5 - found // earlier + consecutive = better
    ti = found + 1
  }
  return score
}

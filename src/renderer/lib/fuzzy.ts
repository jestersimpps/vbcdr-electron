export interface FuzzyResult {
  score: number
  matched: boolean
}

export function fuzzyMatch(query: string, target: string): FuzzyResult {
  if (!query) return { score: 0, matched: true }
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t.includes(q)) {
    const idx = t.indexOf(q)
    return { score: 1000 - idx - (target.length - query.length) * 0.1, matched: true }
  }
  let qi = 0
  let score = 0
  let lastMatch = -2
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += i - lastMatch === 1 ? 5 : 1
      lastMatch = i
      qi++
    }
  }
  return qi === q.length ? { score, matched: true } : { score: 0, matched: false }
}

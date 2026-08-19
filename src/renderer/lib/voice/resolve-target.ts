import { fuzzyMatch } from '@/lib/fuzzy'

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
}

export function parseOrdinal(target: string): number | null {
  const t = target.trim().toLowerCase()
  if (!t) return null
  const word = ORDINAL_WORDS[t]
  if (word !== undefined) return word
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10)
    return n > 0 ? n : null
  }
  const nth = t.match(/^(\d+)(st|nd|rd|th)$/)
  if (nth) {
    const n = parseInt(nth[1], 10)
    return n > 0 ? n : null
  }
  return null
}

export interface Candidate<T> {
  value: T
  label: string
  aliases?: string[]
}

const MIN_FUZZY_SCORE = 3

export function resolveByName<T>(target: string, candidates: Candidate<T>[]): T | null {
  const t = target.trim().toLowerCase()
  if (!t) return null

  for (const c of candidates) {
    if (c.label.toLowerCase() === t) return c.value
    if (c.aliases?.some((a) => a.toLowerCase() === t)) return c.value
  }

  let best: { value: T; score: number } | null = null
  for (const c of candidates) {
    const names = [c.label, ...(c.aliases ?? [])]
    for (const name of names) {
      const { score, matched } = fuzzyMatch(t, name)
      if (matched && score >= MIN_FUZZY_SCORE && (!best || score > best.score)) {
        best = { value: c.value, score }
      }
    }
  }
  return best ? best.value : null
}

export function resolveByOrdinalOrName<T>(target: string, candidates: Candidate<T>[]): T | null {
  const ordinal = parseOrdinal(target)
  if (ordinal !== null) {
    return ordinal <= candidates.length ? candidates[ordinal - 1].value : null
  }
  return resolveByName(target, candidates)
}

export function resolveFilePath(
  target: string,
  files: { path: string; name: string }[]
): string | null {
  const t = target.trim().toLowerCase()
  if (!t) return null

  const exactPath = files.find((f) => f.path.toLowerCase() === t)
  if (exactPath) return exactPath.path

  const exactName = files.find((f) => f.name.toLowerCase() === t)
  if (exactName) return exactName.path

  const spoken = t.replace(/\s+/g, '')
  const collapsed = files.find((f) => f.name.toLowerCase().replace(/[-_.]/g, '') === spoken)
  if (collapsed) return collapsed.path

  let best: { path: string; score: number } | null = null
  for (const f of files) {
    const { score, matched } = fuzzyMatch(t, f.name)
    if (matched && score >= MIN_FUZZY_SCORE && (!best || score > best.score)) {
      best = { path: f.path, score }
    }
  }
  if (best) return best.path

  for (const f of files) {
    const { score, matched } = fuzzyMatch(t, f.path)
    if (matched && score >= MIN_FUZZY_SCORE && (!best || score > best.score)) {
      best = { path: f.path, score }
    }
  }
  return best ? best.path : null
}

const TRIPLE_BLANK_RE = /(\r?\n[ \t]*){4,}/g

export function tidyChunk(chunk: string): string {
  if (!chunk) return chunk
  return chunk.replace(TRIPLE_BLANK_RE, '\r\n\r\n\r\n')
}

const ANSI_RE = /\x1b(?:\[[0-9;?]*[a-zA-Z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|\([ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz])/g

export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '')
}

const EXT = '(?:tsx|ts|jsx|js|mjs|cjs|jsonc|json|mdx|md|scss|sass|less|css|html|htm|vue|svelte|astro|python|py|rb|go|rs|java|kotlin|kt|swift|cpp|cc|hpp|cs|php|bash|zsh|fish|sh|sqlite|sql|toml|yaml|yml|xml|prisma|graphql|gql|env|lock|hpp|h|c)'
const FILE_PATH_RE = new RegExp(
  `(?:^|[\\s│─└├╶('"\`])((?:[a-zA-Z]:[\\\\/]|\\.{0,2}/)?(?:[\\w.\\-+@]+[\\\\/])*[\\w.\\-+@]+?\\.${EXT})(?=[\\s:,;)\\]'"\`]|$)(?::(\\d+))?(?::(\\d+))?`,
  'g'
)

export interface PathMatch {
  start: number
  end: number
  rawPath: string
  line: number | null
  column: number | null
}

export function findFileMatches(line: string): PathMatch[] {
  const clean = stripAnsi(line)
  const matches: PathMatch[] = []
  FILE_PATH_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = FILE_PATH_RE.exec(clean)) !== null) {
    const rawPath = m[1]
    if (!rawPath || rawPath.length < 3) continue
    const lineNum = m[2] ? parseInt(m[2], 10) : null
    const colNum = m[3] ? parseInt(m[3], 10) : null
    const start = m.index + m[0].indexOf(rawPath)
    const lengthIncludingLineCol = rawPath.length + (m[2] ? m[2].length + 1 : 0) + (m[3] ? m[3].length + 1 : 0)
    matches.push({
      start,
      end: start + lengthIncludingLineCol,
      rawPath,
      line: lineNum,
      column: colNum
    })
  }
  return matches
}

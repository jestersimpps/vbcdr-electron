import type { AgentAction } from '@/lib/voice/agent-protocol'

interface FastPathRule {
  pattern: RegExp
  action: string
  target?: (match: RegExpMatchArray) => string | undefined
}

const RULES: FastPathRule[] = [
  { pattern: /^(?:show|open|go to)\s+(?:the\s+)?dashboard$/, action: 'toggle-dashboard' },
  { pattern: /^(?:show|open|go to)\s+(?:the\s+)?settings$/, action: 'settings' },
  { pattern: /^(?:show|open|go to)\s+(?:the\s+)?usage$/, action: 'show-usage' },
  { pattern: /^(?:show|open|go to)\s+(?:the\s+)?stat(?:istic)?s$/, action: 'show-statistics' },
  { pattern: /^(?:show|open|go to)\s+(?:the\s+)?editor$/, action: 'center-tab-editor' },
  { pattern: /^(?:show|open|go to)\s+(?:the\s+)?terminals?$/, action: 'center-tab-terminals' },
  { pattern: /^(?:show|open|go to)\s+(?:the\s+)?skills$/, action: 'center-tab-skills' },
  { pattern: /^save(?:\s+(?:the\s+)?file)?$/, action: 'save-file' },
  { pattern: /^(?:reload|refresh)\s+(?:the\s+)?(?:file\s+)?tree$/, action: 'reload-tree' },
  { pattern: /^new\s+(?:shell|terminal)$/, action: 'new-shell-terminal' },
  { pattern: /^next\s+(?:terminal|tab)$/, action: 'terminal-tab-next' },
  { pattern: /^(?:previous|prev)\s+(?:terminal|tab)$/, action: 'terminal-tab-prev' },
  {
    pattern: /^(?:show|open)\s+git$/,
    action: 'show-git',
    target: () => 'on'
  },
  {
    pattern: /^hide\s+git$/,
    action: 'show-git',
    target: () => 'off'
  },
  { pattern: /^commit(?:\s+(?:this|it))?$/, action: 'git-commit' },
  {
    pattern: /^(?:switch|go)\s+to\s+(?:the\s+)?(.+?)\s+project$/,
    action: 'switch-project',
    target: (m) => m[1]
  },
  {
    pattern: /^(?:focus|switch to)\s+(?:the\s+)?(.+?)\s+terminal$/,
    action: 'focus-terminal',
    target: (m) => m[1]
  },
  {
    pattern: /^(?:set\s+(?:the\s+)?)?theme\s+(?:to\s+)?(.+)$/,
    action: 'set-theme',
    target: (m) => m[1]
  },
  {
    pattern: /^make\s+it\s+(.+)$/,
    action: 'set-theme',
    target: (m) => m[1]
  }
]

export function normalizeUtterance(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?,]+$/g, '')
    .replace(/\s+/g, ' ')
}

export function matchFastPath(text: string): AgentAction | null {
  const normalized = normalizeUtterance(text)
  if (!normalized) return null

  for (const rule of RULES) {
    const match = normalized.match(rule.pattern)
    if (!match) continue
    const target = rule.target?.(match)
    return target ? { action: rule.action, target } : { action: rule.action }
  }
  return null
}

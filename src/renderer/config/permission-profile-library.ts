import type { PermissionMode } from '@/lib/claude-permissions'

export interface PermissionProfile {
  templateId: string
  name: string
  description: string
  color: string
  mode: PermissionMode
  allow: string[]
  ask: string[]
  deny: string[]
}

const ENV_AND_SECRETS_DENY = ['Read(./.env)', 'Read(./.env.*)', 'Read(./secrets/**)']

export const PROFILE_LIBRARY: readonly PermissionProfile[] = [
  {
    templateId: 'strict',
    name: 'Strict',
    description: 'Read-only baseline. Confirms shell, blocks creds.',
    color: '#ef4444',
    mode: 'default',
    allow: ['Read'],
    ask: ['Bash(git push *)', 'Bash(rm *)', 'Bash(sudo *)'],
    deny: [...ENV_AND_SECRETS_DENY, 'Bash(curl *)']
  },
  {
    templateId: 'default',
    name: 'Default',
    description: 'Sensible everyday — git, npm, edits free; push asks.',
    color: '#3b82f6',
    mode: 'default',
    allow: ['Read', 'Edit', 'Write', 'Bash(npm:*)', 'Bash(git:*)', 'WebFetch(domain:*)', 'mcp__*'],
    ask: ['Bash(git push *)', 'Bash(rm *)', 'Bash(sudo *)'],
    deny: [...ENV_AND_SECRETS_DENY, 'Bash(curl *)']
  },
  {
    templateId: 'permissive',
    name: 'Permissive',
    description: 'Auto-accept edits. Broad shell allow with safety rails.',
    color: '#f59e0b',
    mode: 'acceptEdits',
    allow: ['Read', 'Edit', 'Write', 'Bash(*)', 'WebFetch(domain:*)', 'mcp__*', 'Agent(*)'],
    ask: ['Bash(git push *)', 'Bash(sudo *)'],
    deny: [...ENV_AND_SECRETS_DENY, 'Bash(curl *)', 'Bash(rm -rf *)']
  },
  {
    templateId: 'yolo',
    name: 'Yolo',
    description: 'Bypass all prompts. Use in sandboxes/containers only.',
    color: '#10b981',
    mode: 'bypassPermissions',
    allow: [],
    ask: [],
    deny: []
  },
  {
    templateId: 'frontend',
    name: 'Frontend',
    description: 'Web work — npm/pnpm/yarn, dev servers, browser MCP.',
    color: '#06b6d4',
    mode: 'acceptEdits',
    allow: [
      'Read',
      'Edit',
      'Write',
      'Bash(npm:*)',
      'Bash(pnpm:*)',
      'Bash(yarn:*)',
      'Bash(npx:*)',
      'Bash(git:*)',
      'WebFetch(domain:*)',
      'mcp__*'
    ],
    ask: ['Bash(git push *)', 'Bash(rm *)'],
    deny: [...ENV_AND_SECRETS_DENY, 'Bash(curl *)']
  },
  {
    templateId: 'backend',
    name: 'Backend',
    description: 'Server work — runtime tooling, db CLIs, no prod-write.',
    color: '#8b5cf6',
    mode: 'default',
    allow: [
      'Read',
      'Edit',
      'Write',
      'Bash(npm:*)',
      'Bash(node:*)',
      'Bash(python:*)',
      'Bash(uv:*)',
      'Bash(go:*)',
      'Bash(cargo:*)',
      'Bash(git:*)',
      'Bash(docker compose *)',
      'Bash(psql *)',
      'mcp__*'
    ],
    ask: ['Bash(git push *)', 'Bash(rm *)', 'Bash(docker *)', 'Bash(sudo *)'],
    deny: [...ENV_AND_SECRETS_DENY, 'Bash(curl *)']
  },
  {
    templateId: 'docs',
    name: 'Docs only',
    description: 'Edit markdown, no shell, no app code writes.',
    color: '#eab308',
    mode: 'default',
    allow: ['Read', 'Edit(**/*.md)', 'Edit(**/*.mdx)', 'Write(**/*.md)', 'Write(**/*.mdx)', 'WebFetch(domain:*)'],
    ask: [],
    deny: ['Bash', ...ENV_AND_SECRETS_DENY]
  },
  {
    templateId: 'review',
    name: 'Review',
    description: 'Read-only review. No edits, no shell.',
    color: '#a3a3a3',
    mode: 'plan',
    allow: ['Read', 'WebFetch(domain:*)'],
    ask: [],
    deny: ['Bash', 'Edit', 'Write', ...ENV_AND_SECRETS_DENY]
  },
  {
    templateId: 'ci',
    name: 'CI / sandbox',
    description: 'Automated runs. Allow broadly; container-only.',
    color: '#ec4899',
    mode: 'acceptEdits',
    allow: ['Read', 'Edit', 'Write', 'Bash', 'WebFetch(domain:*)', 'mcp__*', 'Agent(*)'],
    ask: [],
    deny: [...ENV_AND_SECRETS_DENY]
  }
] as const

export function getProfile(templateId: string): PermissionProfile | undefined {
  return PROFILE_LIBRARY.find((p) => p.templateId === templateId)
}

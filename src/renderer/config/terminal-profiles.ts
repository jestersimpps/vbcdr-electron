import { LLM_PROVIDERS, type LlmProviderId } from '@/config/llm-provider-registry'

/**
 * A terminal profile is a named, colored "+" button in the terminal tab bar.
 * Two are built in (Claude Code, Codex) and users can add their own profiles
 * with a label, color and start command. The color follows the tab it opens.
 */
export type BuiltinProfileId = 'claude' | 'codex'
export type CustomProfileId = `custom-${string}`
export type TerminalProfileId = BuiltinProfileId | CustomProfileId

export interface CustomTerminalProfile {
  id: CustomProfileId
  label: string
  color: string
  command: string
}

export interface TerminalProfile {
  id: TerminalProfileId
  label: string
  color: string
  /** Raw start command as configured; empty for an unconfigured custom slot. */
  command: string
  providerId: LlmProviderId
  builtin: boolean
}

/** Colors carried on a tab so the tab strip and pane border can be painted. */
export interface TabProfileMeta {
  profileId: TerminalProfileId
  providerId: LlmProviderId
  label: string
  color: string
}

export const BUILTIN_PROFILE_IDS: BuiltinProfileId[] = ['claude', 'codex']

export const DEFAULT_BUILTIN_PROFILE_COLORS: Record<BuiltinProfileId, string> = {
  claude: '#d97757',
  codex: '#10a37f'
}

export const DEFAULT_CUSTOM_PROFILE_COLORS = {
  'custom-1': '#60a5fa',
  'custom-2': '#c084fc',
  'custom-3': '#f472b6'
} as const

const CUSTOM_PROFILE_COLOR_SEQUENCE = ['#60a5fa', '#c084fc', '#f472b6', '#facc15', '#22d3ee', '#a3e635']

/** Quick-pick swatches shown in settings next to the free color picker. */
export const PROFILE_COLOR_PRESETS: string[] = [
  '#d97757',
  '#10a37f',
  '#60a5fa',
  '#c084fc',
  '#f472b6',
  '#facc15',
  '#fb923c',
  '#34d399',
  '#22d3ee',
  '#a3e635',
  '#f87171',
  '#a1a1aa'
]

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

export function isBuiltinProfileId(value: unknown): value is BuiltinProfileId {
  return value === 'claude' || value === 'codex'
}

export function isCustomProfileId(value: unknown): value is CustomProfileId {
  return typeof value === 'string' && /^custom-[a-z0-9-]{1,80}$/i.test(value)
}

export function isTerminalProfileId(value: unknown): value is TerminalProfileId {
  return isBuiltinProfileId(value) || isCustomProfileId(value)
}

export function defaultCustomProfiles(): CustomTerminalProfile[] {
  return []
}

export function createCustomProfile(
  existing: CustomTerminalProfile[],
  id: CustomProfileId
): CustomTerminalProfile {
  const index = existing.length
  return {
    id,
    label: `Custom ${index + 1}`,
    color: CUSTOM_PROFILE_COLOR_SEQUENCE[index % CUSTOM_PROFILE_COLOR_SEQUENCE.length],
    command: ''
  }
}

/**
 * Which provider a custom start command behaves like. Unlike
 * `providerIdForCommand`, flags are allowed: `claude --resume` is still Claude,
 * so the tab keeps Claude-only features (sessions, usage, /clear).
 */
export function inferProviderId(command: string): LlmProviderId {
  const first = command.trim().split(/\s+/)[0] ?? ''
  const binary = first.split('/').pop() ?? ''
  if (binary === LLM_PROVIDERS.claude.command) return 'claude'
  if (binary === LLM_PROVIDERS.codex.command) return 'codex'
  return 'custom'
}

export function sanitizeBuiltinProfileColors(value: unknown): Record<BuiltinProfileId, string> {
  const incoming = (value ?? {}) as Record<string, unknown>
  return {
    claude: isValidHexColor(incoming.claude) ? incoming.claude : DEFAULT_BUILTIN_PROFILE_COLORS.claude,
    codex: isValidHexColor(incoming.codex) ? incoming.codex : DEFAULT_BUILTIN_PROFILE_COLORS.codex
  }
}

export function sanitizeHiddenBuiltinProfileIds(value: unknown): BuiltinProfileId[] {
  if (!Array.isArray(value)) return []
  return BUILTIN_PROFILE_IDS.filter((id) => value.includes(id))
}

/** Keeps valid user-created profiles in their stored order and drops malformed entries. */
export function sanitizeCustomProfiles(value: unknown): CustomTerminalProfile[] {
  if (!Array.isArray(value)) return defaultCustomProfiles()
  const seen = new Set<string>()
  return value.flatMap((entry, index): CustomTerminalProfile[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const found = entry as Partial<CustomTerminalProfile>
    if (!isCustomProfileId(found.id) || seen.has(found.id)) return []
    seen.add(found.id)
    return [{
      id: found.id,
      label: typeof found.label === 'string' && found.label.trim() ? found.label.trim() : `Custom ${index + 1}`,
      color: isValidHexColor(found.color)
        ? found.color
        : CUSTOM_PROFILE_COLOR_SEQUENCE[index % CUSTOM_PROFILE_COLOR_SEQUENCE.length],
      command: typeof found.command === 'string' ? found.command.trim() : ''
    }]
  })
}

export function buildTerminalProfiles(
  builtinColors: Record<BuiltinProfileId, string>,
  customProfiles: CustomTerminalProfile[],
  hiddenBuiltinProfileIds: BuiltinProfileId[] = []
): TerminalProfile[] {
  const hidden = new Set(hiddenBuiltinProfileIds)
  const builtins: TerminalProfile[] = BUILTIN_PROFILE_IDS.filter((id) => !hidden.has(id)).map((id) => ({
    id,
    label: LLM_PROVIDERS[id].label,
    color: builtinColors[id],
    command: LLM_PROVIDERS[id].command,
    providerId: id,
    builtin: true
  }))
  const customs: TerminalProfile[] = sanitizeCustomProfiles(customProfiles).map((p) => ({
    id: p.id,
    label: p.label,
    color: p.color,
    command: p.command,
    providerId: inferProviderId(p.command),
    builtin: false
  }))
  return [...builtins, ...customs]
}

export function toTabProfileMeta(profile: TerminalProfile): TabProfileMeta {
  return {
    profileId: profile.id,
    providerId: profile.providerId,
    label: profile.label,
    color: profile.color
  }
}

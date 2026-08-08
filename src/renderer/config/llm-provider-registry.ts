export type LlmProviderId = 'claude' | 'codex' | 'custom'

export interface LlmProviderCapabilities {
  sessions: boolean
  usage: boolean
  mcp: boolean
  skills: boolean
  permissions: boolean
  configFiles: boolean
  explainDiff: boolean
  clearContext: boolean
}

export interface LlmProviderDefinition {
  id: LlmProviderId
  label: string
  command: string
  selectable: boolean
  capabilities: LlmProviderCapabilities
}

const NO_CAPABILITIES: LlmProviderCapabilities = {
  sessions: false,
  usage: false,
  mcp: false,
  skills: false,
  permissions: false,
  configFiles: false,
  explainDiff: false,
  clearContext: false
}

export const LLM_PROVIDERS: Record<LlmProviderId, LlmProviderDefinition> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    selectable: true,
    capabilities: {
      sessions: true,
      usage: true,
      mcp: true,
      skills: true,
      permissions: true,
      configFiles: true,
      explainDiff: true,
      clearContext: true
    }
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    selectable: true,
    capabilities: { ...NO_CAPABILITIES }
  },
  custom: {
    id: 'custom',
    label: 'Other',
    command: '',
    selectable: true,
    capabilities: { ...NO_CAPABILITIES }
  }
}

export const DEFAULT_LLM_PROVIDER_ID: LlmProviderId = 'claude'

export const SELECTABLE_LLM_PROVIDERS: LlmProviderDefinition[] = Object.values(LLM_PROVIDERS).filter(
  (p) => p.selectable
)

export function isLlmProviderId(value: unknown): value is LlmProviderId {
  return value === 'claude' || value === 'codex' || value === 'custom'
}

export function providerDefinition(id: LlmProviderId): LlmProviderDefinition {
  return LLM_PROVIDERS[id] ?? LLM_PROVIDERS[DEFAULT_LLM_PROVIDER_ID]
}

export function resolveStartupCommand(id: LlmProviderId, customCommand: string): string {
  if (id === 'custom') return customCommand.trim()
  return providerDefinition(id).command
}

export function providerIdForCommand(command: string): LlmProviderId {
  const trimmed = command.trim()
  if (!trimmed) return DEFAULT_LLM_PROVIDER_ID
  if (trimmed === LLM_PROVIDERS.claude.command) return 'claude'
  if (trimmed === LLM_PROVIDERS.codex.command) return 'codex'
  return 'custom'
}

export function capabilitiesFor(id: LlmProviderId): LlmProviderCapabilities {
  return providerDefinition(id).capabilities
}

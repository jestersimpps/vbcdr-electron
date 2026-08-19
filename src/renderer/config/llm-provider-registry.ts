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
  clearContextCommand: string | null
  selectable: boolean
  capabilities: LlmProviderCapabilities
  voiceAgent: boolean
  readyPattern?: RegExp
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
    clearContextCommand: '/clear',
    selectable: true,
    voiceAgent: true,
    readyPattern: /(Welcome to Claude Code|╭|>\s*$)/,
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
    clearContextCommand: null,
    selectable: true,
    // Verified 2026-08-09 against codex 0.147.0: it prints "Welcome to Codex" on
    // start. voiceAgent stays false until an AUTHENTICATED session proves it will
    // hold the one-line-JSON contract — the CLI installs and runs, but `codex login
    // status` reports "Not logged in" here, so the contract is still unproven.
    voiceAgent: false,
    readyPattern: /Welcome to Codex/,
    // usage reads Codex's own rollout JSONL (~/.codex/sessions/**), which carries
    // token_count events with a cumulative total plus the model's context window.
    capabilities: { ...NO_CAPABILITIES, usage: true }
  },
  custom: {
    id: 'custom',
    label: 'Other',
    command: '',
    clearContextCommand: null,
    selectable: true,
    voiceAgent: true,
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

export const VOICE_AGENT_PROVIDERS: LlmProviderDefinition[] = SELECTABLE_LLM_PROVIDERS.filter(
  (p) => p.voiceAgent
)

export function supportsVoiceAgent(id: LlmProviderId): boolean {
  return providerDefinition(id).voiceAgent
}

export function clearContextCommandFor(id: LlmProviderId): string | null {
  const provider = providerDefinition(id)
  return provider.capabilities.clearContext ? provider.clearContextCommand : null
}

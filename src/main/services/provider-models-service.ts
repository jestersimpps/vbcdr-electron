export type ModelProviderId = 'anthropic' | 'openai'

export interface ProviderModel {
  id: string
  label: string
  provider: ModelProviderId
}

export type ProviderModelsSource = 'api' | 'catalogue' | 'none'

export interface ProviderModelsResult {
  provider: ModelProviderId
  models: ProviderModel[]
  error: string | null
  source: ProviderModelsSource
}

interface AnthropicModel {
  id: string
  display_name?: string
}

interface OpenAiModel {
  id: string
}

const CACHE_TTL_MS = 10 * 60 * 1000

interface CacheEntry {
  at: number
  result: ProviderModelsResult
}

const cache = new Map<ModelProviderId, CacheEntry>()

const ENV_KEY: Record<ModelProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY'
}

/**
 * OpenAI's /v1/models returns every model on the account — embeddings, TTS,
 * moderation, image, realtime. Only chat-capable families belong in an agent
 * picker, and there is no capability flag on the payload to filter by. The
 * public catalogue needs no such filter: it lists chat models only.
 */
const OPENAI_CHAT_PREFIXES = ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-']
const OPENAI_EXCLUDE = /embedding|whisper|tts|audio|image|dall-e|moderation|realtime|transcribe|search|instruct/i

function openAiIsChatModel(id: string): boolean {
  if (OPENAI_EXCLUDE.test(id)) return false
  return OPENAI_CHAT_PREFIXES.some((prefix) => id.startsWith(prefix))
}

function empty(provider: ModelProviderId, error: string | null): ProviderModelsResult {
  return { provider, models: [], error, source: 'none' }
}

const CATALOGUE_URL = 'https://models.dev/api.json'

interface CatalogueModel {
  id?: string
  name?: string
}

interface CatalogueProvider {
  id?: string
  name?: string
  models?: Record<string, CatalogueModel>
}

/**
 * models.dev keys providers by slug, but each entry also carries its own `id`,
 * so the provider is located by scanning values rather than trusting the key to
 * be spelled exactly 'anthropic' / 'openai'.
 */
function findCatalogueProvider(
  catalogue: Record<string, CatalogueProvider>,
  provider: ModelProviderId
): CatalogueProvider | undefined {
  const entries = Object.entries(catalogue)
  const byId = entries.find(([, v]) => v?.id?.toLowerCase() === provider)
  if (byId) return byId[1]
  const byKey = entries.find(([k]) => k.toLowerCase() === provider)
  if (byKey) return byKey[1]
  return entries.find(([, v]) => v?.name?.toLowerCase().replace(/\s+/g, '') === provider)?.[1]
}

async function fetchFromCatalogue(provider: ModelProviderId): Promise<ProviderModelsResult> {
  const r = await fetch(CATALOGUE_URL)
  if (!r.ok) return empty(provider, `Model catalogue returned ${r.status}`)
  const catalogue = (await r.json()) as Record<string, CatalogueProvider>
  const entry = findCatalogueProvider(catalogue, provider)
  if (!entry) return empty(provider, `${provider} is not in the public catalogue`)

  const models = Object.entries(entry.models ?? {})
    .map(([key, m]) => ({
      id: m.id ?? key,
      label: m.name?.trim() || m.id || key,
      provider
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return { provider, models, error: null, source: 'catalogue' }
}

async function fetchAnthropic(key: string): Promise<ProviderModelsResult> {
  const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
  })
  if (!r.ok) return empty('anthropic', `Anthropic returned ${r.status}`)
  const body = (await r.json()) as { data?: AnthropicModel[] }
  const models = (body.data ?? []).map((m) => ({
    id: m.id,
    label: m.display_name?.trim() || m.id,
    provider: 'anthropic' as const
  }))
  return { provider: 'anthropic', models, error: null, source: 'api' }
}

async function fetchOpenAi(key: string): Promise<ProviderModelsResult> {
  const r = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!r.ok) return empty('openai', `OpenAI returned ${r.status}`)
  const body = (await r.json()) as { data?: OpenAiModel[] }
  const models = (body.data ?? [])
    .filter((m) => openAiIsChatModel(m.id))
    .map((m) => ({ id: m.id, label: m.id, provider: 'openai' as const }))
    .sort((a, b) => a.id.localeCompare(b.id))
  return { provider: 'openai', models, error: null, source: 'api' }
}

export async function fetchProviderModels(
  provider: ModelProviderId,
  force = false
): Promise<ProviderModelsResult> {
  const cached = cache.get(provider)
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result

  const key = process.env[ENV_KEY[provider]]?.trim()

  let result: ProviderModelsResult
  try {
    if (key) {
      result = provider === 'anthropic' ? await fetchAnthropic(key) : await fetchOpenAi(key)
      // A key that fails is worth reporting rather than masking with the public
      // list — it means the account is misconfigured, not that models are unknown.
      if (result.error) return result
    } else {
      result = await fetchFromCatalogue(provider)
    }
  } catch (err) {
    return empty(provider, err instanceof Error ? err.message : 'Request failed')
  }

  // A failed lookup is returned but never cached, so a fixed key or a restored
  // network takes effect on the next call instead of after the TTL.
  if (!result.error) cache.set(provider, { at: Date.now(), result })
  return result
}

export async function fetchAllProviderModels(force = false): Promise<ProviderModelsResult[]> {
  return Promise.all([fetchProviderModels('anthropic', force), fetchProviderModels('openai', force)])
}

export function clearProviderModelsCache(): void {
  cache.clear()
}

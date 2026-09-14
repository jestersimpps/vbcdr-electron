import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearProviderModelsCache,
  fetchAllProviderModels,
  fetchProviderModels
} from './provider-models-service'

const originalFetch = global.fetch

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response
}

beforeEach(() => {
  clearProviderModelsCache()
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
})

afterEach(() => {
  global.fetch = originalFetch
})

const CATALOGUE = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    models: {
      'claude-sonnet-5': { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
      'claude-opus-5': { id: 'claude-opus-5', name: 'Claude Opus 5' }
    }
  },
  openai: { id: 'openai', name: 'OpenAI', models: { 'gpt-5': { id: 'gpt-5', name: 'GPT-5' } } },
  tokengo: { id: 'tokengo', name: 'TokenGo', models: {} }
}

describe('fetchProviderModels without a key', () => {
  it('falls back to the public catalogue, sorted by label', async () => {
    global.fetch = vi.fn(async () => jsonResponse(CATALOGUE)) as unknown as typeof fetch

    const result = await fetchProviderModels('anthropic')

    expect(result.error).toBeNull()
    expect(result.source).toBe('catalogue')
    expect(result.models.map((m) => m.label)).toEqual(['Claude Opus 5', 'Claude Sonnet 5'])
  })

  it('locates the provider by its id field, not the object key', async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        'anthropic-pbc': { id: 'anthropic', name: 'Anthropic', models: { a: { id: 'a', name: 'A' } } }
      })
    ) as unknown as typeof fetch

    const result = await fetchProviderModels('anthropic')

    expect(result.models).toHaveLength(1)
    expect(result.source).toBe('catalogue')
  })

  it('reports a provider the catalogue does not carry', async () => {
    global.fetch = vi.fn(async () => jsonResponse({ tokengo: CATALOGUE.tokengo })) as unknown as typeof fetch

    const result = await fetchProviderModels('openai')

    expect(result.error).toBe('openai is not in the public catalogue')
    expect(result.models).toEqual([])
  })

  it('falls back to the model key when an entry omits its id', async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({ openai: { id: 'openai', models: { 'gpt-5': { name: 'GPT-5' } } } })
    ) as unknown as typeof fetch

    const result = await fetchProviderModels('openai')

    expect(result.models[0]).toEqual({ id: 'gpt-5', label: 'GPT-5', provider: 'openai' })
  })
})

describe('fetchProviderModels', () => {
  it('prefers the authenticated endpoint when a key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ id: 'claude-opus-5' }] }))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchProviderModels('anthropic')

    expect(result.source).toBe('api')
    expect(fetchMock.mock.calls[0][0]).toContain('api.anthropic.com')
  })

  it('reports a bad key rather than masking it with the public catalogue', async () => {
    process.env.ANTHROPIC_API_KEY = 'bad'
    const fetchMock = vi.fn(async () => jsonResponse({}, false, 401))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchProviderModels('anthropic')

    expect(result.error).toBe('Anthropic returned 401')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps anthropic display names and sends the version header', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: 'claude-opus-5', display_name: 'Claude Opus 5' },
          { id: 'claude-sonnet-5' }
        ]
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchProviderModels('anthropic')

    expect(result.error).toBeNull()
    expect(result.models).toEqual([
      { id: 'claude-opus-5', label: 'Claude Opus 5', provider: 'anthropic' },
      { id: 'claude-sonnet-5', label: 'claude-sonnet-5', provider: 'anthropic' }
    ])
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['x-api-key']).toBe('sk-test')
  })

  it('drops non-chat models from the openai catalogue', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    global.fetch = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: 'gpt-5' },
          { id: 'text-embedding-3-large' },
          { id: 'whisper-1' },
          { id: 'dall-e-3' },
          { id: 'gpt-4o-audio-preview' },
          { id: 'o3-mini' }
        ]
      })
    ) as unknown as typeof fetch

    const result = await fetchProviderModels('openai')

    expect(result.models.map((m) => m.id)).toEqual(['gpt-5', 'o3-mini'])
  })

  it('surfaces a bad key as an error rather than throwing', async () => {
    process.env.ANTHROPIC_API_KEY = 'bad'
    global.fetch = vi.fn(async () => jsonResponse({}, false, 401)) as unknown as typeof fetch

    const result = await fetchProviderModels('anthropic')

    expect(result.error).toBe('Anthropic returned 401')
    expect(result.models).toEqual([])
  })

  it('surfaces a network failure as an error rather than throwing', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    global.fetch = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }) as unknown as typeof fetch

    const result = await fetchProviderModels('openai')

    expect(result.error).toBe('getaddrinfo ENOTFOUND')
  })

  it('serves a repeat call from cache', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ id: 'claude-opus-5' }] }))
    global.fetch = fetchMock as unknown as typeof fetch

    await fetchProviderModels('anthropic')
    await fetchProviderModels('anthropic')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refetches when forced', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ id: 'claude-opus-5' }] }))
    global.fetch = fetchMock as unknown as typeof fetch

    await fetchProviderModels('anthropic')
    await fetchProviderModels('anthropic', true)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failure, so a fixed key takes effect immediately', async () => {
    process.env.ANTHROPIC_API_KEY = 'bad'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 401))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'claude-opus-5' }] }))
    global.fetch = fetchMock as unknown as typeof fetch

    const failed = await fetchProviderModels('anthropic')
    const recovered = await fetchProviderModels('anthropic')

    expect(failed.error).toBe('Anthropic returned 401')
    expect(recovered.error).toBeNull()
    expect(recovered.models).toHaveLength(1)
  })
})

describe('fetchAllProviderModels', () => {
  it('returns both providers, with one failing independently of the other', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    global.fetch = vi.fn(async (url: string) =>
      String(url).includes('anthropic')
        ? jsonResponse({ data: [{ id: 'claude-opus-5' }] })
        : jsonResponse({}, false, 500)
    ) as unknown as typeof fetch

    const [anthropic, openai] = await fetchAllProviderModels()

    expect(anthropic.models).toHaveLength(1)
    expect(anthropic.error).toBeNull()
    expect(anthropic.source).toBe('api')
    expect(openai.models).toEqual([])
    expect(openai.error).toBe('Model catalogue returned 500')
  })
})

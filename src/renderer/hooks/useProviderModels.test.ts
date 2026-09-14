import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProviderModels } from './useProviderModels'

const list = (): ReturnType<typeof vi.mocked<typeof window.api.providerModels.list>> =>
  vi.mocked(window.api.providerModels.list)

beforeEach(() => {
  list()
    .mockReset()
    .mockResolvedValue([
      { provider: 'anthropic', models: [], error: null, source: 'catalogue' },
      { provider: 'openai', models: [], error: null, source: 'catalogue' }
    ])
})

describe('useProviderModels', () => {
  it('loads both providers on mount and keys them by provider', async () => {
    list().mockResolvedValue([
      {
        provider: 'anthropic',
        models: [{ id: 'claude-opus-5', label: 'Claude Opus 5', provider: 'anthropic' }],
        error: null,
        source: 'catalogue'
      },
      {
        provider: 'openai',
        models: [{ id: 'gpt-5', label: 'gpt-5', provider: 'openai' }],
        error: null,
        source: 'catalogue'
      }
    ])

    const { result } = renderHook(() => useProviderModels())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.byProvider.anthropic?.models).toHaveLength(1)
    expect(result.current.byProvider.openai?.models[0].id).toBe('gpt-5')
    expect(list()).toHaveBeenCalledWith(false)
  })

  it('keeps a provider error visible instead of dropping the provider', async () => {
    list().mockResolvedValue([
      { provider: 'anthropic', models: [], error: 'Anthropic returned 401', source: 'none' },
      { provider: 'openai', models: [], error: null, source: 'catalogue' }
    ])

    const { result } = renderHook(() => useProviderModels())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.byProvider.anthropic?.error).toBe('Anthropic returned 401')
    expect(result.current.byProvider.openai?.error).toBeNull()
  })

  it('surfaces a rejected ipc call as an error on both providers', async () => {
    list().mockRejectedValue(new Error('ipc exploded'))

    const { result } = renderHook(() => useProviderModels())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.byProvider.anthropic?.error).toBe('ipc exploded')
    expect(result.current.byProvider.openai?.error).toBe('ipc exploded')
  })

  it('passes force through on reload', async () => {
    const { result } = renderHook(() => useProviderModels())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    result.current.reload(true)

    await waitFor(() => expect(list()).toHaveBeenCalledWith(true))
  })
})

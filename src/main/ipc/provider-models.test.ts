import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke, makeIpcMainMock, makeIpcRegistry, type IpcRegistry } from './ipc-test-utils'

const fetchAllProviderModels = vi.fn()
const fetchProviderModels = vi.fn()

vi.mock('@main/services/provider-models-service', () => ({
  fetchAllProviderModels: (...args: unknown[]) => fetchAllProviderModels(...args),
  fetchProviderModels: (...args: unknown[]) => fetchProviderModels(...args)
}))

let registry: IpcRegistry

beforeEach(async () => {
  vi.resetModules()
  registry = makeIpcRegistry()
  vi.doMock('electron', () => ({ ipcMain: makeIpcMainMock(registry) }))
  fetchAllProviderModels.mockReset().mockResolvedValue([])
  fetchProviderModels.mockReset().mockResolvedValue({ provider: 'anthropic', models: [], error: null })
  const { registerProviderModelsHandlers } = await import('./provider-models')
  registerProviderModelsHandlers()
})

describe('provider-models ipc', () => {
  it('lists both providers, uncached by default', async () => {
    await invoke(registry, 'provider-models:list')
    expect(fetchAllProviderModels).toHaveBeenCalledWith(false)
  })

  it('passes the force flag through', async () => {
    await invoke(registry, 'provider-models:list', true)
    expect(fetchAllProviderModels).toHaveBeenCalledWith(true)
  })

  it('fetches a single provider', async () => {
    await invoke(registry, 'provider-models:for', 'openai')
    expect(fetchProviderModels).toHaveBeenCalledWith('openai', false)
  })

  it('returns whatever the service reports, errors included', async () => {
    fetchAllProviderModels.mockResolvedValue([
      { provider: 'anthropic', models: [], error: 'ANTHROPIC_API_KEY is not set' }
    ])
    const result = await invoke<Array<{ error: string | null }>>(registry, 'provider-models:list')
    expect(result[0].error).toBe('ANTHROPIC_API_KEY is not set')
  })
})

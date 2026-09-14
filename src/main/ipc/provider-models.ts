import { safeHandle } from './safe-handle'
import {
  fetchAllProviderModels,
  fetchProviderModels,
  type ModelProviderId,
  type ProviderModelsResult
} from '@main/services/provider-models-service'

export function registerProviderModelsHandlers(): void {
  safeHandle(
    'provider-models:list',
    (_event, force?: boolean): Promise<ProviderModelsResult[]> => fetchAllProviderModels(!!force)
  )

  safeHandle(
    'provider-models:for',
    (_event, provider: ModelProviderId, force?: boolean): Promise<ProviderModelsResult> =>
      fetchProviderModels(provider, !!force)
  )
}

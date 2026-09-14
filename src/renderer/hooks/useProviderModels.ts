import { useCallback, useEffect, useState } from 'react'
import type { ModelProviderId } from '@/models/sdlc'

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

export interface UseProviderModels {
  byProvider: Record<ModelProviderId, ProviderModelsResult | undefined>
  isLoading: boolean
  reload: (force?: boolean) => void
}

const EMPTY: Record<ModelProviderId, ProviderModelsResult | undefined> = {
  anthropic: undefined,
  openai: undefined
}

export function useProviderModels(): UseProviderModels {
  const [byProvider, setByProvider] = useState(EMPTY)
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback((force = false): void => {
    setIsLoading(true)
    void window.api.providerModels
      .list(force)
      .then((results: ProviderModelsResult[]) => {
        setByProvider(
          results.reduce(
            (acc, r) => ({ ...acc, [r.provider]: r }),
            {} as Record<ModelProviderId, ProviderModelsResult | undefined>
          )
        )
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load models'
        setByProvider({
          anthropic: { provider: 'anthropic', models: [], error: message },
          openai: { provider: 'openai', models: [], error: message }
        })
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => reload(), [reload])

  return { byProvider, isLoading, reload }
}

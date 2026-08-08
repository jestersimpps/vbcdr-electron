import { useLayoutStore } from '@/stores/layout-store'
import { capabilitiesFor, type LlmProviderCapabilities } from '@/config/llm-provider-registry'

export function useLlmCapabilities(): LlmProviderCapabilities {
  const llmProviderId = useLayoutStore((s) => s.llmProviderId)
  return capabilitiesFor(llmProviderId)
}

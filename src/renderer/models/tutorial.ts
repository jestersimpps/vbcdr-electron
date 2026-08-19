import type { LlmProviderCapabilities } from '@/config/llm-provider-registry'
import type { FeatureFlag } from '@/config/feature-flags'

export type TutorialPlacement = 'auto' | 'corner'

export interface TutorialStep {
  id: string
  title: string
  body: string
  tip?: string
  target?: string
  placement?: TutorialPlacement
  requiresProject?: boolean
  onlyWithoutProject?: boolean
  action?: () => void
  cleanup?: () => void
  capability?: keyof LlmProviderCapabilities
  flag?: FeatureFlag
}

export interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

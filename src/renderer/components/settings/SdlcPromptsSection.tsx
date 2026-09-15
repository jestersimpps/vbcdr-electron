import { useLayoutStore } from '@/stores/layout-store'
import {
  DEFAULT_SDLC_STAGE_PROMPTS,
  SDLC_HANDOFF_STAGES,
  type SdlcHandoffStage,
  type SdlcPromptResolution
} from '@/models/sdlc-prompts'
import { SdlcPromptEditor } from '@/components/sdlc/SdlcPromptEditor'
import { SectionCard } from '@/components/settings/SettingsControls'

export function SdlcPromptsSection(): React.ReactElement {
  const prompts = useLayoutStore((s) => s.sdlcStagePrompts)
  const setPrompt = useLayoutStore((s) => s.setSdlcStagePrompt)
  const resetPrompt = useLayoutStore((s) => s.resetSdlcStagePrompt)

  const values = Object.fromEntries(
    SDLC_HANDOFF_STAGES.map((stage) => [
      stage,
      { text: prompts[stage], overridden: prompts[stage] !== DEFAULT_SDLC_STAGE_PROMPTS[stage] }
    ])
  ) as Record<SdlcHandoffStage, SdlcPromptResolution>

  return (
    <SectionCard
      title="Stage prompts"
      description="Global defaults for what each SDLC stage tells the agent. Every project inherits these unless it overrides a stage on its own prompts page."
    >
      <SdlcPromptEditor mode="global" values={values} onChange={setPrompt} onReset={resetPrompt} />
    </SectionCard>
  )
}

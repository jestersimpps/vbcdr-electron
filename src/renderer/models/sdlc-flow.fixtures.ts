import { DEFAULT_AGENT_COMMAND, defaultSdlcColumns, type SdlcColumn } from '@/models/sdlc-flow'
import { DEFAULT_SDLC_STAGE_PROMPTS, SDLC_PLAN_RELATIVE } from '@/models/sdlc-prompts'

function stage(id: 'planning' | 'implementing' | 'review', label: string, outputFile: string | null = null): SdlcColumn {
  return { id, label, kind: 'agent', command: DEFAULT_AGENT_COMMAND, prompt: DEFAULT_SDLC_STAGE_PROMPTS[id], outputFile }
}

/** Test-only: the plan, build, review flow most SDLC tests exercise, since the shipped default is a single column. */
export function threeStageFlow(): SdlcColumn[] {
  const [backlog, , done] = defaultSdlcColumns()
  const stages = [
    stage('planning', 'Planning', SDLC_PLAN_RELATIVE),
    stage('implementing', 'Implementing'),
    stage('review', 'Review')
  ]
  return [backlog, ...stages, done]
}

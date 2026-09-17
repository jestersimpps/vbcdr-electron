import { useEffect } from 'react'
import { MODEL_PROVIDERS, type ModelProviderId, type SdlcStage } from '@/models/sdlc'
import type { ProviderModel, UseProviderModels } from '@/hooks/useProviderModels'
import { useSdlcStore } from '@/stores/sdlc-store'
import { cn } from '@/lib/utils'

/** Catalogues list small models first; a stage that writes code should not default to one. */
const PREFERRED_MODEL_KEYWORDS = ['sonnet', 'opus', 'gpt-5']

function preferredModelId(models: ProviderModel[] | undefined): string | null {
  if (!models?.length) return null
  for (const keyword of PREFERRED_MODEL_KEYWORDS) {
    const match = models.find((m) => m.id.toLowerCase().includes(keyword))
    if (match) return match.id
  }
  return models[0].id
}

const SELECT_CLASS =
  'w-full truncate rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-micro text-zinc-400 outline-none hover:border-zinc-700 focus:border-zinc-600 disabled:opacity-40'

export function StageModelPicker({
  stage,
  label,
  models,
  className
}: {
  stage: SdlcStage
  label: string
  models: UseProviderModels
  className?: string
}): React.ReactElement {
  const assignment = useSdlcStore((s) => s.stageModels[stage])
  const setStageProvider = useSdlcStore((s) => s.setStageProvider)
  const setStageModel = useSdlcStore((s) => s.setStageModel)
  const setStageAssignment = useSdlcStore((s) => s.setStageAssignment)

  const provider = assignment?.provider ?? MODEL_PROVIDERS[0].id
  const result = models.byProvider[provider]
  const error = result?.error ?? null
  const preferred = preferredModelId(result?.models)
  const model = assignment?.model ?? preferred

  // An unset stage adopts the first provider and a sensible model once the list
  // arrives, so the board never shows an empty picker that nothing would run with.
  useEffect(() => {
    if (assignment?.model || !preferred) return
    setStageAssignment(stage, provider, preferred)
  }, [assignment?.model, preferred, provider, stage, setStageAssignment])

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="truncate px-0.5 text-micro font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <select
        value={provider}
        aria-label={`Provider for ${stage}`}
        onChange={(e) => setStageProvider(stage, e.target.value as ModelProviderId)}
        className={SELECT_CLASS}
      >
        {MODEL_PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <select
        value={model ?? ''}
        disabled={models.isLoading || !!error || !result?.models.length}
        aria-label={`Model for ${stage}`}
        onChange={(e) => setStageModel(stage, e.target.value || null)}
        className={SELECT_CLASS}
        title={error ?? undefined}
      >
        <option value="" disabled>
          {models.isLoading ? 'loading…' : error ? error : result?.models.length ? 'pick a model' : 'no models'}
        </option>
        {result?.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  )
}

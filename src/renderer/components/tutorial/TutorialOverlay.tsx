import { useEffect, useMemo, useCallback } from 'react'
import { X, ArrowLeft, ArrowRight, Lightbulb, EyeOff } from 'lucide-react'
import { useTutorialStore } from '@/stores/tutorial-store'
import { useProjectStore } from '@/stores/project-store'
import { useLlmCapabilities } from '@/hooks/useLlmCapabilities'
import { useSpotlight } from '@/hooks/useSpotlight'
import { useAccent } from '@/components/settings/SettingsControls'
import { TUTORIAL_STEPS } from '@/config/tutorial-steps'
import { isFeatureEnabled } from '@/config/feature-flags'
import { cn } from '@/lib/utils'
import type { SpotlightRect } from '@/models/tutorial'

const CARD_WIDTH = 416
const CARD_MARGIN = 16
const CARD_GAP = 14
const ESTIMATED_CARD_HEIGHT = 250

function cardPosition(rect: SpotlightRect | null): React.CSSProperties {
  if (!rect) {
    return { right: CARD_MARGIN, bottom: CARD_MARGIN }
  }

  const vw = window.innerWidth
  const vh = window.innerHeight

  const spaceRight = vw - (rect.left + rect.width)
  const spaceLeft = rect.left
  const spaceBelow = vh - (rect.top + rect.height)

  let left: number
  if (spaceRight >= CARD_WIDTH + CARD_GAP + CARD_MARGIN) {
    left = rect.left + rect.width + CARD_GAP
  } else if (spaceLeft >= CARD_WIDTH + CARD_GAP + CARD_MARGIN) {
    left = rect.left - CARD_WIDTH - CARD_GAP
  } else {
    left = Math.min(Math.max(CARD_MARGIN, rect.left), vw - CARD_WIDTH - CARD_MARGIN)
  }

  let top: number
  if (spaceBelow >= ESTIMATED_CARD_HEIGHT + CARD_GAP) {
    top = rect.top
  } else {
    top = rect.top + rect.height - ESTIMATED_CARD_HEIGHT
  }
  top = Math.min(Math.max(CARD_MARGIN, top), Math.max(CARD_MARGIN, vh - ESTIMATED_CARD_HEIGHT - CARD_MARGIN))

  return { left, top }
}

export function TutorialOverlay(): React.ReactElement | null {
  const open = useTutorialStore((s) => s.open)
  const stepIndex = useTutorialStore((s) => s.stepIndex)
  const closeTutorial = useTutorialStore((s) => s.closeTutorial)
  const goToStep = useTutorialStore((s) => s.goToStep)
  const nextStep = useTutorialStore((s) => s.nextStep)
  const prevStep = useTutorialStore((s) => s.prevStep)
  const capabilities = useLlmCapabilities()
  const accent = useAccent()
  const hasProject = useProjectStore((s) => s.activeProjectId !== null)

  const steps = useMemo(
    () =>
      TUTORIAL_STEPS.filter((step) => {
        if (step.capability && !capabilities[step.capability]) return false
        if (step.flag && !isFeatureEnabled(step.flag)) return false
        if (step.requiresProject && !hasProject) return false
        if (step.onlyWithoutProject && hasProject) return false
        return true
      }),
    [capabilities, hasProject]
  )

  const clampedIndex = Math.min(stepIndex, steps.length - 1)
  const step = steps[clampedIndex]

  useEffect(() => {
    if (!open) return
    step?.action?.()
    return () => step?.cleanup?.()
  }, [open, step])

  const { rect, missing } = useSpotlight(
    step?.placement === 'corner' ? undefined : step?.target,
    open
  )

  const handleNext = useCallback(() => nextStep(steps.length), [nextStep, steps.length])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true
      if (typing) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeTutorial()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        prevStep()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, closeTutorial, handleNext, prevStep])

  if (!open || !step) return null

  const isLast = clampedIndex >= steps.length - 1

  return (
    <div className="pointer-events-none fixed inset-0 z-[10001]">
      {rect && (
        <>
          <div
            className="absolute rounded-lg transition-all duration-200 ease-out"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)'
            }}
          />
          <div
            className="absolute rounded-lg transition-all duration-200 ease-out"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              border: `2px solid ${accent}`,
              boxShadow: `0 0 0 4px ${accent}33`
            }}
          />
        </>
      )}

      <div
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl transition-all duration-200 ease-out"
        style={{ width: CARD_WIDTH, ...cardPosition(rect) }}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
          <span className="text-meta font-semibold uppercase tracking-wider text-zinc-500">
            Step {clampedIndex + 1} of {steps.length}
          </span>
          <button
            onClick={closeTutorial}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Close tutorial"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">{step.title}</h2>
          <p className="text-xs leading-relaxed text-zinc-400">{step.body}</p>
          {step.tip && (
            <div className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-800/40 px-3 py-2">
              <Lightbulb size={13} className="mt-px shrink-0 text-zinc-500" />
              <span className="text-xs leading-relaxed text-zinc-400">{step.tip}</span>
            </div>
          )}
          {missing && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <EyeOff size={13} className="mt-px shrink-0 text-amber-500/80" />
              <span className="text-xs leading-relaxed text-amber-200/80">
                This one is not on screen right now, so there is nothing to highlight. It appears once
                the surrounding panel has something to show.
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1">
            {steps.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goToStep(i)}
                title={s.title}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === clampedIndex ? 'w-4' : 'w-1.5 bg-zinc-700 hover:bg-zinc-600'
                )}
                style={i === clampedIndex ? { backgroundColor: accent } : undefined}
              />
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={prevStep}
              disabled={clampedIndex === 0}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30"
            >
              <ArrowLeft size={12} />
              Back
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-zinc-950 transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              {isLast ? 'Done' : 'Next'}
              {!isLast && <ArrowRight size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

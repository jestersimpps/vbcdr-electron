import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { ToolbarButton } from '@/components/ui/ToolbarButton'
import type { SessionSource } from '@/lib/sessions'

interface SessionSettingsPopoverProps {
  source: SessionSource
  includeAllAuthors: boolean
  setIncludeAllAuthors: (v: boolean) => void
  gapMinutes: number
  setGapMinutes: (v: number) => void
  leadInMinutes: number
  setLeadInMinutes: (v: number) => void
  idleMinutes: number
  setIdleMinutes: (v: number) => void
  minSessionMinutes: number
  setMinSessionMinutes: (v: number) => void
}

export function SessionSettingsPopover({
  source,
  includeAllAuthors,
  setIncludeAllAuthors,
  gapMinutes,
  setGapMinutes,
  leadInMinutes,
  setLeadInMinutes,
  idleMinutes,
  setIdleMinutes,
  minSessionMinutes,
  setMinSessionMinutes
}: SessionSettingsPopoverProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const showCommitFields = source !== 'terminal'
  const showIdle = source !== 'commits'

  return (
    <div ref={rootRef} className="relative">
      <ToolbarButton
        onClick={() => setOpen((v) => !v)}
        variant={open ? 'active' : 'default'}
        className="border border-zinc-800 bg-zinc-900 gap-1.5"
      >
        <SlidersHorizontal size={12} />
        Session settings
      </ToolbarButton>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 w-64 rounded-md border border-zinc-800 bg-zinc-900 p-3 shadow-lg">
          <div className="space-y-3">
            {showCommitFields && (
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={includeAllAuthors}
                  onChange={(e) => setIncludeAllAuthors(e.target.checked)}
                  className="h-3 w-3 accent-zinc-400"
                />
                Include all authors
              </label>
            )}
            {showCommitFields && (
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>Gap</span>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={gapMinutes}
                    onChange={(e) => setGapMinutes(Math.max(1, Math.min(240, parseInt(e.target.value, 10) || 30)))}
                    className="w-16 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-right text-xs"
                  />
                  min
                </div>
              </div>
            )}
            {showCommitFields && (
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>Lead-in</span>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={leadInMinutes}
                    onChange={(e) => setLeadInMinutes(Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 15)))}
                    className="w-16 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-right text-xs"
                  />
                  min
                </div>
              </div>
            )}
            {showIdle && (
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>Idle</span>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={idleMinutes}
                    onChange={(e) => setIdleMinutes(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 5)))}
                    className="w-16 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-right text-xs"
                  />
                  min
                </div>
              </div>
            )}
            {showIdle && (
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span title="Hide terminal sessions shorter than this">Min session</span>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={minSessionMinutes}
                    onChange={(e) => setMinSessionMinutes(Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)))}
                    className="w-16 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-right text-xs"
                  />
                  min
                </div>
              </div>
            )}
            {!showCommitFields && !showIdle && (
              <div className="text-xs text-zinc-500">No advanced settings for this source.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useRef } from 'react'
import { FolderOpen, LayoutGrid, MonitorOff, Monitor, Image as ImageIcon, X } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useLayoutStore } from '@/stores/layout-store'
import { ThemePicker } from '@/components/theme/ThemePicker'
import { VariantToggle } from '@/components/theme/VariantToggle'
import { BranchSwitcher } from '@/components/git/BranchSwitcher'

export function StatusBar(): React.ReactElement {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => s.activeProject)
  const resetLayout = useLayoutStore((s) => s.resetLayout)
  const toggleBrowserless = useLayoutStore((s) => s.toggleBrowserless)
  const browserless = useLayoutStore((s) => activeProjectId ? s.isBrowserless(activeProjectId) : false)
  const backgroundImage = useLayoutStore((s) => s.backgroundImage)
  const setBackgroundImage = useLayoutStore((s) => s.setBackgroundImage)
  const backgroundBlur = useLayoutStore((s) => s.backgroundBlur)
  const setBackgroundBlur = useLayoutStore((s) => s.setBackgroundBlur)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleBackgroundChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') setBackgroundImage(result)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const project = activeProject()

  return (
    <div className="relative z-20 flex h-6 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-900/80 px-3 text-xs text-zinc-400">
      <div className="flex items-center gap-3 overflow-hidden min-w-0">
        {project && (
          <div className="flex items-center gap-1.5 truncate">
            <FolderOpen size={13} className="shrink-0" />
            <span className="truncate">{project.path}</span>
          </div>
        )}
      </div>
      <BranchSwitcher />

      <div className="flex shrink-0 items-center gap-1">
        {activeProjectId && (
          <>
            <button
              onClick={() => toggleBrowserless(activeProjectId)}
              className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              title={browserless ? 'Switch to Browser mode' : 'Switch to Browserless mode'}
            >
              {browserless ? <Monitor size={13} /> : <MonitorOff size={13} />}
              <span>{browserless ? 'Browser' : 'Browserless'}</span>
            </button>
            <button
              onClick={() => resetLayout(activeProjectId)}
              className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              title="Reset layout"
            >
              <LayoutGrid size={13} />
              <span>Reset</span>
            </button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleBackgroundChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title="Set background image (reopen terminals to apply)"
        >
          <ImageIcon size={13} />
          <span>Background</span>
        </button>
        {backgroundImage && (
          <>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={backgroundBlur}
              onChange={(e) => setBackgroundBlur(Number(e.target.value))}
              title={`Background blur: ${backgroundBlur}px`}
              className="h-1 w-20 cursor-pointer accent-zinc-500"
            />
            <button
              onClick={() => setBackgroundImage(null)}
              className="flex shrink-0 items-center rounded px-1 py-0.5 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              title="Clear background image"
            >
              <X size={13} />
            </button>
          </>
        )}
        <ThemePicker />
        <VariantToggle />
      </div>
    </div>
  )
}

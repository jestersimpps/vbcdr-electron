import { useEffect, useState } from 'react'
import { FolderOpen, RotateCcw } from 'lucide-react'
import { useLayoutStore } from '@/stores/layout-store'
import { SectionCard, useAccent } from '@/components/settings/SettingsControls'

export function GlobalTerminalFolderSection(): React.ReactElement {
  const globalTerminalCwd = useLayoutStore((s) => s.globalTerminalCwd)
  const setGlobalTerminalCwd = useLayoutStore((s) => s.setGlobalTerminalCwd)
  const accent = useAccent()
  const [draft, setDraft] = useState<string>(globalTerminalCwd)

  useEffect(() => {
    setDraft(globalTerminalCwd)
  }, [globalTerminalCwd])

  const commit = (raw: string): void => {
    setGlobalTerminalCwd(raw)
  }

  const browse = async (): Promise<void> => {
    const folder = await window.api.fs.pickFolder()
    if (folder) setGlobalTerminalCwd(folder)
  }

  return (
    <SectionCard
      title="Claude terminal default folder"
      description="New tabs on the Claude terminal page start in this folder. Leave empty to use the active project."
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1.5">
          <FolderOpen size={13} style={{ color: accent }} />
          <input
            type="text"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
            }}
            placeholder="Active project folder"
            className="w-96 bg-transparent font-mono text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        </div>
        <button
          onClick={browse}
          className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          <FolderOpen size={11} />
          Browse
        </button>
        <button
          onClick={() => {
            setGlobalTerminalCwd('')
            setDraft('')
          }}
          className="ml-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
          title="Clear default folder"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      </div>
    </SectionCard>
  )
}

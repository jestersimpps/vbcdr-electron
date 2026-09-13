import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useLayoutStore, DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT } from '@/stores/layout-store'
import { PrefToggle, SectionCard, useAccent } from '@/components/settings/SettingsControls'

export function WorktreeSection(): React.ReactElement {
  const enabled = useLayoutStore((s) => s.useWorktreesForNewLlmTabs)
  const setEnabled = useLayoutStore((s) => s.setUseWorktreesForNewLlmTabs)
  const prompt = useLayoutStore((s) => s.closeTabWorkflowPrompt)
  const setPrompt = useLayoutStore((s) => s.setCloseTabWorkflowPrompt)
  const resetPrompt = useLayoutStore((s) => s.resetCloseTabWorkflowPrompt)
  const accent = useAccent()
  const [draft, setDraft] = useState(prompt)

  useEffect(() => {
    setDraft(prompt)
  }, [prompt])

  return (
    <SectionCard
      title="Worktrees"
      description="Give each new LLM tab its own git worktree so parallel tabs never touch each other's changes."
    >
      <div className="space-y-4">
        <PrefToggle
          label="Use worktrees for new LLM tabs"
          description="Creates a branch and checks it out under .worktrees/ inside the project. Falls back to the project folder when it is not a git repo."
          enabled={enabled}
          onToggle={() => setEnabled(!enabled)}
          accent={accent}
        />
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-zinc-300">Close-tab workflow instruction</span>
            <button
              onClick={resetPrompt}
              disabled={prompt === DEFAULT_CLOSE_TAB_WORKFLOW_PROMPT}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200 disabled:opacity-40"
              title="Reset to default"
            >
              <RotateCcw size={11} />
              Reset
            </button>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setPrompt(draft)}
            rows={4}
            spellCheck={false}
            className="w-full max-w-2xl resize-y rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1.5 text-xs leading-relaxed text-zinc-200 outline-none focus:border-zinc-600"
          />
          <p className="mt-1 text-meta text-zinc-500">
            Sent to the LLM when you close a worktree tab and choose to run the workflow. {'{branch}'} is replaced with the branch name.
          </p>
        </div>
      </div>
    </SectionCard>
  )
}

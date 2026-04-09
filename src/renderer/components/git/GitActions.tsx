import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GitCommitHorizontal, GitPullRequest, Sparkles, X } from 'lucide-react'
import { useGitStore } from '@/stores/git-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { sendToTerminal } from '@/lib/terminal-utils'

export function GitActions(): React.ReactElement | null {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProject = useProjectStore((s) => {
    const id = s.activeProjectId
    return id ? s.projects.find((p) => p.id === id) : undefined
  })
  const activeTerminalTabId = useTerminalStore((s) =>
    activeProjectId ? s.activeTabPerProject[activeProjectId] : undefined
  )
  const isRepo = useGitStore((s) => (activeProjectId ? s.isRepoPerProject[activeProjectId] : false))
  const branches = useGitStore((s) => (activeProjectId ? s.branchesPerProject[activeProjectId] : undefined))

  const [featureModalOpen, setFeatureModalOpen] = useState(false)
  const [featureDescription, setFeatureDescription] = useState('')
  const featureInputRef = useRef<HTMLInputElement>(null)

  const currentBranch = branches?.find((b) => b.current)
  const isOnDefault = currentBranch && (currentBranch.name === 'main' || currentBranch.name === 'master')

  const handleFeatureSubmit = useCallback(() => {
    if (!activeTerminalTabId || !featureDescription.trim()) return
    sendToTerminal(
      activeTerminalTabId,
      `Create a new git feature branch for: ${featureDescription.trim()}. Create the branch name from the description using kebab-case prefixed with feature/. Switch to the new branch.`
    )
    setFeatureDescription('')
    setFeatureModalOpen(false)
  }, [activeTerminalTabId, featureDescription])

  const handleCreatePR = useCallback(async () => {
    if (!activeTerminalTabId || !activeProject) return
    const defaultBranch = await window.api.git.defaultBranch(activeProject.path)
    const diffSummary = await window.api.git.diffSummary(activeProject.path, defaultBranch)
    sendToTerminal(
      activeTerminalTabId,
      `Create a pull request using gh CLI against ${defaultBranch}. Here's the diff summary:\n\n${diffSummary}\n\nGenerate a concise PR title and description based on the changes.`
    )
  }, [activeTerminalTabId, activeProject])

  useEffect(() => {
    if (featureModalOpen) setTimeout(() => featureInputRef.current?.focus(), 50)
  }, [featureModalOpen])

  if (!activeProject || !isRepo) return null

  return (
    <>
      <button
        disabled={!activeTerminalTabId}
        onClick={() => activeTerminalTabId && sendToTerminal(activeTerminalTabId, '/commit')}
        onMouseDown={(e) => e.preventDefault()}
        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none"
        title="Commit"
      >
        <GitCommitHorizontal size={16} />
      </button>
      <button
        disabled={!activeTerminalTabId || !!isOnDefault}
        onClick={handleCreatePR}
        onMouseDown={(e) => e.preventDefault()}
        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none"
        title={isOnDefault ? 'Switch to a feature branch first' : 'Create pull request'}
      >
        <GitPullRequest size={16} />
      </button>
      <button
        disabled={!activeTerminalTabId}
        onClick={() => setFeatureModalOpen(true)}
        onMouseDown={(e) => e.preventDefault()}
        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none"
        title="New Feature"
      >
        <Sparkles size={16} />
      </button>
      {featureModalOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setFeatureModalOpen(false); setFeatureDescription('') } }}
        >
          <div className="mx-4 w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-200">New Feature</span>
              <button
                onClick={() => { setFeatureModalOpen(false); setFeatureDescription('') }}
                className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <input
              ref={featureInputRef}
              type="text"
              value={featureDescription}
              onChange={(e) => setFeatureDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFeatureSubmit()
                if (e.key === 'Escape') { setFeatureModalOpen(false); setFeatureDescription('') }
              }}
              placeholder="Describe the feature..."
              className="mb-3 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            />
            <button
              disabled={!featureDescription.trim()}
              onClick={handleFeatureSubmit}
              className="w-full rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none"
            >
              Send to LLM
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

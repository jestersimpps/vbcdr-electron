import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { sendToTerminalViaKeyboardEvent } from '@/lib/terminal-utils'

interface NewFeatureModalProps {
  terminalTabId: string
  baseBranch?: string
  onClose: () => void
}

export function NewFeatureModal({
  terminalTabId,
  baseBranch,
  onClose
}: NewFeatureModalProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return (): void => clearTimeout(timer)
  }, [])

  const handleSubmit = (): void => {
    const trimmed = description.trim()
    if (!trimmed) return
    const from = baseBranch ? ` Branch off ${baseBranch}.` : ''
    sendToTerminalViaKeyboardEvent(
      terminalTabId,
      `Create a new git feature branch for: ${trimmed}. Create the branch name from the description using kebab-case prefixed with feature/.${from} Switch to the new branch.`
    )
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mx-4 w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-200">New Feature</span>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        {baseBranch && (
          <div className="mb-3 flex items-center gap-1.5 text-micro text-zinc-500">
            <span>Based on</span>
            <span className="rounded bg-green-400/15 px-1.5 py-px font-medium text-green-400">
              {baseBranch}
            </span>
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape') onClose()
          }}
          placeholder="Describe the feature..."
          className="mb-3 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        />
        <button
          disabled={!description.trim()}
          onClick={handleSubmit}
          className="w-full rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-40"
        >
          Send to LLM
        </button>
      </div>
    </div>,
    document.body
  )
}

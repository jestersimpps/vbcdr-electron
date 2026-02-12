import { useRef, useEffect } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'

interface FindBarProps {
  query: string
  onQueryChange: (query: string) => void
  matchInfo: { current: number; total: number }
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export function FindBar({ query, onQueryChange, matchInfo, onNext, onPrev, onClose }: FindBarProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="absolute right-4 top-2 z-30 flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.shiftKey ? onPrev() : onNext()
          }
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Find in page..."
        className="w-48 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
      />
      {query && (
        <span className="text-[10px] text-zinc-500 whitespace-nowrap">
          {matchInfo.total > 0 ? `${matchInfo.current}/${matchInfo.total}` : 'No matches'}
        </span>
      )}
      <button onClick={onPrev} className="rounded p-0.5 text-zinc-500 hover:text-zinc-300" title="Previous">
        <ChevronUp size={14} />
      </button>
      <button onClick={onNext} className="rounded p-0.5 text-zinc-500 hover:text-zinc-300" title="Next">
        <ChevronDown size={14} />
      </button>
      <button onClick={onClose} className="rounded p-0.5 text-zinc-500 hover:text-zinc-300" title="Close">
        <X size={14} />
      </button>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { stripAnsi } from '@/lib/voice/agent-protocol'

const MAX_CHARS = 40000

export function AgentTerminal(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [output, setOutput] = useState('')
  const scrollRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    return window.api.voiceAgent.onData((chunk) => {
      setOutput((prev) => (prev + stripAnsi(chunk)).slice(-MAX_CHARS))
    })
  }, [])

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [output, open])

  return (
    <div className="border-t border-zinc-800">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-meta text-zinc-500 transition-colors hover:text-zinc-300"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Raw agent output
      </button>
      {open && (
        <pre
          ref={scrollRef}
          className="max-h-52 overflow-y-auto whitespace-pre-wrap break-all bg-zinc-950/60 px-3 py-2 text-meta leading-relaxed text-zinc-500"
        >
          {output || 'No output yet.'}
        </pre>
      )}
    </div>
  )
}

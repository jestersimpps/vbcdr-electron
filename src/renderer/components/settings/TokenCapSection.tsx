import { useState } from 'react'
import { RotateCcw, Zap } from 'lucide-react'
import { useLayoutStore, DEFAULT_TOKEN_CAP } from '@/stores/layout-store'
import { SectionCard, useAccent } from '@/components/settings/SettingsControls'
import { cn } from '@/lib/utils'

const TOKEN_CAP_PRESETS: { label: string; value: number }[] = [
  { label: '100k', value: 100_000 },
  { label: '160k', value: 160_000 },
  { label: '200k', value: 200_000 },
  { label: '1M', value: 1_000_000 }
]

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return String(n)
}

export function TokenCapSection(): React.ReactElement {
  const tokenCap = useLayoutStore((s) => s.tokenCap)
  const setTokenCap = useLayoutStore((s) => s.setTokenCap)
  const accent = useAccent()
  const [draft, setDraft] = useState<string>(String(tokenCap))

  const commit = (raw: string): void => {
    const parsed = Number(raw.replace(/[,_\s]/g, ''))
    if (Number.isFinite(parsed) && parsed > 0) {
      setTokenCap(parsed)
      setDraft(String(Math.round(parsed)))
    } else {
      setDraft(String(tokenCap))
    }
  }

  return (
    <SectionCard
      title="Token Cap"
      description="Maximum tokens used to calculate the Claude progress bar (per terminal tab)."
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1.5">
          <Zap size={13} style={{ color: accent }} />
          <input
            type="number"
            min={1}
            step={1000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
            }}
            className="w-32 bg-transparent text-sm tabular-nums text-zinc-200 outline-none"
          />
          <span className="text-xs text-zinc-500">tokens</span>
        </div>
        <div className="flex items-center gap-1">
          {TOKEN_CAP_PRESETS.map((p) => {
            const active = tokenCap === p.value
            return (
              <button
                key={p.value}
                onClick={() => {
                  setTokenCap(p.value)
                  setDraft(String(p.value))
                }}
                className={cn(
                  'rounded border px-2 py-1 text-xs transition-colors',
                  active
                    ? 'border-transparent text-zinc-100'
                    : 'border-zinc-800 bg-zinc-900/30 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                )}
                style={active ? { backgroundColor: `${accent}26`, color: accent } : undefined}
              >
                {p.label}
              </button>
            )
          })}
          <button
            onClick={() => {
              setTokenCap(DEFAULT_TOKEN_CAP)
              setDraft(String(DEFAULT_TOKEN_CAP))
            }}
            className="ml-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
            title="Reset to default"
          >
            <RotateCcw size={11} />
            Reset
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Current: <span className="tabular-nums text-zinc-300">{tokenCap.toLocaleString()}</span>{' '}
        ({formatTokens(tokenCap)})
      </p>
    </SectionCard>
  )
}

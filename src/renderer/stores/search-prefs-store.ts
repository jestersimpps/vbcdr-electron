import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SearchPrefsState {
  excludesPerProject: Record<string, string[]>
  setExcludes: (projectId: string, excludes: string[]) => void
  removeProjectExcludes: (projectId: string) => void
}

function normalize(entry: string): string {
  return entry.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/').trim()
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const v = normalize(raw)
    if (!v) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

const DEFAULT_EXCLUDES = ['node_modules', 'dist', 'out', 'build', '.next', '.turbo', '.cache', 'coverage']

export const useSearchPrefsStore = create<SearchPrefsState>()(
  persist(
    (set) => ({
      excludesPerProject: {},
      setExcludes: (projectId: string, excludes: string[]) => {
        set((s) => ({
          excludesPerProject: { ...s.excludesPerProject, [projectId]: dedupe(excludes) }
        }))
      },
      removeProjectExcludes: (projectId: string) => {
        set((s) => {
          const next = { ...s.excludesPerProject }
          delete next[projectId]
          return { excludesPerProject: next }
        })
      }
    }),
    {
      name: 'vbcdr-search-prefs',
      partialize: (state) => ({ excludesPerProject: state.excludesPerProject })
    }
  )
)

export function getProjectExcludes(projectId: string): string[] {
  const stored = useSearchPrefsStore.getState().excludesPerProject[projectId]
  return stored ?? DEFAULT_EXCLUDES
}

export { DEFAULT_EXCLUDES }

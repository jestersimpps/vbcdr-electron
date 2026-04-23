import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TimeRange } from '@/lib/sessions'

interface StatsStore {
  range: TimeRange['key']
  gapMinutes: number
  leadInMinutes: number
  includeAllAuthors: boolean
  setRange: (range: TimeRange['key']) => void
  setGapMinutes: (n: number) => void
  setLeadInMinutes: (n: number) => void
  setIncludeAllAuthors: (v: boolean) => void
}

export const useStatsStore = create<StatsStore>()(
  persist(
    (set) => ({
      range: 'week',
      gapMinutes: 30,
      leadInMinutes: 15,
      includeAllAuthors: false,
      setRange: (range) => set({ range }),
      setGapMinutes: (gapMinutes) => set({ gapMinutes }),
      setLeadInMinutes: (leadInMinutes) => set({ leadInMinutes }),
      setIncludeAllAuthors: (includeAllAuthors) => set({ includeAllAuthors })
    }),
    { name: 'vbcdr-stats' }
  )
)

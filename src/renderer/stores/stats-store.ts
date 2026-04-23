import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TimeRange, SessionSource } from '@/lib/sessions'

interface StatsStore {
  range: TimeRange['key']
  gapMinutes: number
  leadInMinutes: number
  includeAllAuthors: boolean
  source: SessionSource
  idleMinutes: number
  setRange: (range: TimeRange['key']) => void
  setGapMinutes: (n: number) => void
  setLeadInMinutes: (n: number) => void
  setIncludeAllAuthors: (v: boolean) => void
  setSource: (s: SessionSource) => void
  setIdleMinutes: (n: number) => void
}

export const useStatsStore = create<StatsStore>()(
  persist(
    (set) => ({
      range: 'week',
      gapMinutes: 30,
      leadInMinutes: 15,
      includeAllAuthors: false,
      source: 'commits',
      idleMinutes: 5,
      setRange: (range) => set({ range }),
      setGapMinutes: (gapMinutes) => set({ gapMinutes }),
      setLeadInMinutes: (leadInMinutes) => set({ leadInMinutes }),
      setIncludeAllAuthors: (includeAllAuthors) => set({ includeAllAuthors }),
      setSource: (source) => set({ source }),
      setIdleMinutes: (idleMinutes) => set({ idleMinutes })
    }),
    { name: 'vbcdr-stats' }
  )
)

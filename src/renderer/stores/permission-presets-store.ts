import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PermissionMode } from '@/lib/claude-permissions'
import { PROFILE_LIBRARY, getProfile, type PermissionProfile } from '@/config/permission-profile-library'

export interface PermissionPreset {
  id: string
  templateId: string
  name: string
  color: string
  mode: PermissionMode
  allow: string[]
  ask: string[]
  deny: string[]
}

export const PRESET_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#eab308',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#a3a3a3'
]

export const DEFAULT_TEMPLATE_IDS = ['strict', 'default', 'permissive', 'yolo'] as const
export const MAX_PRESETS = 8

function fromTemplate(profile: PermissionProfile, instanceId?: string): PermissionPreset {
  return {
    id: instanceId ?? profile.templateId,
    templateId: profile.templateId,
    name: profile.name,
    color: profile.color,
    mode: profile.mode,
    allow: [...profile.allow],
    ask: [...profile.ask],
    deny: [...profile.deny]
  }
}

function clonePreset(p: PermissionPreset): PermissionPreset {
  return { ...p, allow: [...p.allow], ask: [...p.ask], deny: [...p.deny] }
}

function defaultPresets(): PermissionPreset[] {
  return DEFAULT_TEMPLATE_IDS.map((id) => {
    const profile = getProfile(id)
    if (!profile) throw new Error(`Missing seed profile: ${id}`)
    return fromTemplate(profile)
  })
}

function uniqueInstanceId(templateId: string, existing: PermissionPreset[]): string {
  const taken = new Set(existing.map((p) => p.id))
  if (!taken.has(templateId)) return templateId
  let n = 2
  while (taken.has(`${templateId}-${n}`)) n++
  return `${templateId}-${n}`
}

interface PermissionPresetsState {
  presets: PermissionPreset[]
  updatePreset: (id: string, patch: Partial<Omit<PermissionPreset, 'id'>>) => void
  loadFromTemplate: (id: string, templateId: string) => void
  addPreset: (templateId: string) => string | null
  removePreset: (id: string) => void
  resetPreset: (id: string) => void
  resetAll: () => void
}

export const usePermissionPresetsStore = create<PermissionPresetsState>()(
  persist(
    (set, get) => ({
      presets: defaultPresets(),

      updatePreset: (id, patch) => {
        set({
          presets: get().presets.map((p) => (p.id === id ? { ...p, ...patch } : p))
        })
      },

      loadFromTemplate: (id, templateId) => {
        const profile = getProfile(templateId)
        if (!profile) return
        set({
          presets: get().presets.map((p) =>
            p.id === id
              ? {
                  ...fromTemplate(profile),
                  id: p.id
                }
              : p
          )
        })
      },

      addPreset: (templateId) => {
        const profile = getProfile(templateId)
        if (!profile) return null
        const current = get().presets
        if (current.length >= MAX_PRESETS) return null
        const instanceId = uniqueInstanceId(templateId, current)
        const next = fromTemplate(profile, instanceId)
        set({ presets: [...current, next] })
        return instanceId
      },

      removePreset: (id) => {
        set({ presets: get().presets.filter((p) => p.id !== id) })
      },

      resetPreset: (id) => {
        const target = get().presets.find((p) => p.id === id)
        if (!target) return
        const profile = getProfile(target.templateId)
        if (!profile) return
        set({
          presets: get().presets.map((p) =>
            p.id === id ? { ...fromTemplate(profile), id: p.id } : p
          )
        })
      },

      resetAll: () => set({ presets: defaultPresets() })
    }),
    {
      name: 'vbcdr-permission-presets',
      version: 2,
      partialize: (state) => ({ presets: state.presets }),
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return { presets: defaultPresets() }
        const state = persisted as { presets?: unknown }
        const list = Array.isArray(state.presets) ? (state.presets as Partial<PermissionPreset>[]) : []
        if (version < 2) {
          const upgraded = list.map((p) => ({
            ...p,
            templateId: p.templateId ?? p.id ?? ''
          })) as PermissionPreset[]
          return { presets: upgraded }
        }
        return { presets: list as PermissionPreset[] }
      },
      merge: (persisted, current) => {
        const persistedState = persisted as { presets?: PermissionPreset[] } | undefined
        const persistedPresets = persistedState?.presets ?? []
        if (persistedPresets.length === 0) return { ...current, presets: defaultPresets() }
        return { ...current, presets: persistedPresets.map(clonePreset) }
      }
    }
  )
)

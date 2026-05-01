import { describe, it, expect, beforeEach } from 'vitest'
import { usePermissionPresetsStore, DEFAULT_TEMPLATE_IDS, MAX_PRESETS } from './permission-presets-store'
import { PROFILE_LIBRARY, getProfile } from '@/config/permission-profile-library'

beforeEach(() => {
  localStorage.clear()
  usePermissionPresetsStore.getState().resetAll()
})

describe('permission-presets-store', () => {
  it('seeds the four built-in presets in order', () => {
    const ids = usePermissionPresetsStore.getState().presets.map((p) => p.id)
    expect(ids).toEqual([...DEFAULT_TEMPLATE_IDS])
  })

  it('seed presets carry templateId equal to id', () => {
    for (const p of usePermissionPresetsStore.getState().presets) {
      expect(p.templateId).toBe(p.id)
    }
  })

  it('seed values come from the library', () => {
    const presets = usePermissionPresetsStore.getState().presets
    const strict = presets.find((p) => p.id === 'strict')
    const libraryStrict = getProfile('strict')!
    expect(strict?.allow).toEqual(libraryStrict.allow)
    expect(strict?.ask).toEqual(libraryStrict.ask)
    expect(strict?.deny).toEqual(libraryStrict.deny)
  })

  it('updatePreset patches a preset by id', () => {
    usePermissionPresetsStore.getState().updatePreset('strict', { name: 'Locked', color: '#000000' })
    const p = usePermissionPresetsStore.getState().presets.find((x) => x.id === 'strict')
    expect(p?.name).toBe('Locked')
    expect(p?.color).toBe('#000000')
  })

  it('updatePreset replaces rule arrays when given', () => {
    usePermissionPresetsStore.getState().updatePreset('default', { allow: ['Read'] })
    const p = usePermissionPresetsStore.getState().presets.find((x) => x.id === 'default')
    expect(p?.allow).toEqual(['Read'])
  })

  it('loadFromTemplate replaces a preset card with library content but keeps id', () => {
    usePermissionPresetsStore.getState().loadFromTemplate('strict', 'frontend')
    const p = usePermissionPresetsStore.getState().presets.find((x) => x.id === 'strict')
    expect(p?.id).toBe('strict')
    expect(p?.templateId).toBe('frontend')
    expect(p?.name).toBe('Frontend')
    expect(p?.allow).toEqual(getProfile('frontend')!.allow)
  })

  it('loadFromTemplate is a no-op for unknown template', () => {
    const before = usePermissionPresetsStore.getState().presets
    usePermissionPresetsStore.getState().loadFromTemplate('strict', 'does-not-exist')
    expect(usePermissionPresetsStore.getState().presets).toEqual(before)
  })

  it('addPreset appends a new card from template with unique id', () => {
    const id = usePermissionPresetsStore.getState().addPreset('frontend')
    expect(id).toBe('frontend')
    expect(usePermissionPresetsStore.getState().presets.map((p) => p.id)).toContain('frontend')
  })

  it('addPreset creates suffixed id on collision', () => {
    usePermissionPresetsStore.getState().addPreset('frontend')
    const id2 = usePermissionPresetsStore.getState().addPreset('frontend')
    expect(id2).toBe('frontend-2')
  })

  it('addPreset returns null past MAX_PRESETS', () => {
    for (let i = 0; i < MAX_PRESETS; i++) {
      usePermissionPresetsStore.getState().addPreset('frontend')
    }
    const result = usePermissionPresetsStore.getState().addPreset('frontend')
    expect(result).toBe(null)
    expect(usePermissionPresetsStore.getState().presets.length).toBeLessThanOrEqual(MAX_PRESETS)
  })

  it('removePreset removes by id', () => {
    usePermissionPresetsStore.getState().removePreset('yolo')
    expect(usePermissionPresetsStore.getState().presets.map((p) => p.id)).not.toContain('yolo')
  })

  it('resetPreset restores to current templateId (after loadFromTemplate)', () => {
    usePermissionPresetsStore.getState().loadFromTemplate('strict', 'frontend')
    usePermissionPresetsStore.getState().updatePreset('strict', { name: 'Edited' })
    usePermissionPresetsStore.getState().resetPreset('strict')
    const p = usePermissionPresetsStore.getState().presets.find((x) => x.id === 'strict')
    expect(p?.name).toBe('Frontend')
    expect(p?.allow).toEqual(getProfile('frontend')!.allow)
  })

  it('resetAll restores defaults', () => {
    usePermissionPresetsStore.getState().updatePreset('yolo', { name: 'X' })
    usePermissionPresetsStore.getState().addPreset('frontend')
    usePermissionPresetsStore.getState().resetAll()
    expect(usePermissionPresetsStore.getState().presets.map((p) => p.id)).toEqual([
      ...DEFAULT_TEMPLATE_IDS
    ])
  })
})

describe('PROFILE_LIBRARY', () => {
  it('contains the four default seeds', () => {
    for (const id of DEFAULT_TEMPLATE_IDS) {
      expect(PROFILE_LIBRARY.find((p) => p.templateId === id)).toBeDefined()
    }
  })

  it('every profile has a unique templateId', () => {
    const ids = PROFILE_LIBRARY.map((p) => p.templateId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every profile has a non-empty name and color', () => {
    for (const p of PROFILE_LIBRARY) {
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

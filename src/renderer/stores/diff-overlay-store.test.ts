import { describe, it, expect, beforeEach } from 'vitest'
import { useDiffOverlayStore } from './diff-overlay-store'

const reset = (): void => {
  useDiffOverlayStore.setState({
    changedFilesPerTab: {},
    dismissedPerProject: {},
    excludedPerProject: {}
  })
}

describe('diff-overlay-store', () => {
  beforeEach(reset)

  describe('markFileChanged', () => {
    it('adds path to a tab set', () => {
      useDiffOverlayStore.getState().markFileChanged('t1', 'a.ts')
      expect(useDiffOverlayStore.getState().changedFilesPerTab.t1.has('a.ts')).toBe(true)
    })

    it('is idempotent and skips state update for known paths', () => {
      useDiffOverlayStore.getState().markFileChanged('t1', 'a.ts')
      const before = useDiffOverlayStore.getState().changedFilesPerTab.t1
      useDiffOverlayStore.getState().markFileChanged('t1', 'a.ts')
      const after = useDiffOverlayStore.getState().changedFilesPerTab.t1
      expect(after).toBe(before)
    })

    it('keeps tabs separate', () => {
      useDiffOverlayStore.getState().markFileChanged('t1', 'a.ts')
      useDiffOverlayStore.getState().markFileChanged('t2', 'b.ts')
      const m = useDiffOverlayStore.getState().changedFilesPerTab
      expect(m.t1.has('a.ts')).toBe(true)
      expect(m.t2.has('b.ts')).toBe(true)
      expect(m.t1.has('b.ts')).toBe(false)
    })
  })

  describe('clearForTab', () => {
    it('removes a tab entry', () => {
      useDiffOverlayStore.getState().markFileChanged('t1', 'a.ts')
      useDiffOverlayStore.getState().clearForTab('t1')
      expect(useDiffOverlayStore.getState().changedFilesPerTab.t1).toBeUndefined()
    })

    it('is a no-op when tab is not tracked', () => {
      const before = useDiffOverlayStore.getState()
      useDiffOverlayStore.getState().clearForTab('nope')
      expect(useDiffOverlayStore.getState()).toBe(before)
    })
  })

  describe('toggleExcluded / clearExcluded', () => {
    it('toggles a path in/out of the excluded set', () => {
      useDiffOverlayStore.getState().toggleExcluded('p1', 'a.ts')
      expect(useDiffOverlayStore.getState().excludedPerProject.p1.has('a.ts')).toBe(true)
      useDiffOverlayStore.getState().toggleExcluded('p1', 'a.ts')
      expect(useDiffOverlayStore.getState().excludedPerProject.p1.has('a.ts')).toBe(false)
    })

    it('clearExcluded removes the project entry', () => {
      useDiffOverlayStore.getState().toggleExcluded('p1', 'a.ts')
      useDiffOverlayStore.getState().clearExcluded('p1')
      expect(useDiffOverlayStore.getState().excludedPerProject.p1).toBeUndefined()
    })

    it('clearExcluded is a no-op for unknown projects', () => {
      const before = useDiffOverlayStore.getState()
      useDiffOverlayStore.getState().clearExcluded('nope')
      expect(useDiffOverlayStore.getState()).toBe(before)
    })
  })

  describe('closeForProject / resetDismiss', () => {
    it('marks a project dismissed and can reset it', () => {
      useDiffOverlayStore.getState().closeForProject('p1')
      expect(useDiffOverlayStore.getState().dismissedPerProject.p1).toBe(true)
      useDiffOverlayStore.getState().resetDismiss('p1')
      expect(useDiffOverlayStore.getState().dismissedPerProject.p1).toBeUndefined()
    })

    it('resetDismiss is a no-op when not dismissed', () => {
      const before = useDiffOverlayStore.getState()
      useDiffOverlayStore.getState().resetDismiss('p1')
      expect(useDiffOverlayStore.getState()).toBe(before)
    })
  })
})

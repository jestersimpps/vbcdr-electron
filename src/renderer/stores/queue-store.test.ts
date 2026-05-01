import { describe, it, expect, beforeEach } from 'vitest'
import { useQueueStore } from './queue-store'

const resetStore = (): void => {
  useQueueStore.setState({
    itemsPerProject: {},
    autoRunPerProject: {},
    panelOpenPerProject: {}
  })
}

describe('queue-store', () => {
  beforeEach(resetStore)

  describe('addItem', () => {
    it('appends a trimmed item and sets autoRun for the project', () => {
      const item = useQueueStore.getState().addItem('p1', '  hello  ')
      expect(item).not.toBeNull()
      expect(item!.text).toBe('hello')
      expect(useQueueStore.getState().getItems('p1')).toHaveLength(1)
      expect(useQueueStore.getState().isAutoRun('p1')).toBe(true)
    })

    it('returns null and does nothing for empty/whitespace text', () => {
      expect(useQueueStore.getState().addItem('p1', '')).toBeNull()
      expect(useQueueStore.getState().addItem('p1', '   ')).toBeNull()
      expect(useQueueStore.getState().getItems('p1')).toEqual([])
      expect(useQueueStore.getState().isAutoRun('p1')).toBe(false)
    })

    it('keeps items per-project isolated', () => {
      useQueueStore.getState().addItem('p1', 'a')
      useQueueStore.getState().addItem('p2', 'b')
      expect(useQueueStore.getState().getItems('p1').map((i) => i.text)).toEqual(['a'])
      expect(useQueueStore.getState().getItems('p2').map((i) => i.text)).toEqual(['b'])
    })

    it('assigns unique ids', () => {
      const a = useQueueStore.getState().addItem('p1', 'a')!
      const b = useQueueStore.getState().addItem('p1', 'b')!
      expect(a.id).not.toBe(b.id)
    })
  })

  describe('updateItem', () => {
    it('updates text on matching item only', () => {
      const a = useQueueStore.getState().addItem('p1', 'a')!
      useQueueStore.getState().addItem('p1', 'b')
      useQueueStore.getState().updateItem('p1', a.id, 'A!')
      const items = useQueueStore.getState().getItems('p1')
      expect(items[0].text).toBe('A!')
      expect(items[1].text).toBe('b')
    })

    it('ignores empty text updates', () => {
      const a = useQueueStore.getState().addItem('p1', 'a')!
      useQueueStore.getState().updateItem('p1', a.id, '   ')
      expect(useQueueStore.getState().getItems('p1')[0].text).toBe('a')
    })
  })

  describe('removeItem', () => {
    it('removes only the matching item', () => {
      const a = useQueueStore.getState().addItem('p1', 'a')!
      useQueueStore.getState().addItem('p1', 'b')
      useQueueStore.getState().removeItem('p1', a.id)
      expect(useQueueStore.getState().getItems('p1').map((i) => i.text)).toEqual(['b'])
    })
  })

  describe('reorderItems', () => {
    it('reorders items by id list', () => {
      const a = useQueueStore.getState().addItem('p1', 'a')!
      const b = useQueueStore.getState().addItem('p1', 'b')!
      const c = useQueueStore.getState().addItem('p1', 'c')!
      useQueueStore.getState().reorderItems('p1', [c.id, a.id, b.id])
      expect(useQueueStore.getState().getItems('p1').map((i) => i.text)).toEqual(['c', 'a', 'b'])
    })

    it('drops unknown ids and keeps the order from the supplied list', () => {
      const a = useQueueStore.getState().addItem('p1', 'a')!
      const b = useQueueStore.getState().addItem('p1', 'b')!
      useQueueStore.getState().reorderItems('p1', [b.id, 'unknown', a.id])
      expect(useQueueStore.getState().getItems('p1').map((i) => i.text)).toEqual(['b', 'a'])
    })
  })

  describe('dequeue', () => {
    it('returns and removes the head item', () => {
      useQueueStore.getState().addItem('p1', 'a')
      useQueueStore.getState().addItem('p1', 'b')
      const head = useQueueStore.getState().dequeue('p1')
      expect(head!.text).toBe('a')
      expect(useQueueStore.getState().getItems('p1').map((i) => i.text)).toEqual(['b'])
    })

    it('returns undefined when queue is empty', () => {
      expect(useQueueStore.getState().dequeue('p1')).toBeUndefined()
    })
  })

  describe('clear / setAutoRun / setPanelOpen', () => {
    it('clear empties the queue but leaves autoRun untouched', () => {
      useQueueStore.getState().addItem('p1', 'a')
      useQueueStore.getState().clear('p1')
      expect(useQueueStore.getState().getItems('p1')).toEqual([])
      expect(useQueueStore.getState().isAutoRun('p1')).toBe(true)
    })

    it('setAutoRun and setPanelOpen toggle independently', () => {
      useQueueStore.getState().setAutoRun('p1', true)
      useQueueStore.getState().setPanelOpen('p1', true)
      expect(useQueueStore.getState().isAutoRun('p1')).toBe(true)
      expect(useQueueStore.getState().isPanelOpen('p1')).toBe(true)
      useQueueStore.getState().setAutoRun('p1', false)
      expect(useQueueStore.getState().isAutoRun('p1')).toBe(false)
      expect(useQueueStore.getState().isPanelOpen('p1')).toBe(true)
    })
  })
})

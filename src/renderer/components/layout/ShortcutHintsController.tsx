import { useEffect } from 'react'
import { useShortcutHintStore } from '@/stores/shortcut-hint-store'

export function ShortcutHintsController(): null {
  useEffect(() => {
    const update = (event: KeyboardEvent): void => {
      const state = useShortcutHintStore.getState()
      const releasingPrimary = event.type === 'keyup' && (event.key === 'Meta' || event.key === 'Control')
      const releasingAlt = event.type === 'keyup' && event.key === 'Alt'
      const primary = !releasingPrimary && (event.metaKey || event.ctrlKey)
      const alt = !releasingAlt && event.altKey
      state.setTerminalNumbersVisible(primary && !alt)
      state.setProjectNumbersVisible(alt && !primary)
    }
    const clear = (): void => useShortcutHintStore.getState().clear()
    window.addEventListener('keydown', update, true)
    window.addEventListener('keyup', update, true)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', update, true)
      window.removeEventListener('keyup', update, true)
      window.removeEventListener('blur', clear)
      clear()
    }
  }, [])
  return null
}

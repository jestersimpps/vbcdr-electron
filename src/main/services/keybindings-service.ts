import Store from 'electron-store'
import {
  applyKeybindingOverride,
  sanitizeKeybindingOverrides,
  type KeybindingOverrides
} from '@main/models/keybindings'

const store = new Store<{ keybindings: KeybindingOverrides }>({
  defaults: { keybindings: {} }
})

export function getKeybindingOverrides(): KeybindingOverrides {
  return sanitizeKeybindingOverrides(store.get('keybindings'))
}

export function setKeybindingOverride(id: string, accelerator: string | null): KeybindingOverrides {
  const next = applyKeybindingOverride(getKeybindingOverrides(), id, accelerator)
  store.set('keybindings', next)
  return next
}

export function resetKeybindingOverrides(): KeybindingOverrides {
  store.set('keybindings', {})
  return {}
}

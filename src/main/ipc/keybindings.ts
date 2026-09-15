import { safeHandle } from '@main/ipc/safe-handle'
import {
  getKeybindingOverrides,
  resetKeybindingOverrides,
  setKeybindingOverride
} from '@main/services/keybindings-service'

export function registerKeybindingHandlers(onChanged: () => void): void {
  safeHandle('keybindings:get', () => getKeybindingOverrides())
  safeHandle('keybindings:set', (_event, id: string, accelerator: string | null) => {
    const overrides = setKeybindingOverride(id, accelerator)
    onChanged()
    return overrides
  })
  safeHandle('keybindings:reset', () => {
    const overrides = resetKeybindingOverrides()
    onChanged()
    return overrides
  })
}

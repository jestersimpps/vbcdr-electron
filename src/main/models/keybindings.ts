export type KeybindingCategory = 'General' | 'File' | 'View' | 'Terminal'

export interface KeybindingDefinition {
  id: string
  label: string
  category: KeybindingCategory
  defaultAccelerator: string
}

export type KeybindingOverrides = Record<string, string>

const RESERVED_ACCELERATORS: Readonly<Record<string, string>> = {
  'cmdorctrl+f': 'Find in the active editor or terminal',
  'cmdorctrl+enter': 'Submit the active form',
  'cmdorctrl+z': 'Undo',
  'cmdorctrl+shift+z': 'Redo',
  'cmdorctrl+x': 'Cut',
  'cmdorctrl+c': 'Copy',
  'cmdorctrl+v': 'Paste',
  'cmdorctrl+a': 'Select all',
  'cmdorctrl+q': 'Quit the application'
}

export function reservedAcceleratorReason(accelerator: string): string | null {
  if (/^CmdOrCtrl\+[1-9]$/.test(accelerator)) return 'Switch LLM tabs'
  if (/^Alt\+[1-9]$/.test(accelerator)) return 'Switch projects'
  return RESERVED_ACCELERATORS[accelerator.toLowerCase()] ?? null
}

export const KEYBINDING_DEFINITIONS: readonly KeybindingDefinition[] = [
  { id: 'settings', label: 'Open settings', category: 'General', defaultAccelerator: 'CmdOrCtrl+,' },
  { id: 'open-palette', label: 'Command palette', category: 'General', defaultAccelerator: 'CmdOrCtrl+K' },
  { id: 'new-project', label: 'New project', category: 'File', defaultAccelerator: 'CmdOrCtrl+N' },
  { id: 'close-project', label: 'Close project', category: 'File', defaultAccelerator: 'CmdOrCtrl+W' },
  { id: 'open-palette-files', label: 'Open file', category: 'File', defaultAccelerator: 'CmdOrCtrl+P' },
  { id: 'global-search', label: 'Search in files', category: 'File', defaultAccelerator: 'CmdOrCtrl+Shift+F' },
  { id: 'save-file', label: 'Save file', category: 'File', defaultAccelerator: 'CmdOrCtrl+S' },
  { id: 'close-file-tab', label: 'Close file', category: 'File', defaultAccelerator: 'CmdOrCtrl+Alt+W' },
  { id: 'center-tab-editor', label: 'Show editor', category: 'View', defaultAccelerator: 'CmdOrCtrl+Alt+1' },
  { id: 'center-tab-claude', label: 'Show Claude config', category: 'View', defaultAccelerator: 'CmdOrCtrl+Alt+2' },
  { id: 'center-tab-skills', label: 'Show skills', category: 'View', defaultAccelerator: 'CmdOrCtrl+Alt+3' },
  { id: 'center-tab-terminals', label: 'Show terminals', category: 'View', defaultAccelerator: 'CmdOrCtrl+Alt+4' },
  { id: 'toggle-variant', label: 'Toggle light/dark', category: 'View', defaultAccelerator: 'CmdOrCtrl+Alt+L' },
  { id: 'reload', label: 'Reload', category: 'View', defaultAccelerator: 'CmdOrCtrl+R' },
  { id: 'force-reload', label: 'Force reload', category: 'View', defaultAccelerator: 'CmdOrCtrl+Shift+R' },
  { id: 'actual-size', label: 'Actual size', category: 'View', defaultAccelerator: 'CmdOrCtrl+0' },
  { id: 'zoom-in', label: 'Zoom in', category: 'View', defaultAccelerator: 'CmdOrCtrl+=' },
  { id: 'zoom-out', label: 'Zoom out', category: 'View', defaultAccelerator: 'CmdOrCtrl+-' },
  { id: 'terminal-tab-next', label: 'Next terminal tab', category: 'Terminal', defaultAccelerator: 'CmdOrCtrl+Shift+]' },
  { id: 'terminal-tab-prev', label: 'Previous terminal tab', category: 'Terminal', defaultAccelerator: 'CmdOrCtrl+Shift+[' }
]

const DEFINITION_IDS = new Set(KEYBINDING_DEFINITIONS.map((definition) => definition.id))

export function sanitizeKeybindingOverrides(value: unknown): KeybindingOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, accelerator]) => DEFINITION_IDS.has(id) && typeof accelerator === 'string'
    ).map(([id, accelerator]) => [
      id,
      reservedAcceleratorReason(accelerator as string) ? '' : accelerator
    ])
  )
}

export function effectiveAccelerator(
  id: string,
  overrides: KeybindingOverrides
): string | undefined {
  const definition = KEYBINDING_DEFINITIONS.find((item) => item.id === id)
  if (!definition) return undefined
  const accelerator = Object.prototype.hasOwnProperty.call(overrides, id)
    ? overrides[id]
    : definition.defaultAccelerator
  return accelerator || undefined
}

export function isValidAccelerator(accelerator: string): boolean {
  if (accelerator === '') return true
  const parts = accelerator.split('+')
  const key = parts.pop()
  const modifiers = new Set(['CmdOrCtrl', 'Command', 'Control', 'Super', 'Alt', 'Shift'])
  const validKey = !!key && (/^[A-Z0-9]$/.test(key) || /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key) ||
    ['Up', 'Down', 'Left', 'Right', 'Space', 'Enter', 'Tab', '=', '-', ',', '.', '/', ';', "'", '[', ']', '\\', '`'].includes(key))
  if (!validKey || parts.some((part) => !modifiers.has(part)) || new Set(parts).size !== parts.length) return false
  return parts.length > 0 || /^F\d+$/.test(key)
}

export function applyKeybindingOverride(
  current: KeybindingOverrides,
  id: string,
  accelerator: string | null
): KeybindingOverrides {
  const definition = KEYBINDING_DEFINITIONS.find((item) => item.id === id)
  if (!definition) throw new Error('Unknown keybinding')
  if (accelerator !== null && !isValidAccelerator(accelerator)) {
    throw new Error('Invalid keyboard accelerator')
  }
  if (accelerator && reservedAcceleratorReason(accelerator)) {
    throw new Error('Keyboard accelerator is reserved')
  }

  const next = sanitizeKeybindingOverrides(current)
  if (accelerator === null) delete next[id]
  else next[id] = accelerator

  const assigned = effectiveAccelerator(id, next)
  if (assigned) {
    for (const item of KEYBINDING_DEFINITIONS) {
      if (item.id !== id && effectiveAccelerator(item.id, next)?.toLowerCase() === assigned.toLowerCase()) {
        next[item.id] = ''
      }
    }
  }
  return next
}

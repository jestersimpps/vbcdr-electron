export interface KeyboardShortcutEvent {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const CODE_KEYS: Record<string, string> = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Equal: '=', Minus: '-', Comma: ',', Period: '.', Slash: '/', Semicolon: ';',
  Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`',
  Space: 'Space', Enter: 'Enter', Tab: 'Tab'
}

function shortcutKey(event: KeyboardShortcutEvent): string | null {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3)
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5)
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.key)) return event.key
  return CODE_KEYS[event.code] ?? null
}

export function acceleratorFromKeyboardEvent(
  event: KeyboardShortcutEvent,
  isMac: boolean
): string | null {
  const key = shortcutKey(event)
  if (!key) return null
  const hasNonShiftModifier = event.metaKey || event.ctrlKey || event.altKey
  if (!hasNonShiftModifier && !/^F\d+$/.test(key)) return null

  const modifiers: string[] = []
  if ((isMac && event.metaKey) || (!isMac && event.ctrlKey)) modifiers.push('CmdOrCtrl')
  if (isMac && event.ctrlKey) modifiers.push('Control')
  if (!isMac && event.metaKey) modifiers.push('Super')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  return [...modifiers, key].join('+')
}

export function formatAccelerator(accelerator: string | undefined, isMac: boolean): string {
  if (!accelerator) return 'Unassigned'
  return accelerator.split('+').map((part) => {
    if (part === 'CmdOrCtrl') return isMac ? '⌘' : 'Ctrl'
    if (part === 'Command') return '⌘'
    if (part === 'Control') return isMac ? '⌃' : 'Ctrl'
    if (part === 'Alt') return isMac ? '⌥' : 'Alt'
    if (part === 'Shift') return isMac ? '⇧' : 'Shift'
    if (part === 'Super') return 'Super'
    if (part === 'Up') return '↑'
    if (part === 'Down') return '↓'
    if (part === 'Left') return '←'
    if (part === 'Right') return '→'
    return part
  }).join(isMac ? '' : '+')
}

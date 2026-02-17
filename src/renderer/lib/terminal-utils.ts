import { getTerminalInstance } from '@/components/terminal/TerminalInstance'

export function sendToTerminal(tabId: string, text: string): void {
  const entry = getTerminalInstance(tabId)
  if (!entry) return
  entry.terminal.paste(text)
  setTimeout(() => {
    const textarea = entry.terminal.textarea
    if (!textarea) return
    textarea.focus()
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
  }, 500)
}

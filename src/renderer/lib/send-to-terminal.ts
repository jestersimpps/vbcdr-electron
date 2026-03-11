import { getTerminalInstance } from '@/components/terminal/TerminalInstance'

export function sendToTerminal(tabId: string, text: string): void {
  const entry = getTerminalInstance(tabId)
  if (!entry) return
  entry.terminal.paste(text)
  setTimeout(() => {
    window.api.terminal.write(tabId, '\r')
  }, 100)
}

import { getTerminalInstance } from '@/components/terminal/TerminalInstance'
import { useTerminalStore } from '@/stores/terminal-store'

const SUBMIT_DELAY_MS = 100
const SUBMIT_RETRY_MS = 4000
const SUBMIT_RETRIES = 5

export function sendToTerminalViaPty(tabId: string, text: string): void {
  const entry = getTerminalInstance(tabId)
  if (!entry) return
  entry.terminal.paste(text)
  setTimeout(() => {
    window.api.terminal.write(tabId, '\r')
    retrySubmit(tabId, Date.now(), SUBMIT_RETRIES)
  }, SUBMIT_DELAY_MS)
}

// A TUI that is still booting reads the paste and its CR as one burst and
// leaves the text sitting in its input box. A lone CR once it is up submits
// that text, and on an empty box it is a no-op. Stops as soon as the person
// types there themselves, so it never submits something they are composing.
function retrySubmit(tabId: string, sentAt: number, remaining: number): void {
  if (remaining === 0) return
  setTimeout(() => {
    const entry = getTerminalInstance(tabId)
    const { tabs, tabStatuses, promptDetectedTabIds } = useTerminalStore.getState()
    const tab = tabs.find((t) => t.id === tabId)
    if (!entry || !tab?.initialCommand) return
    if (tabStatuses[tabId] === 'busy' || promptDetectedTabIds[tabId] || entry.lastKeyAt > sentAt) return
    window.api.terminal.write(tabId, '\r')
    retrySubmit(tabId, sentAt, remaining - 1)
  }, SUBMIT_RETRY_MS)
}

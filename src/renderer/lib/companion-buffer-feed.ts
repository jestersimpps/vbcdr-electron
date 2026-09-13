export type CompanionRowsListener = (tabId: string, rows: string[]) => void

const listeners = new Set<CompanionRowsListener>()

/**
 * The LLM buffer scan already reads settled rows for token counting. The
 * companion rides along on that same pass rather than running a second timer,
 * and this stays a plain emitter so TerminalInstance never imports the dock.
 */
export function emitCompanionRows(tabId: string, rows: string[]): void {
  if (listeners.size === 0) return
  for (const listener of listeners) listener(tabId, rows)
}

export function onCompanionRows(listener: CompanionRowsListener): () => void {
  listeners.add(listener)
  return (): void => {
    listeners.delete(listener)
  }
}

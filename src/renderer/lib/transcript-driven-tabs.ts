const transcriptDrivenTabs = new Set<string>()

export function markTranscriptDriven(tabId: string): void {
  transcriptDrivenTabs.add(tabId)
}

export function unmarkTranscriptDriven(tabId: string): void {
  transcriptDrivenTabs.delete(tabId)
}

export function isTranscriptDriven(tabId: string): boolean {
  return transcriptDrivenTabs.has(tabId)
}

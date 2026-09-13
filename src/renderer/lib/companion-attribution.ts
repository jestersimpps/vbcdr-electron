import type { CompanionLine } from '@/config/companion-trigger-registry'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore, GLOBAL_TERMINAL_OWNER } from '@/stores/terminal-store'

/**
 * How long one project may keep talking before she names it again. A run of
 * lines from the same project reads as one voice, but after a gap you have
 * lost the thread and the name is worth repeating.
 */
export const RENAME_AFTER_QUIET_MS = 45_000

const SLOT = /\{project\}/g

/**
 * Picks which of the two authored sentences to speak. The named one carries a
 * {project} slot placed where the sentence wants it, so this fills the slot
 * rather than gluing a prefix on the front.
 */
export function renderLine(line: CompanionLine, project: string | null): string {
  const name = project?.trim()
  if (!name) return line.bare
  return line.named.replace(SLOT, name)
}

/**
 * Tracks who spoke last, so the project is named on a change of speaker or
 * after a quiet gap and left unsaid the rest of the time.
 */
export class ProjectVoice {
  private lastProject: string | null = null
  private lastSpokeAt = -Infinity

  constructor(private readonly now: () => number = Date.now) {}

  /** The project to render with, or null to use the bare sentence. */
  nameFor(project: string | null): string | null {
    const at = this.now()
    const quiet = at - this.lastSpokeAt >= RENAME_AFTER_QUIET_MS
    const changed = project !== this.lastProject

    this.lastProject = project
    this.lastSpokeAt = at

    if (!project) return null
    return changed || quiet ? project : null
  }

  reset(): void {
    this.lastProject = null
    this.lastSpokeAt = -Infinity
  }
}

/**
 * Which project produced the line. Resolved from the tab rather than from the
 * active project: a background tab finishing is exactly the case where the name
 * is worth saying, and attributing that to whatever you happen to be looking at
 * would be a lie.
 */
export function projectNameForTab(tabId: string | null): string | null {
  if (!tabId) return activeProjectName()

  const tab = useTerminalStore.getState().tabs.find((t) => t.id === tabId)
  if (!tab || tab.projectId === GLOBAL_TERMINAL_OWNER) return activeProjectName()

  const project = useProjectStore.getState().projects.find((p) => p.id === tab.projectId)
  return project?.name ?? null
}

/** A poke has no originating tab: the click means the project you are looking at. */
export function activeProjectName(): string | null {
  return useProjectStore.getState().activeProject()?.name ?? null
}

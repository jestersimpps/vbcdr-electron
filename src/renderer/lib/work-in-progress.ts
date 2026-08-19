import type { GitFileStatus, BranchDriftInfo } from '@/models/types'

export type WipLlmStatus = 'busy' | 'idle' | 'none'

export interface WipProjectInput {
  projectId: string
  projectName: string
  branch: string | null
  llmStatus: WipLlmStatus
  llmSessionCount: number
  status: Record<string, GitFileStatus> | undefined
  drift: BranchDriftInfo | undefined
  lastActivityMs: number
}

export interface WipProject {
  projectId: string
  projectName: string
  branch: string | null
  llmStatus: WipLlmStatus
  llmSessionCount: number
  changedFiles: number
  conflicts: number
  ahead: number
  behind: number
  lastActivityMs: number
  isClean: boolean
}

const LLM_RANK: Record<WipLlmStatus, number> = { busy: 0, idle: 1, none: 2 }

export function toWipProject(input: WipProjectInput): WipProject {
  const statuses = input.status ? Object.values(input.status) : []
  const changedFiles = statuses.length
  const conflicts = statuses.filter((s) => s === 'conflict').length
  const ahead = input.drift?.ahead ?? 0
  const behind = input.drift?.behind ?? 0

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    branch: input.branch,
    llmStatus: input.llmStatus,
    llmSessionCount: input.llmSessionCount,
    changedFiles,
    conflicts,
    ahead,
    behind,
    lastActivityMs: input.lastActivityMs,
    isClean: changedFiles === 0 && ahead === 0 && behind === 0
  }
}

export function rankWipProjects(projects: WipProject[]): WipProject[] {
  return [...projects].sort((a, b) => {
    const llm = LLM_RANK[a.llmStatus] - LLM_RANK[b.llmStatus]
    if (llm !== 0) return llm

    if (a.conflicts !== b.conflicts) return b.conflicts - a.conflicts

    const aDirty = a.changedFiles > 0 ? 1 : 0
    const bDirty = b.changedFiles > 0 ? 1 : 0
    if (aDirty !== bDirty) return bDirty - aDirty
    if (a.changedFiles !== b.changedFiles) return b.changedFiles - a.changedFiles

    const aDrift = a.ahead + a.behind
    const bDrift = b.ahead + b.behind
    if (aDrift !== bDrift) return bDrift - aDrift

    if (a.lastActivityMs !== b.lastActivityMs) return b.lastActivityMs - a.lastActivityMs
    return a.projectName.localeCompare(b.projectName, undefined, { sensitivity: 'base' })
  })
}

export function hasOpenWork(p: WipProject): boolean {
  return p.llmStatus !== 'none' || !p.isClean
}

const IGNORED_SEGMENTS = new Set(['src', 'app', 'lib', 'packages', 'apps'])

export function summarizeChangedAreas(
  status: Record<string, GitFileStatus> | undefined,
  cwd: string,
  limit: number = 3
): string[] {
  if (!status) return []
  const counts = new Map<string, number>()

  for (const absolutePath of Object.keys(status)) {
    const relative = absolutePath.startsWith(cwd)
      ? absolutePath.slice(cwd.length).replace(/^\//, '')
      : absolutePath
    const parts = relative.split('/').filter(Boolean)
    if (parts.length === 0) continue

    let area = ''
    for (const part of parts.slice(0, -1)) {
      if (IGNORED_SEGMENTS.has(part)) continue
      area = part
      break
    }
    if (!area) area = parts.length > 1 ? parts[parts.length - 2] : 'root'
    counts.set(area, (counts.get(area) ?? 0) + 1)
  }

  const areas: Array<{ area: string; count: number }> = []
  counts.forEach((count, area) => areas.push({ area, count }))
  areas.sort((a, b) => b.count - a.count || a.area.localeCompare(b.area))
  return areas.slice(0, limit).map((a) => a.area)
}

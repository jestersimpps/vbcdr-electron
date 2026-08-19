import { describe, it, expect, beforeEach } from 'vitest'
import { buildStateSnapshot } from './state-snapshot'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useDevTerminalStore } from '@/stores/dev-terminal-store'
import { useEditorStore } from '@/stores/editor-store'
import { useGitStore } from '@/stores/git-store'
import { useLayoutStore } from '@/stores/layout-store'

function line(snapshot: string, key: string): string | undefined {
  return snapshot.split('\n').find((l) => l.startsWith(`${key}: `))
}

beforeEach(() => {
  useProjectStore.setState({
    projects: [
      { id: 'p1', name: 'vibecoder', path: '/repo/vibecoder', lastOpened: 0 },
      { id: 'p2', name: 'petsitters', path: '/repo/petsitters', lastOpened: 0 }
    ],
    activeProjectId: 'p1',
    dashboardActive: false,
    statisticsActive: false,
    usageActive: false,
    settingsActive: false,
    claudePageActive: false,
    skillsPageActive: false,
    mcpPageActive: false,
    terminalsPageActive: false,
    devServersPageActive: false
  })
  useTerminalStore.setState({ tabs: [], activeTabPerProject: {} })
  useDevTerminalStore.setState({ tabs: [] })
  useEditorStore.setState({ statePerProject: {}, centerTabPerProject: {} })
  useGitStore.setState({ branchesPerProject: {} })
  useLayoutStore.setState({ llmProviderId: 'claude', gitCollapsedPerProject: {} })
})

describe('buildStateSnapshot', () => {
  it('marks the active project with an asterisk', () => {
    expect(line(buildStateSnapshot(), 'projects')).toBe('projects: vibecoder*, petsitters')
  })

  it('degrades to projects and page when nothing is active', () => {
    useProjectStore.setState({ activeProjectId: null, dashboardActive: true })
    const snapshot = buildStateSnapshot()
    expect(line(snapshot, 'page')).toBe('page: dashboard')
    expect(line(snapshot, 'tabs')).toBeUndefined()
  })

  it('numbers terminal tabs so ordinals are addressable, and labels the LLM tab', () => {
    useTerminalStore.setState({
      tabs: [
        { id: 't1', title: 'LLM', projectId: 'p1', cwd: '/repo', initialCommand: 'claude' },
        { id: 't2', title: 'Terminal 2', projectId: 'p1', cwd: '/repo' },
        { id: 'other', title: 'Terminal 1', projectId: 'p2', cwd: '/x' }
      ],
      activeTabPerProject: { p1: 't2' }
    })
    expect(line(buildStateSnapshot(), 'tabs')).toBe('tabs: 1=LLM(Claude Code), 2=Terminal 2*')
  })

  it('reports the current branch and other local branches', () => {
    useGitStore.setState({
      branchesPerProject: {
        p1: [
          { name: 'master', current: true, remote: false },
          { name: 'feature/voice', current: false, remote: false },
          { name: 'origin/master', current: false, remote: true }
        ]
      }
    })
    expect(line(buildStateSnapshot(), 'branch')).toBe('branch: master (feature/voice)')
  })

  it('marks the active open file', () => {
    useEditorStore.setState({
      statePerProject: {
        p1: {
          openFiles: [
            { path: '/repo/App.tsx', name: 'App.tsx', content: '' },
            { path: '/repo/x.ts', name: 'x.ts', content: '' }
          ],
          activeFilePath: '/repo/x.ts'
        }
      }
    })
    expect(line(buildStateSnapshot(), 'files')).toBe('files: App.tsx, x.ts*')
  })

  it('lists dev tabs separately from terminal tabs', () => {
    useDevTerminalStore.setState({
      tabs: [{ id: 'd1', title: 'Dev 1', projectId: 'p1', cwd: '/repo' }]
    })
    expect(line(buildStateSnapshot(), 'dev-tabs')).toBe('dev-tabs: Dev 1')
  })

  it('reports git panel visibility declaratively', () => {
    expect(line(buildStateSnapshot(), 'git-panel')).toBe('git-panel: visible')
    useLayoutStore.setState({ gitCollapsedPerProject: { p1: true } })
    expect(line(buildStateSnapshot(), 'git-panel')).toBe('git-panel: hidden')
  })

  it('names capability-disabled targets so the agent will not invent them', () => {
    useLayoutStore.setState({ llmProviderId: 'codex' })
    const unavailable = line(buildStateSnapshot(), 'unavailable')
    expect(unavailable).toContain('skills')
    expect(unavailable).toContain('mcp')
  })

  it('omits the unavailable line entirely for a fully capable provider', () => {
    useLayoutStore.setState({ llmProviderId: 'claude' })
    expect(line(buildStateSnapshot(), 'unavailable')).toBeUndefined()
  })

  it('stays within a small token budget', () => {
    useTerminalStore.setState({
      tabs: Array.from({ length: 6 }, (_, i) => ({
        id: `t${i}`,
        title: `Terminal ${i}`,
        projectId: 'p1',
        cwd: '/repo'
      })),
      activeTabPerProject: { p1: 't0' }
    })
    expect(buildStateSnapshot().length).toBeLessThan(2000)
  })
})

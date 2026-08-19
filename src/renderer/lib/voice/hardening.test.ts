import { describe, it, expect, beforeEach } from 'vitest'
import { ACTION_SPECS, dispatchAppAction } from '@/lib/app-actions'
import { parseAgentAction, isKnownAction } from '@/lib/voice/agent-protocol'
import { buildStateSnapshot } from '@/lib/voice/state-snapshot'
import { useLayoutStore } from '@/stores/layout-store'
import { useProjectStore } from '@/stores/project-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useEditorStore } from '@/stores/editor-store'

beforeEach(() => {
  useProjectStore.setState({
    projects: [{ id: 'p1', name: 'vibecoder', path: '/repo', lastOpened: 0 }],
    activeProjectId: 'p1',
    dashboardActive: false,
    statisticsActive: false,
    usageActive: false,
    settingsActive: false,
    claudePageActive: false,
    skillsPageActive: false,
    mcpPageActive: false,
    terminalsPageActive: false,
    devServersPageActive: false,
    voicePageActive: false
  })
  useTerminalStore.setState({ tabs: [], activeTabPerProject: {} })
  useEditorStore.setState({ statePerProject: {}, centerTabPerProject: {} })
  useLayoutStore.setState({ llmProviderId: 'claude', gitCollapsedPerProject: {} })
})

// T27 — the agent must never be able to execute something outside the allowlist,
// and must never be able to talk its way out of a destructive confirmation.
describe('T27 allowlist hardening', () => {
  it('drops a hallucinated action before it can reach a dispatcher', () => {
    for (const hostile of ['rm-rf', 'delete_everything', 'exec', 'eval', '../../etc/passwd']) {
      expect(isKnownAction(hostile)).toBe(false)
      expect(dispatchAppAction({ action: hostile })).toEqual({
        ok: false,
        reason: 'unknown-action'
      })
    }
  })

  it('ignores an agent-supplied needsConfirm:false on a destructive action', () => {
    const parsed = parseAgentAction('{"action":"git-commit","needsConfirm":false}')
    expect(parsed).toEqual({ action: 'git-commit' })
    // needsConfirm is not carried into the action at all — destructive is local.
    expect('needsConfirm' in (parsed as object)).toBe(false)
    expect(ACTION_SPECS['git-commit'].destructive).toBe(true)
  })

  it('keeps destructive classification local to ACTION_SPECS for every action', () => {
    for (const [name, spec] of Object.entries(ACTION_SPECS)) {
      expect(typeof spec.destructive, `${name}.destructive`).toBe('boolean')
    }
  })

  it('does not let a target smuggle in a second action', () => {
    const parsed = parseAgentAction('{"action":"set-theme","target":"dracula; git-commit"}')
    expect(parsed?.action).toBe('set-theme')
    expect(dispatchAppAction({ action: 'set-theme', target: 'dracula; git-commit' })).toEqual({
      ok: false,
      reason: 'unresolved'
    })
  })
})

// T28 — capability gating must hold regardless of which provider backs the voice agent.
describe('T28 capability gating', () => {
  it('rejects a capability-gated action when the workspace provider lacks it', () => {
    useLayoutStore.setState({ llmProviderId: 'codex' })
    expect(dispatchAppAction({ action: 'center-tab-skills' })).toEqual({
      ok: false,
      reason: 'capability-off'
    })
    expect(dispatchAppAction({ action: 'clear-context' })).toEqual({
      ok: false,
      reason: 'capability-off'
    })
  })

  it('allows the same actions for a fully capable provider', () => {
    useLayoutStore.setState({ llmProviderId: 'claude' })
    expect(dispatchAppAction({ action: 'center-tab-skills' }).ok).toBe(true)
  })

  it('omits capability-off targets from the snapshot the agent sees', () => {
    useLayoutStore.setState({ llmProviderId: 'codex' })
    const snapshot = buildStateSnapshot()
    const unavailable = snapshot.split('\n').find((l) => l.startsWith('unavailable: '))
    expect(unavailable).toBeDefined()
    expect(unavailable).toContain('skills')
    expect(unavailable).toContain('mcp')
    expect(unavailable).toContain('clear-context')
  })

  it('gates on the WORKSPACE provider, independent of the voice-agent provider', () => {
    // Voice agent runs Claude, workspace runs Codex: skills must still be blocked,
    // because the capability belongs to the workspace assistant, not the translator.
    useLayoutStore.setState({ llmProviderId: 'codex', voiceAgentProviderId: 'claude' })
    expect(dispatchAppAction({ action: 'center-tab-skills' })).toEqual({
      ok: false,
      reason: 'capability-off'
    })
  })
})

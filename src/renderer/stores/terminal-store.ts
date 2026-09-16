import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { TerminalTab, WorktreeInfo } from '@/models/types'
import { isSdlcTab, type TabProfileMeta } from '@/config/terminal-profiles'
import { LLM_PROVIDERS, type LlmProviderId } from '@/config/llm-provider-registry'
import { SDLC_STAGES, type SdlcStage } from '@/models/sdlc'
import { useLayoutStore } from '@/stores/layout-store'
import { useWorktreeStore } from '@/stores/worktree-store'
import { useSdlcStore } from '@/stores/sdlc-store'
import { disposeTerminal } from '@/components/terminal/TerminalInstance'

type TabStatus = 'idle' | 'busy'

const OUTPUT_BUFFER_SIZE = 10

export const GLOBAL_TERMINAL_OWNER = '__global__'
export const DEFAULT_LLM_TAB_TITLE = 'LLM'

function profileFields(profile: TabProfileMeta): Pick<TerminalTab, 'profileId' | 'providerId' | 'color'> {
  return { profileId: profile.profileId, providerId: profile.providerId, color: profile.color }
}

const PRODUCT_NAMES = new Set(
  Object.values(LLM_PROVIDERS)
    .flatMap((p) => [p.label, p.command])
    .map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
)

/**
 * A shell reasserts its own title when the agent process exits (`user@host:~/path`),
 * and that would overwrite the ticket's real title with a path.
 */
const SHELL_PROMPT_TITLE_RE = /^\S+@\S+:|^(?:~|\/)\S*$/

/** Claude Code prefixes its title with a spinner/status glyph that is not part of the name. */
const STATUS_GLYPH_PREFIX_RE = /^[✨✳✻-✿✴✵●○◐-◓·•∙✱✲✶-✽*+■-◿\s]+/

/** The agent's title arrives decorated with its live status glyph; only the text is the ticket's name. */
export function cleanAgentTitle(title: string): string {
  return title.replace(STATUS_GLYPH_PREFIX_RE, '').trim()
}

/** A CLI's startup title ("Claude Code") is not a summary of the work; only real summaries rename a ticket. */
function isDescriptiveTitle(title: string): boolean {
  const trimmed = cleanAgentTitle(title)
  if (!trimmed || trimmed === DEFAULT_LLM_TAB_TITLE) return false
  if (SHELL_PROMPT_TITLE_RE.test(trimmed)) return false
  return !PRODUCT_NAMES.has(trimmed.toLowerCase().replace(/[^a-z0-9]/g, ''))
}

function stageLabelFor(stage: SdlcStage): string {
  return SDLC_STAGES.find((s) => s.id === stage)?.label ?? stage
}

/**
 * Command and profile for a default LLM tab (auto-opened first tab, "Start
 * here" button). Colored when the default provider is a built-in profile.
 */
export function defaultLlmTab(): { command: string; profile?: TabProfileMeta } {
  const layout = useLayoutStore.getState()
  const profileId = layout.getDefaultProfileId()
  if (!profileId) return { command: layout.getLlmStartupCommand() }
  const profile = layout.getTerminalProfile(profileId)
  return {
    command: layout.getProfileStartupCommand(profileId),
    profile: {
      profileId: profile.id,
      providerId: profile.providerId,
      label: profile.label,
      color: profile.color
    }
  }
}

/** The command a restarted tab should run: its own profile's, else the default. */
export function startupCommandForTab(tab: TerminalTab): string {
  const layout = useLayoutStore.getState()
  const profileId = tab.profileId
  if (profileId && layout.getTerminalProfiles().some((p) => p.id === profileId)) {
    const cmd = layout.getProfileStartupCommand(profileId as TabProfileMeta['profileId'])
    if (cmd) return cmd
  }
  return tab.initialCommand ?? layout.getLlmStartupCommand()
}

/** The provider a tab behaves like: its own profile's, else the global default. */
export function providerIdForTab(tabId: string): LlmProviderId {
  const tab = useTerminalStore.getState().tabs.find((t) => t.id === tabId)
  return tab?.providerId ?? useLayoutStore.getState().llmProviderId
}

/** Profile metadata to carry over when a tab is replaced or restarted. */
export function tabProfileMeta(tab: TerminalTab): TabProfileMeta | undefined {
  if (!tab.profileId || !tab.providerId || !tab.color) return undefined
  return {
    profileId: tab.profileId as TabProfileMeta['profileId'],
    providerId: tab.providerId,
    label: tab.title,
    color: tab.color
  }
}

interface TerminalStore {
  tabs: TerminalTab[]
  activeTabPerProject: Record<string, string>
  tabStatuses: Record<string, TabStatus>
  outputBufferPerProject: Record<string, string[]>
  tokenUsagePerTab: Record<string, number>
  lastCommandPerTab: Record<string, string>
  lastActivityPerProject: Record<string, number>
  attentionProjectIds: Record<string, boolean>
  /** Tabs whose recent output matched an interactive-prompt pattern (trust dialog, permission menu, ...). Cleared on the next PTY write once the pattern no longer matches. */
  promptDetectedTabIds: Record<string, boolean>
  autoScrollPerTab: Record<string, boolean>
  focusedTabId: string | null
  createTab: (
    projectId: string,
    cwd: string,
    initialCommand?: string,
    worktree?: WorktreeInfo,
    profile?: TabProfileMeta
  ) => string
  closeTab: (tabId: string) => void
  replaceTab: (
    oldTabId: string,
    projectId: string,
    cwd: string,
    initialCommand?: string,
    profile?: TabProfileMeta
  ) => string
  setActiveTab: (projectId: string, tabId: string) => void
  setTabStatus: (tabId: string, status: TabStatus) => void
  setTabTitle: (tabId: string, title: string) => void
  setTabWorktree: (tabId: string, worktree: WorktreeInfo) => void
  reorderTabs: (projectId: string, fromIndex: number, toIndex: number) => void
  setOutput: (projectId: string, lines: string[]) => void
  setTokenUsage: (tabId: string, tokens: number) => void
  setLastCommand: (tabId: string, command: string) => void
  setFocusedTabId: (tabId: string | null) => void
  markProjectAttention: (projectId: string) => void
  clearProjectAttention: (projectId: string) => void
  setPromptDetected: (tabId: string, detected: boolean) => void
  setAutoScroll: (tabId: string, value: boolean) => void
  isAutoScroll: (tabId: string) => boolean
  initProject: (projectId: string, cwd: string) => Promise<void>
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  tabs: [],
  activeTabPerProject: {},
  tabStatuses: {},
  outputBufferPerProject: {},
  tokenUsagePerTab: {},
  lastCommandPerTab: {},
  lastActivityPerProject: {},
  attentionProjectIds: {},
  promptDetectedTabIds: {},
  autoScrollPerTab: {},
  focusedTabId: null,

  createTab: (
    projectId: string,
    cwd: string,
    initialCommand?: string,
    worktree?: WorktreeInfo,
    profile?: TabProfileMeta
  ) => {
    const tabId = uuid()
    const projectTabs = get().tabs.filter((t) => t.projectId === projectId)
    const tab: TerminalTab = {
      id: tabId,
      title: profile
        ? profile.label
        : initialCommand
          ? DEFAULT_LLM_TAB_TITLE
          : `Terminal ${projectTabs.length + 1}`,
      projectId,
      cwd,
      initialCommand,
      ...(worktree && { worktree }),
      ...(profile && profileFields(profile))
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: tabId }
    }))
    return tabId
  },

  closeTab: (tabId: string) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId)
      const tabs = state.tabs.filter((t) => t.id !== tabId)
      const activeTabPerProject = { ...state.activeTabPerProject }

      if (tab && activeTabPerProject[tab.projectId] === tabId) {
        const remaining = tabs.filter((t) => t.projectId === tab.projectId)
        activeTabPerProject[tab.projectId] = remaining[remaining.length - 1]?.id ?? ''
      }

      const tabStatuses = { ...state.tabStatuses }
      delete tabStatuses[tabId]

      const tokenUsagePerTab = { ...state.tokenUsagePerTab }
      delete tokenUsagePerTab[tabId]

      const lastCommandPerTab = { ...state.lastCommandPerTab }
      delete lastCommandPerTab[tabId]

      const autoScrollPerTab = { ...state.autoScrollPerTab }
      delete autoScrollPerTab[tabId]

      const promptDetectedTabIds = { ...state.promptDetectedTabIds }
      delete promptDetectedTabIds[tabId]

      const focusedTabId = state.focusedTabId === tabId ? null : state.focusedTabId

      return {
        tabs,
        activeTabPerProject,
        tabStatuses,
        tokenUsagePerTab,
        lastCommandPerTab,
        autoScrollPerTab,
        promptDetectedTabIds,
        focusedTabId
      }
    })
  },

  setAutoScroll: (tabId: string, value: boolean) => {
    set((state) => ({
      autoScrollPerTab: { ...state.autoScrollPerTab, [tabId]: value }
    }))
  },

  isAutoScroll: (tabId: string) => get().autoScrollPerTab[tabId] ?? true,

  replaceTab: (
    oldTabId: string,
    projectId: string,
    cwd: string,
    initialCommand?: string,
    profile?: TabProfileMeta
  ) => {
    const newTabId = uuid()
    const tab: TerminalTab = {
      id: newTabId,
      title: profile ? profile.label : initialCommand ? DEFAULT_LLM_TAB_TITLE : 'Terminal',
      projectId,
      cwd,
      initialCommand,
      ...(profile && profileFields(profile))
    }
    set((state) => ({
      tabs: [...state.tabs.filter((t) => t.id !== oldTabId), tab],
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: newTabId }
    }))
    return newTabId
  },

  setTabStatus: (tabId: string, status: TabStatus) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    set((state) => ({
      tabStatuses: { ...state.tabStatuses, [tabId]: status },
      ...(tab && { lastActivityPerProject: { ...state.lastActivityPerProject, [tab.projectId]: Date.now() } })
    }))
  },

  setTabTitle: (tabId: string, title: string) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    const ticket = tab && isSdlcTab(tab) && isDescriptiveTitle(title)
      ? useSdlcStore.getState().ticketForTab(tabId)
      : undefined
    // The agent's own title is the best ticket title we get; the tab keeps its stage prefix.
    const ticketTitle = ticket ? cleanAgentTitle(title) : title
    const tabTitle = ticket ? `${stageLabelFor(ticket.stage)} · ${title}` : title
    if (ticket) useSdlcStore.getState().patchTicket(ticket.id, { title: ticketTitle })
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, title: tabTitle } : t))
    }))
    const worktree = tab?.worktree
    if (worktree && title.trim() && title !== DEFAULT_LLM_TAB_TITLE) {
      void useWorktreeStore.getState().setLabel(worktree.id, title)
    }
  },

  setTabWorktree: (tabId: string, worktree: WorktreeInfo) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, worktree } : t))
    }))
  },

  setActiveTab: (projectId: string, tabId: string) => {
    set((state) => ({
      activeTabPerProject: { ...state.activeTabPerProject, [projectId]: tabId }
    }))
  },

  markProjectAttention: (projectId: string) => {
    set((state) => ({
      attentionProjectIds: { ...state.attentionProjectIds, [projectId]: true }
    }))
  },

  clearProjectAttention: (projectId: string) => {
    const next = { ...get().attentionProjectIds }
    if (!(projectId in next)) return
    delete next[projectId]
    set({ attentionProjectIds: next })
  },

  setPromptDetected: (tabId: string, detected: boolean) => {
    const current = !!get().promptDetectedTabIds[tabId]
    if (current === detected) return
    const next = { ...get().promptDetectedTabIds }
    if (detected) next[tabId] = true
    else delete next[tabId]
    set({ promptDetectedTabIds: next })
  },

  reorderTabs: (projectId: string, fromIndex: number, toIndex: number) => {
    set((state) => {
      if (fromIndex === toIndex) return state
      const projectTabs = state.tabs.filter((t) => t.projectId === projectId)
      if (fromIndex < 0 || fromIndex >= projectTabs.length) return state
      if (toIndex < 0 || toIndex >= projectTabs.length) return state
      const reordered = [...projectTabs]
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      const others = state.tabs.filter((t) => t.projectId !== projectId)
      return { tabs: [...others, ...reordered] }
    })
  },

  setOutput: (projectId: string, lines: string[]) => {
    set((state) => ({
      outputBufferPerProject: {
        ...state.outputBufferPerProject,
        [projectId]: lines.slice(-OUTPUT_BUFFER_SIZE)
      },
      lastActivityPerProject: { ...state.lastActivityPerProject, [projectId]: Date.now() }
    }))
  },

  setTokenUsage: (tabId: string, tokens: number) => {
    set((state) => ({
      tokenUsagePerTab: { ...state.tokenUsagePerTab, [tabId]: tokens }
    }))
  },

  setLastCommand: (tabId: string, command: string) => {
    set((state) => ({
      lastCommandPerTab: { ...state.lastCommandPerTab, [tabId]: command }
    }))
  },

  setFocusedTabId: (tabId: string | null) => {
    set({ focusedTabId: tabId })
  },

  initProject: async (projectId: string, cwd: string) => {
    const existing = get().tabs.filter((t) => t.projectId === projectId)
    if (existing.length > 0) {
      const liveness = await Promise.all(existing.map((t) => window.api.terminal.has(t.id)))
      const deadIds = existing.filter((_, i) => !liveness[i]).map((t) => t.id)
      const liveCount = existing.length - deadIds.length
      if (deadIds.length > 0) {
        set((state) => {
          const tabs = state.tabs.filter((t) => !deadIds.includes(t.id))
          const activeTabPerProject = { ...state.activeTabPerProject }
          if (deadIds.includes(activeTabPerProject[projectId])) {
            const remainingForProject = tabs.filter((t) => t.projectId === projectId)
            if (remainingForProject.length > 0) {
              activeTabPerProject[projectId] = remainingForProject[remainingForProject.length - 1].id
            } else {
              delete activeTabPerProject[projectId]
            }
          }
          const tabStatuses = { ...state.tabStatuses }
          const tokenUsagePerTab = { ...state.tokenUsagePerTab }
          for (const id of deadIds) {
            delete tabStatuses[id]
            delete tokenUsagePerTab[id]
          }
          // Dropping the tab from the store is not enough: TerminalInstance keeps
          // every xterm in a module-scope map that nothing reconciles against this
          // list, so a pruned tab would leak its terminal, buffer and timers.
          for (const id of deadIds) disposeTerminal(id)
          return { tabs, activeTabPerProject, tabStatuses, tokenUsagePerTab }
        })
      }
      if (liveCount > 0) return
    }
    const { command, profile } = defaultLlmTab()
    get().createTab(projectId, cwd, command, undefined, profile)
  }
}))

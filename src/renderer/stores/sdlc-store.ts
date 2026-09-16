import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  EMPTY_ARTIFACTS,
  nextStage,
  previousStage,
  type ModelProviderId,
  type NewSdlcTicketInput,
  type SdlcComment,
  type SdlcStage,
  type SdlcTicket,
  type StageModelAssignment
} from '@/models/sdlc'

function makeComment(text: string, sentBack: boolean): SdlcComment {
  const at = Date.now()
  return { id: `c-${at}-${Math.random().toString(36).slice(2, 8)}`, author: 'you', text, at, sentBack }
}

interface SdlcStore {
  tickets: SdlcTicket[]
  collapsedProjectIds: Record<string, boolean>
  selectedTicketId: string | null
  createTicket: (input: NewSdlcTicketInput) => SdlcTicket
  moveTicket: (id: string, stage: SdlcStage) => void
  advanceTicket: (id: string) => void
  sendTicketBack: (id: string, reason: string) => void
  addComment: (id: string, text: string) => void
  stageModels: Partial<Record<SdlcStage, StageModelAssignment>>
  setStageProvider: (stage: SdlcStage, provider: ModelProviderId) => void
  setStageModel: (stage: SdlcStage, model: string | null) => void
  setStageAssignment: (stage: SdlcStage, provider: ModelProviderId, model: string | null) => void
  updateTicket: (id: string, patch: Pick<SdlcTicket, 'description' | 'attachments'>) => void
  patchTicket: (id: string, patch: Partial<Omit<SdlcTicket, 'id' | 'projectId'>>) => void
  deleteTicket: (id: string) => void
  selectTicket: (id: string | null) => void
  toggleProjectCollapsed: (projectId: string) => void
  removeProjectState: (projectId: string) => void
  pruneOrphans: (keepProjectIds: string[]) => void
  ticketsFor: (projectId: string, stage: SdlcStage) => SdlcTicket[]
  ticketForTab: (tabId: string) => SdlcTicket | undefined
  selectedTicket: () => SdlcTicket | undefined
}

export function titleFromDescription(description: string): string {
  const firstLine = description.trim().split('\n')[0]?.trim() ?? ''
  if (firstLine.length <= 72) return firstLine
  return `${firstLine.slice(0, 69).trimEnd()}…`
}

export function branchNameFrom(description: string): string {
  const slug = titleFromDescription(description)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return `llm/${slug || 'untitled'}`
}

/** Image data URLs are dropped on persist: a few screenshots would blow the localStorage quota. */
function stripAttachmentData(ticket: SdlcTicket): SdlcTicket {
  return { ...ticket, attachments: ticket.attachments.map((a) => ({ ...a, dataUrl: null })) }
}

export const useSdlcStore = create<SdlcStore>()(
  persist(
    (set, get) => ({
      tickets: [],
      collapsedProjectIds: {},
      selectedTicketId: null,
      stageModels: {},

      createTicket: (input: NewSdlcTicketInput) => {
        const description = input.description.trim()
        const timestamp = Date.now()
        const ticket: SdlcTicket = {
          id: `t-${timestamp}`,
          projectId: input.projectId,
          title: titleFromDescription(description),
          description,
          stage: 'backlog',
          status: 'idle',
          branch: branchNameFrom(description),
          worktreePath: '—',
          worktreeId: null,
          tabId: null,
          agent: 'claude',
          createdAt: timestamp,
          updatedAt: timestamp,
          filesChanged: 0,
          linesAdded: 0,
          linesRemoved: 0,
          checks: [],
          attachments: input.attachments,
          comments: [],
          artifacts: EMPTY_ARTIFACTS,
          prUrl: null,
          blockedReason: null,
          autoAdvance: input.autoAdvance ?? false
        }
        set((state) => ({ tickets: [...state.tickets, ticket] }))
        return ticket
      },

      moveTicket: (id: string, stage: SdlcStage) => {
        set((state) => ({
          tickets: state.tickets.map((t) =>
            t.id === id ? { ...t, stage, updatedAt: Date.now() } : t
          )
        }))
      },

      advanceTicket: (id: string) => {
        set((state) => ({
          tickets: state.tickets.map((t) => {
            if (t.id !== id) return t
            const stage = nextStage(t.stage)
            if (!stage) return t
            return {
              ...t,
              stage,
              status: 'idle',
              blockedReason: null,
              updatedAt: Date.now()
            }
          })
        }))
      },

      sendTicketBack: (id: string, reason: string) => {
        set((state) => ({
          tickets: state.tickets.map((t) => {
            if (t.id !== id) return t
            const stage = previousStage(t.stage)
            if (!stage) return t
            const text = reason.trim()
            return {
              ...t,
              stage,
              status: 'blocked',
              blockedReason: text || 'Sent back for changes',
              comments: text ? [...t.comments, makeComment(text, true)] : t.comments,
              updatedAt: Date.now()
            }
          })
        }))
      },

      /**
       * Switching provider clears the model: an Anthropic model id is not a valid
       * selection under OpenAI, so carrying it over would leave the pair incoherent.
       */
      setStageProvider: (stage: SdlcStage, provider: ModelProviderId) => {
        set((state) => {
          if (state.stageModels[stage]?.provider === provider) return state
          return { stageModels: { ...state.stageModels, [stage]: { provider, model: null } } }
        })
      },

      setStageModel: (stage: SdlcStage, model: string | null) => {
        set((state) => {
          const current = state.stageModels[stage]
          if (!current) return state
          if (current.model === model) return state
          return { stageModels: { ...state.stageModels, [stage]: { ...current, model } } }
        })
      },

      setStageAssignment: (stage: SdlcStage, provider: ModelProviderId, model: string | null) => {
        set((state) => {
          const current = state.stageModels[stage]
          if (current?.provider === provider && current.model === model) return state
          return { stageModels: { ...state.stageModels, [stage]: { provider, model } } }
        })
      },

      addComment: (id: string, text: string) => {
        const trimmed = text.trim()
        if (!trimmed) return
        set((state) => ({
          tickets: state.tickets.map((t) =>
            t.id === id
              ? { ...t, comments: [...t.comments, makeComment(trimmed, false)], updatedAt: Date.now() }
              : t
          )
        }))
      },

      updateTicket: (id: string, patch: Pick<SdlcTicket, 'description' | 'attachments'>) => {
        const description = patch.description.trim()
        set((state) => ({
          tickets: state.tickets.map((t) =>
            t.id === id
              ? {
                  ...t,
                  description,
                  attachments: patch.attachments,
                  title: titleFromDescription(description),
                  branch: t.stage === 'backlog' && !t.worktreeId ? branchNameFrom(description) : t.branch,
                  updatedAt: Date.now()
                }
              : t
          )
        }))
      },

      patchTicket: (id: string, patch: Partial<Omit<SdlcTicket, 'id' | 'projectId'>>) => {
        set((state) => ({
          tickets: state.tickets.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t
          )
        }))
      },

      deleteTicket: (id: string) => {
        set((state) => ({
          tickets: state.tickets.filter((t) => t.id !== id),
          selectedTicketId: state.selectedTicketId === id ? null : state.selectedTicketId
        }))
      },

      selectTicket: (id: string | null) => {
        set({ selectedTicketId: id })
      },

      selectedTicket: () => {
        const { tickets, selectedTicketId } = get()
        return tickets.find((t) => t.id === selectedTicketId)
      },

      toggleProjectCollapsed: (projectId: string) => {
        set((state) => ({
          collapsedProjectIds: {
            ...state.collapsedProjectIds,
            [projectId]: !state.collapsedProjectIds[projectId]
          }
        }))
      },

      removeProjectState: (projectId: string) => {
        set((state) => {
          const collapsedProjectIds = { ...state.collapsedProjectIds }
          delete collapsedProjectIds[projectId]
          const tickets = state.tickets.filter((t) => t.projectId !== projectId)
          const selectedTicketId = tickets.some((t) => t.id === state.selectedTicketId)
            ? state.selectedTicketId
            : null
          return { tickets, collapsedProjectIds, selectedTicketId }
        })
      },

      pruneOrphans: (keepProjectIds: string[]) => {
        // An empty list never legitimately means "no projects" here — every
        // real caller passes the loaded project list, so an empty array is a
        // sign loadProjects() hasn't resolved yet (or raced). Pruning against
        // it would silently delete every ticket in the persisted store.
        if (keepProjectIds.length === 0) return
        const keep = new Set(keepProjectIds)
        set((state) => {
          const tickets = state.tickets.filter((t) => keep.has(t.projectId))
          if (tickets.length === state.tickets.length) return state
          return { tickets }
        })
      },

      ticketsFor: (projectId: string, stage: SdlcStage) =>
        get().tickets.filter((t) => t.projectId === projectId && t.stage === stage),

      ticketForTab: (tabId: string) => get().tickets.find((t) => t.tabId === tabId)
    }),
    {
      name: 'vbcdr-sdlc',
      partialize: (state) => ({
        tickets: state.tickets.map(stripAttachmentData),
        stageModels: state.stageModels,
        collapsedProjectIds: state.collapsedProjectIds
      })
    }
  )
)

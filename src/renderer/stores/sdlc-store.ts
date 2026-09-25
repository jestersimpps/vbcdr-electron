import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { flowColumns, projectFlow, ticketColumns, useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { nextColumn } from '@/models/sdlc-flow'
import { EMPTY_ARTIFACTS, type NewSdlcTicketInput, type SdlcStage, type SdlcTicket } from '@/models/sdlc'

interface SdlcStore {
  tickets: SdlcTicket[]
  createTicket: (input: NewSdlcTicketInput) => SdlcTicket
  moveTicket: (id: string, stage: SdlcStage) => void
  reassignStage: (from: SdlcStage, to: SdlcStage, matches: (ticket: SdlcTicket) => boolean) => void
  advanceTicket: (id: string) => void
  patchTicket: (id: string, patch: Partial<Omit<SdlcTicket, 'id' | 'projectId'>>) => void
  deleteTicket: (id: string) => void
  removeProjectState: (projectId: string) => void
  pruneOrphans: (keepProjectIds: string[]) => void
  ticketsFor: (projectId: string, stage: SdlcStage) => SdlcTicket[]
  ticketForTab: (tabId: string) => SdlcTicket | undefined
}

const TITLE_LIMIT = 72
const SUMMARY_LIMIT = 200

function clamp(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`
}

export function titleFromDescription(description: string): string {
  return clamp(description.trim().split('\n')[0]?.trim() ?? '', TITLE_LIMIT)
}

/**
 * The line under the title on a card: everything the title does not already
 * carry. A one-liner too long for the title is repeated here in full rather
 * than only as its cut-off start.
 */
export function summaryFromDescription(description: string): string {
  const [first = '', ...rest] = description.trim().split('\n')
  const body = rest.join(' ').replace(/\s+/g, ' ').trim()
  if (body) return clamp(body, SUMMARY_LIMIT)
  return first.trim().length > TITLE_LIMIT ? clamp(first.trim(), SUMMARY_LIMIT) : ''
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

interface LegacyArtifacts {
  plan?: string | null
  checkOutput?: string | null
  prSummary?: string | null
}

/** Outputs were three named fields while the flow was fixed; they are keyed by the column that wrote them now. */
export function upgradeLegacyArtifacts(ticket: SdlcTicket): SdlcTicket {
  const { plan, checkOutput, prSummary, ...artifacts } = ticket.artifacts as SdlcTicket['artifacts'] & LegacyArtifacts
  if (artifacts.outputs) return ticket
  const legacy: [string, string | null | undefined][] = [
    ['planning', plan],
    ['implementing', checkOutput],
    ['review', prSummary]
  ]
  const outputs = Object.fromEntries(legacy.filter((entry): entry is [string, string] => !!entry[1]))
  return { ...ticket, artifacts: { ...artifacts, outputs } }
}

export const useSdlcStore = create<SdlcStore>()(
  persist(
    (set, get) => ({
      tickets: [],

      createTicket: (input: NewSdlcTicketInput) => {
        const description = input.description.trim()
        const timestamp = Date.now()
        const flowId = input.flowId ?? projectFlow(useSdlcFlowStore.getState(), input.projectId).id
        const ticket: SdlcTicket = {
          id: `t-${timestamp}`,
          projectId: input.projectId,
          flowId,
          title: titleFromDescription(description),
          description,
          stage: flowColumns(flowId)[0].id,
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
          prState: 'none',
          blockedReason: null,
          doneActionAt: null,
          doneOutcome: null
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

      /** A deleted column's tickets land idle: whatever ran there says nothing about the column they arrive in. */
      reassignStage: (from: SdlcStage, to: SdlcStage, matches: (ticket: SdlcTicket) => boolean) => {
        set((state) => ({
          tickets: state.tickets.map((t) =>
            t.stage === from && matches(t) ? { ...t, stage: to, status: 'idle', blockedReason: null, updatedAt: Date.now() } : t
          )
        }))
      },

      advanceTicket: (id: string) => {
        set((state) => ({
          tickets: state.tickets.map((t) => {
            if (t.id !== id) return t
            const stage = nextColumn(ticketColumns(t), t.stage)?.id
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

      patchTicket: (id: string, patch: Partial<Omit<SdlcTicket, 'id' | 'projectId'>>) => {
        set((state) => ({
          tickets: state.tickets.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t
          )
        }))
      },

      deleteTicket: (id: string) => {
        set((state) => ({ tickets: state.tickets.filter((t) => t.id !== id) }))
      },

      removeProjectState: (projectId: string) => {
        set((state) => ({ tickets: state.tickets.filter((t) => t.projectId !== projectId) }))
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
      version: 1,
      migrate: (persisted: unknown) => {
        const state = (persisted ?? {}) as { tickets?: SdlcTicket[] }
        return { ...state, tickets: (state.tickets ?? []).map(upgradeLegacyArtifacts) }
      },
      partialize: (state) => ({ tickets: state.tickets.map(stripAttachmentData) })
    }
  )
)

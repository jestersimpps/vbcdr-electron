import { findColumn, type SdlcColumn } from '@/models/sdlc-flow'
import type { SdlcDoneOutcome, SdlcTicket } from '@/models/sdlc'
import type { CompanionAnnouncement, CompanionEmote } from '@/models/companion'

export type ProjectNameLookup = (projectId: string) => string | null

const OUTCOME_EMOTES: Record<SdlcDoneOutcome, CompanionEmote> = {
  pr: 'happy',
  merged: 'proud',
  branch: 'waiting',
  'no-pr': 'confused'
}

function ticketIn(ticket: SdlcTicket, project: string | null): string {
  return project ? `"${ticket.title}" in ${project}` : `"${ticket.title}"`
}

function columnLabel(columns: readonly SdlcColumn[], id: string): string {
  return findColumn(columns, id)?.label ?? id
}

function outcomeText(outcome: SdlcDoneOutcome, who: string, branch: string): string {
  switch (outcome) {
    case 'pr':
      return `${who} has a pull request open`
    case 'merged':
      return `${who} is merged`
    case 'branch':
      return `${who} was pushed to ${branch}, no pull request`
    case 'no-pr':
      return `no pull request for ${who}, the work stays on ${branch}`
  }
}

function moveAnnouncement(before: SdlcTicket, after: SdlcTicket, columns: readonly SdlcColumn[], who: string): CompanionAnnouncement {
  const to = columnLabel(columns, after.stage)
  if (before.stage === columns[0]?.id) return { emote: 'thinking', text: `starting the flow for ${who}, it moved to ${to}` }
  return { emote: 'running', text: `${who} moved from ${columnLabel(columns, before.stage)} to ${to}` }
}

/**
 * What changed on the board between two snapshots of the tickets, worded for
 * the companion. Only tickets present in both count: a new ticket landing in the
 * first column is not a move, and a hydrate from storage is not news.
 */
export function sdlcAnnouncements(
  previous: readonly SdlcTicket[],
  next: readonly SdlcTicket[],
  columns: readonly SdlcColumn[],
  projectName: ProjectNameLookup
): CompanionAnnouncement[] {
  const before = new Map(previous.map((t) => [t.id, t]))
  const out: CompanionAnnouncement[] = []
  for (const after of next) {
    const prior = before.get(after.id)
    if (!prior || prior === after) continue
    const who = ticketIn(after, projectName(after.projectId))
    if (prior.stage !== after.stage) out.push(moveAnnouncement(prior, after, columns, who))
    if (after.doneActionAt && after.doneActionAt !== prior.doneActionAt) {
      out.push({ emote: 'thinking', text: `running the ${columnLabel(columns, after.stage)} prompt for ${who}` })
    }
    if (after.doneOutcome && after.doneOutcome !== prior.doneOutcome) {
      out.push({ emote: OUTCOME_EMOTES[after.doneOutcome], text: outcomeText(after.doneOutcome, who, after.branch) })
    }
  }
  return out
}

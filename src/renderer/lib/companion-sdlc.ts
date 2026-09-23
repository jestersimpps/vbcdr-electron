import { findColumn, type SdlcColumn } from '@/models/sdlc-flow'
import type { SdlcDoneOutcome, SdlcDoneTrigger, SdlcTicket } from '@/models/sdlc'
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

function columnIndex(columns: readonly SdlcColumn[], id: string): number {
  return columns.findIndex((c) => c.id === id)
}

function outcomeText(outcome: SdlcDoneOutcome, who: string, branch: string): string {
  switch (outcome) {
    case 'pr':
      return `the pull request for ${who} is up, ready for your review`
    case 'merged':
      return `${who} is merged. Shipped!`
    case 'branch':
      return `${who} is pushed to ${branch}, no pull request this time`
    case 'no-pr':
      return `heads up, nothing was pushed for ${who}, it's still sitting on ${branch}`
  }
}

function doneActionText(trigger: SdlcDoneTrigger | null | undefined, who: string): string {
  if (trigger === 'timer') return `timer went off, running the final prompt for ${who}`
  return `${who} is done, now finalizing it`
}

function moveAnnouncement(before: SdlcTicket, after: SdlcTicket, columns: readonly SdlcColumn[], who: string): CompanionAnnouncement {
  const to = findColumn(columns, after.stage)
  const label = columnLabel(columns, after.stage)
  if (before.stage === columns[0]?.id) return { emote: 'thinking', text: `kicking off ${who}, ${label} has it now` }
  if (columnIndex(columns, after.stage) < columnIndex(columns, before.stage)) {
    return { emote: 'confused', text: `${who} went back to ${label} for another pass` }
  }
  if (to?.kind === 'terminal') return { emote: 'happy', text: `nice, ${who} made it all the way to ${label}!` }
  return { emote: 'running', text: `${who} is on to ${label} now` }
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
    // The one thing she must not sit on: a blocked ticket moves nowhere and
    // nothing else will announce it. The reason itself stays on the card — it
    // is a git command line as often as a sentence.
    if (after.blockedReason && after.blockedReason !== prior.blockedReason) {
      out.push({ emote: 'hurt', text: `heads up, ${who} is blocked and needs you` })
    }
    if (prior.stage !== after.stage) out.push(moveAnnouncement(prior, after, columns, who))
    if (after.doneActionAt && after.doneActionAt !== prior.doneActionAt) {
      out.push({ emote: 'thinking', text: doneActionText(after.doneActionBy, who) })
    }
    if (after.doneOutcome && after.doneOutcome !== prior.doneOutcome) {
      out.push({ emote: OUTCOME_EMOTES[after.doneOutcome], text: outcomeText(after.doneOutcome, who, after.branch) })
    }
  }
  return out
}

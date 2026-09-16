# Voice-first SDLC and local agent merge queue

Status: **draft for refinement**  
Last updated: 2026-09-16

## Purpose

Build an approval-gated SDLC flow that a user can operate primarily by voice:

1. The user says **“new ticket.”**
2. vbcdr acknowledges and captures a multi-utterance ticket description.
3. The user confirms the draft with a configured go phrase.
4. An agent refines it into a user story and acceptance criteria.
5. An agent researches the codebase and asks focused clarification questions.
6. After approval, an agent writes an implementation specification.
7. After another approval, an agent implements and verifies the change in an isolated worktree.
8. vbcdr presents the diff, checks, and suitable before/after evidence.
9. After approval, the agent creates a pull request and submits it to a merge queue running locally on the user's computer.
10. The local queue continually integrates against fresh `main`, uses relevant ticket intentions when resolving conflicts, runs combined verification, and merges successful pull requests.

This document is the design and delivery plan. It should be updated as decisions change and implementation lands.

## Guiding principles

1. **Voice is an interface, not the source of truth.** Every utterance becomes visible, editable state before it triggers expensive or destructive work.
2. **Human approval is explicit and contextual.** A go phrase only advances the ticket that is currently waiting at a defined gate.
3. **`origin/main` is authoritative for code.** Ticket branches never override `main` merely because they are newer.
4. **User stories are authoritative for intent.** The current story defines the requested change; other relevant stories provide constraints, dependencies, and superseding decisions.
5. **Every ticket owns an isolated worktree.** Agents do not implement tickets in the user's primary checkout.
6. **The queue tests the combined result.** Passing a PR in isolation is insufficient when earlier queued work changes its environment.
7. **Deterministic orchestration surrounds model reasoning.** State transitions, locks, SHA checks, permissions, and merge gates are code; agents are invoked for research, implementation, review, and semantic conflict resolution.
8. **Contradictory product intent is a human decision.** An agent may explain the conflict and propose options but must not silently choose which user story wins.
9. **No red merge.** The queue never merges while required verification is failing, missing, stale, or was run against a different integration state.
10. **Everything is resumable and auditable.** Restarting vbcdr or the computer must not lose ticket state, queue position, approvals, decisions, evidence, or the reason a ticket is blocked.

## Scope

### In scope

- Always-available microphone mode with local speech-to-text.
- Wake phrase and multi-utterance ticket capture.
- Spoken and visual acknowledgements, questions, and summaries.
- Refined user stories, acceptance criteria, constraints, and decisions as durable artifacts.
- Codebase research and clarification before specification.
- Approval gates before specification, implementation, PR creation, and exceptional conflict resolutions.
- Worktree-isolated planning, implementation, review, and verification.
- Diff, checks, and ticket-appropriate evidence for human review.
- PR creation through the user's existing GitHub CLI authentication.
- A persistent local merge queue per repository and target branch.
- Conflict handling grounded in fresh `main` plus relevant ticket intentions.
- Automatic handling of demonstrably mechanical conflicts.
- Agent-assisted proposals for semantic conflicts.

### Not automatically authorized

- Choosing between contradictory user stories.
- Merging with failing or missing required checks.
- Force-pushing over a head SHA that changed during a queue attempt.
- Deleting unmerged worktrees or branches without an explicit lifecycle rule.
- Bypassing repository protections or required reviews.
- Treating screenshots as proof for non-visual behavior.

## Existing foundation

The repository already contains much of the execution substrate:

- Local microphone capture, VAD, and Whisper transcription.
- A background voice-agent protocol and allowlisted application actions.
- Persistent SDLC tickets with Planning, Implementing, Review, and Done stages.
- Per-ticket branches and worktrees.
- Configurable stage prompts and model assignments.
- Agent handoff through terminal queues.
- A sentinel file used as the durable stage-completion signal.
- Ticket approval, refinement, rerun, resume, and send-back interactions.
- Git diff, drift, conflict, worktree, and PR-state support.
- A close-worktree workflow capable of instructing the terminal agent to commit, push, and open a PR.

The feature should extend these systems rather than introduce a parallel ticket runner.

Related plans:

- `docs/voice-control-plan.md`
- `docs/worktree-llm-tabs-plan.md`

## Product state machine

The existing coarse stages should evolve into durable phases with explicit wait states.

```text
idle
  -> capturing-ticket
  -> ticket-confirmation
  -> refining-story
  -> story-approval
  -> researching-codebase
  -> clarification
  -> spec-writing
  -> spec-approval
  -> implementing
  -> verifying
  -> change-approval
  -> creating-pr
  -> queued
  -> integrating
  -> merged
```

Every agent-running phase can additionally enter:

```text
blocked | failed | cancelled | paused
```

### Approval gates

| Gate | What the user receives | What a go phrase authorizes |
| --- | --- | --- |
| Ticket confirmation | Raw dictated draft | Refine the draft into a user story |
| Story approval | User story, criteria, constraints | Begin codebase research |
| Clarification complete | Answers plus research findings | Write the implementation specification |
| Spec approval | Spoken summary and full written spec | Begin implementation |
| Change approval | Diff, checks, risks, decisions, evidence | Commit/push/create PR and enqueue it |
| Semantic conflict approval | Resolution explanation, diff, affected stories, checks | Push the proposed resolution and continue the queue |

A rejection or refinement keeps the ticket at the same gate unless the user explicitly sends it back to an earlier phase.

## Voice interaction design

### Ticket capture

Expected dialogue:

```text
User:  “New ticket.”
Agent: “Okay, listening.”
User:  “Add keyboard navigation to the project switcher.”
User:  “It should wrap at the first and last project.”
Agent: “Is that all?”
User:  “Go.”
```

Requirements:

- “New ticket” only starts capture when no other ticket-capture session is active.
- Speech segments accumulate into one draft until the agent asks for confirmation.
- The visible transcript remains editable.
- “Add something,” “remove the last sentence,” “read it back,” and “cancel ticket” are first-class capture commands.
- Configured go phrases are normalized but only accepted while an approval gate is active.
- Short critical commands require sufficient transcription confidence or a confirmation fallback.
- The active project must be explicit in the capture UI and spoken acknowledgement.
- If more than one ticket is awaiting approval, a bare “go” applies only to the ticket currently in focus; otherwise the agent asks which ticket.

### Duplex and feedback safety

- Pause command recognition, or use a dedicated echo-suppression mode, while vbcdr speaks.
- Do not allow the agent's own TTS to satisfy a go phrase.
- Preserve the macOS microphone indicator semantics: muted means the media track is stopped.
- Surface microphone, transcription, voice-agent, and TTS failures separately.
- State clearly that audio transcription is local while the resulting text may be sent to the configured coding-agent provider.

### Spoken output

Spoken responses should be short. Full artifacts remain visible in the ticket detail.

- Acknowledgements: one sentence.
- Clarification questions: one question at a time unless the user requests a batch.
- Story summary: problem, user value, and number of acceptance criteria.
- Spec summary: approach, affected areas, principal risk, and verification strategy.
- Implementation summary: outcome, checks, and whether visual review is available.
- Queue notifications: only when attention is needed or a PR merges, according to notification settings.

## Durable ticket intent

Ticket descriptions and terminal transcripts are not sufficient inputs for later conflict resolution. Persist normalized intent as first-class data.

```ts
interface TicketIntent {
  userStory: string
  acceptanceCriteria: AcceptanceCriterion[]
  constraints: string[]
  decisions: TicketDecision[]
  dependencies: TicketId[]
  supersedes: TicketId[]
  affectedAreas: string[]
}

interface AcceptanceCriterion {
  id: string
  text: string
  verificationHint?: string
}

interface TicketDecision {
  id: string
  at: number
  summary: string
  rationale?: string
  source: 'user' | 'agent-proposal-approved'
}
```

Each stage also owns an immutable or versioned artifact:

- Raw voice transcript.
- Edited ticket draft.
- Refined story.
- Research report.
- Clarification questions and answers.
- Approved specification.
- Implementation report.
- Check results.
- Visual or behavioral evidence.
- Review report.
- PR metadata.
- Queue attempts and conflict-resolution records.

Changing an approved artifact creates a new version and invalidates downstream approvals that depend on it.

## Research and clarification

The research agent must inspect the live repository before asking implementation questions. It should separate:

- Facts found in code.
- Reasonable inferences.
- Unresolved product questions.
- Risks or constraints.
- Existing tests and patterns to reuse.
- Likely files and systems affected.

Questions should only be asked when the answer materially changes behavior, scope, architecture, or acceptance criteria. Questions answerable from the repository should not be sent to the user.

The research stage completes with structured output such as:

```ts
interface ResearchArtifact {
  findings: Finding[]
  relevantFiles: string[]
  existingPatterns: string[]
  risks: string[]
  questions: ClarificationQuestion[]
}
```

If there are no questions, the ticket may proceed directly to spec approval after presenting the research summary.

## Specification

The specification should contain:

1. Context and desired outcome.
2. Approved user story and acceptance criteria.
3. Relevant existing behavior.
4. Proposed behavior and non-goals.
5. Ordered implementation steps naming affected files or modules.
6. Data, API, migration, permission, and compatibility considerations.
7. Verification plan mapped to acceptance-criterion IDs.
8. Visual evidence recipe when the change affects UI.
9. Risks, rollback considerations, and unresolved assumptions.

Implementation starts only from an approved spec version.

## Implementation and verification

- Create or recover the ticket's isolated worktree.
- Record the base SHA used when implementation starts.
- Give the implementation agent the approved artifacts, not the entire raw conversation by default.
- Require scoped typechecks, lint, tests, builds, or equivalent repository checks.
- Capture the final head SHA and diff used for review.
- If implementation deviates materially from the approved spec, return to spec approval.
- Keep the implementation agent from pushing or creating the PR before change approval.

### Evidence selection

Evidence should match the change:

| Change type | Preferred evidence |
| --- | --- |
| Visual UI | Before/after screenshots at a defined route, state, viewport, and data fixture |
| Interaction | Screenshots plus an automated interaction test or short recording |
| API/backend | Request/response examples and automated tests |
| Performance | Reproducible before/after measurements |
| Refactor | Tests, typecheck, and focused diff explanation |
| Build/configuration | Build output and runtime smoke test |

Before/after screenshots are meaningful only when both use the same verification recipe. If a stable before state cannot be reproduced, label the artifact “after” rather than inventing a comparison.

## Local merge queue architecture

### Ownership

The queue runs on the user's computer as part of vbcdr or a supervised local worker. GitHub remains the PR and audit surface; GitHub's hosted merge queue is not required.

The orchestration layer should be deterministic. A coding agent is invoked only for diagnosis or semantic resolution.

```text
Queue controller
  -> repository lock
  -> fetch and SHA validation
  -> isolated integration worktree
  -> deterministic conflict classification
  -> optional conflict-resolution agent
  -> repository verification commands
  -> approval gate when required
  -> GitHub PR merge
```

### Queue identity

- One queue per repository and target branch.
- The initial target for this repository is `main` conceptually; where the repository still uses `master`, branch naming/migration must be decided before implementation.
- Queue entries reference immutable ticket ID, PR number, PR head SHA, approved spec version, and approved change-review version.
- A repository-level lease prevents two local queue workers from integrating simultaneously.
- The queue survives app restarts and machine reboots.

### Queue states

```text
queued
preparing
integrating
resolving-mechanical-conflict
resolving-semantic-conflict
running-checks
needs-approval
ready-to-merge
merging
merged
blocked
paused-offline
cancelled
```

Only `needs-approval` and `blocked` inherently require human attention.

### Integration baseline

Every attempt starts from a fresh fetch of `origin/main`.

For queue entry `N`, the tested state is:

```text
latest origin/main
  + successfully validated entries 1..N-1 in queue order
  + candidate entry N
```

This is the **projected main**. It preserves `main` as the code authority while detecting conflicts between PRs that have not reached remote `main` yet.

After any entry merges or remote `main` moves, later entries are rebuilt and revalidated from the new `origin/main`. A prior green result is never reused against a different integration SHA.

### Queue attempt algorithm

1. Acquire the repository/target-branch lease.
2. Confirm network, Git credentials, GitHub authentication, disk space, and required tools.
3. Fetch `origin/main` and the candidate PR head.
4. Record base SHA and candidate head SHA.
5. Confirm the candidate still corresponds to the approved review version.
6. Reset the dedicated integration worktree to the fresh base.
7. Reapply earlier validated queue entries in order when they are not yet present on remote `main`.
8. Attempt the candidate integration.
9. Classify conflicts and either resolve, invoke an agent, or block.
10. Run verification against the exact combined tree.
11. Re-read the remote base SHA and PR head SHA.
12. If either moved, discard the result and restart.
13. Present an approval gate when queue policy or semantic resolution requires one.
14. Merge through the GitHub PR using the configured merge strategy.
15. Fetch `main` and confirm the PR actually merged at the expected state.
16. Persist the attempt record, notify the user, and continue.

### Merge strategy

Default policy: merge fresh `main` into the PR branch when an update is necessary, then allow GitHub to perform the repository's configured PR merge method.

Reasons for preferring merge-update over rebase by default:

- No force-push.
- Review anchors and viewed-file state are less likely to be invalidated.
- Concurrent human pushes fail safely.
- Conflicts are resolved once rather than once per replayed commit.
- A final squash merge can still keep `main` linear when configured.

Rebase remains an explicit per-repository option.

## Conflict handling

### Sources of truth

Conflict resolution follows this precedence:

1. Fresh `origin/main` for current code and repository conventions.
2. The current ticket's approved user story, acceptance criteria, constraints, and decisions.
3. Relevant earlier queued or merged ticket intentions.
4. The approved implementation specs and diffs for those tickets.
5. Verification proving the combined behavior.

Other branches are evidence of intended changes, not a replacement source of truth for `main`.

### Relevant-ticket selection

Do not load every historical ticket. Build a focused resolution packet using:

- Same changed files or symbols.
- Same routes, schemas, settings, APIs, or UI surfaces.
- Explicit dependency or supersedes relationships.
- Earlier entries in the same projected-main batch.
- Failed tests connected to another ticket's acceptance criteria.
- Semantic search over normalized stories and decisions.

The packet contains:

- Fresh main/base SHA.
- Projected-main SHA.
- Candidate head SHA.
- Three-way conflict hunks.
- Current ticket intent and spec.
- Relevant ticket intents, specs, and diffs.
- Acceptance-criterion-to-test mapping.
- Repository conflict policy.

### Intent classification

The conflict agent classifies ticket relationships as:

| Relationship | Expected behavior |
| --- | --- |
| Compatible | Preserve both intentions |
| Dependent | Apply in dependency order and validate both |
| Superseding | Preserve the explicitly approved newer behavior and record what was replaced |
| Contradictory | Stop and ask the user to decide |
| Unrelated | Resolve from `main` plus the current ticket |

Recency alone does not imply supersession.

### Conflict classes

| Class | Default handling |
| --- | --- |
| Generated artifact | Keep appropriate source inputs, regenerate, verify no drift |
| Lockfile | Regenerate with the repository's declared package manager, verify install/build |
| Additive registry or independent entries | Preserve both, then verify ordering and uniqueness |
| Formatting-only | Apply repository formatter and verify semantic diff is unchanged |
| Handwritten semantic code | Agent proposes a resolution using the resolution packet |
| Contradictory product behavior | Block for user decision |
| Unknown | Block rather than guess |

Repository-specific conflict rules should be configurable and versioned.

### Resolution record

Every non-trivial automatic or agent-assisted resolution creates an auditable record:

```ts
interface ConflictResolutionRecord {
  attemptId: string
  files: string[]
  relevantTicketIds: string[]
  relationship: 'compatible' | 'dependent' | 'superseding' | 'contradictory' | 'unrelated'
  mainBehavior: string
  chosenBehavior: string
  rationale: string
  affectedCriteria: string[]
  verification: CheckResult[]
  approval?: ApprovalRecord
}
```

For semantic code, show the user:

- What conflicted technically.
- Which user stories were relevant.
- Whether their intentions were compatible.
- What behavior the agent chose.
- The exact resolution diff.
- Which acceptance criteria and tests passed.
- Any behavior it could not preserve.

## Persistence and recovery

Renderer local storage is insufficient for a background queue. Durable queue and attempt data should live in the main process, initially through `electron-store` or a small SQLite database if querying/versioning outgrows JSON storage.

Persist at minimum:

- Queue definitions and policies.
- Queue ordering.
- Entry status and immutable SHAs.
- Repository and worktree paths.
- Agent session identifiers where resumable.
- Artifact versions and approvals.
- Attempt logs and check results.
- Conflict-resolution records.
- Notification state.
- Lease owner and heartbeat, with stale-lease recovery.

On startup:

1. Reconcile persisted entries with Git, worktrees, and GitHub PR state.
2. Mark disappeared or externally merged PRs correctly.
3. Release stale local leases only after verifying no worker process is alive.
4. Resume safe deterministic steps.
5. Return agent reasoning steps to `blocked` or `needs-approval` unless the underlying agent session can be proven resumable.

## Security and control boundaries

- Voice actions remain allowlisted renderer actions.
- Destructive classification remains local; the voice model cannot mark its own action safe.
- Queue commands use argument arrays rather than interpolated shell strings.
- Repository paths, branch names, PR numbers, and SHAs are validated before execution.
- Agents receive least-privilege repository access and scoped instructions.
- Secrets remain in the user's existing credential stores and CLI authentication.
- Queue logs redact tokens, credentials, and sensitive environment values.
- Direct pushes to `main` are not part of the queue design.
- The user can pause a repository queue immediately without killing unrelated agent work.

## UI surfaces

### Ticket detail

- Current phase and status.
- Live transcript during intake.
- Versioned story, research, answers, spec, and implementation report.
- Approve, refine, send back, pause, cancel, and resume controls.
- Evidence viewer for diffs, checks, screenshots, recordings, and API examples.
- Spoken-summary replay.

### SDLC board

- Cards move from real system events, not manual dragging.
- “Needs you” is reserved for approval, blocked, and contradictory-intent states.
- Queue position and integration state appear on PR-stage cards.
- Project/repository lanes expose their queue, target branch, and concurrency limit.

### Merge queue panel

- Repository and target branch.
- Local worker health and last heartbeat.
- Current `main` SHA.
- Ordered entries with PR, ticket, head SHA, status, and elapsed time.
- Active integration/check output.
- Conflict and relevant-story summary.
- Pause, resume, reorder, remove, retry, and inspect controls with suitable confirmation.

## Delivery plan

Status values: `todo`, `wip`, `done`, `blocked`, `dropped`.

### Phase 0 — Decisions and schema

| ID | Task | Status | Verification |
| --- | --- | --- | --- |
| VSDLC-001 | Decide whether this repository migrates from `master` to `main`, or whether “main” means a configurable canonical branch | todo | Decision recorded and reflected in defaults/tests |
| VSDLC-002 | Define expanded phase/status types and valid transitions | todo | Transition-table tests reject invalid jumps |
| VSDLC-003 | Define versioned ticket intent, research, spec, evidence, approval, and queue schemas | todo | Persistence migration and round-trip tests |
| VSDLC-004 | Decide go phrases, ambiguity handling, and per-gate confirmation policy | todo | Phrase table and adversarial tests |
| VSDLC-005 | Define repository verification and conflict-policy configuration | todo | Config validation and safe defaults |

### Phase 1 — Voice ticket intake

| ID | Task | Status | Verification |
| --- | --- | --- | --- |
| VSDLC-101 | Add wake phrase and capture-session state machine | todo | Unit tests plus live microphone test |
| VSDLC-102 | Accumulate multiple utterances into one editable draft | todo | Pause/resume/edit/cancel tests |
| VSDLC-103 | Add contextual go-phrase resolver | todo | Cannot advance without an active matching gate |
| VSDLC-104 | Add spoken acknowledgement and read-back without self-trigger | todo | Duplex live test with speakers and headphones |
| VSDLC-105 | Create backlog ticket from the confirmed draft | todo | Reload preserves ticket and raw transcript |

### Phase 2 — Story, research, and clarification

| ID | Task | Status | Verification |
| --- | --- | --- | --- |
| VSDLC-201 | Refine raw draft into structured story and criteria | todo | Schema validation and editable artifact UI |
| VSDLC-202 | Add story approval/refinement gate | todo | Approval tied to artifact version |
| VSDLC-203 | Split repository research from specification | todo | Research makes no code changes |
| VSDLC-204 | Persist structured findings and focused questions | todo | Questions reference material uncertainties |
| VSDLC-205 | Capture answers and update ticket intent | todo | Answer history survives reload |

### Phase 3 — Specification and implementation

| ID | Task | Status | Verification |
| --- | --- | --- | --- |
| VSDLC-301 | Generate versioned spec from approved intent/research | todo | Required sections and criteria mapping validated |
| VSDLC-302 | Add spoken spec summary and approval gate | todo | “Go” starts only the approved spec version |
| VSDLC-303 | Hand implementation to isolated ticket worktree | todo | Primary checkout remains untouched |
| VSDLC-304 | Capture implementation report and structured checks | todo | Check commands, exits, and tested SHA persisted |
| VSDLC-305 | Detect material spec deviation and return for approval | todo | Deliberate deviation fixture blocks progression |

### Phase 4 — Evidence and change approval

| ID | Task | Status | Verification |
| --- | --- | --- | --- |
| VSDLC-401 | Define per-ticket evidence recipe | todo | Recipe is explicit before capture starts |
| VSDLC-402 | Capture UI before/after evidence where applicable | todo | Same route/state/viewport/fixture metadata |
| VSDLC-403 | Support non-visual evidence types | todo | API, test, performance, and build fixtures |
| VSDLC-404 | Present diff, checks, risks, decisions, and evidence together | todo | Review references immutable head SHA |
| VSDLC-405 | Add change approval/refinement gate | todo | Approval invalidates if head SHA changes |

### Phase 5 — PR creation

| ID | Task | Status | Verification |
| --- | --- | --- | --- |
| VSDLC-501 | Create commit/push/PR workflow from approved change | todo | PR head equals approved head and target is correct |
| VSDLC-502 | Persist PR number, URL, target, and head SHA | todo | State reconciles after restart |
| VSDLC-503 | Attach story, spec, checks, and evidence summary to PR | todo | PR template validation |
| VSDLC-504 | Enqueue only successfully created, open PRs | todo | Duplicate enqueue is idempotent |

### Phase 6 — Deterministic local merge queue

| ID | Task | Status | Verification |
| --- | --- | --- | --- |
| VSDLC-601 | Add persistent per-repository queue store | todo | Crash/restart recovery tests |
| VSDLC-602 | Add repository lease and supervised worker lifecycle | todo | Two workers cannot integrate concurrently |
| VSDLC-603 | Create dedicated integration worktree from fresh `origin/main` | todo | Primary checkout remains untouched |
| VSDLC-604 | Build projected main in queue order | todo | Two individually clean but mutually conflicting PR fixture |
| VSDLC-605 | Persist base/head/integration SHAs and invalidate stale checks | todo | Remote-movement race tests |
| VSDLC-606 | Run repository checks against exact combined SHA | todo | Merge blocked for missing, red, or stale checks |
| VSDLC-607 | Merge through GitHub and confirm remote result | todo | End-to-end test with a disposable repository |
| VSDLC-608 | Add offline, sleep, credential-expiry, and disk-pressure handling | todo | Fault-injection tests and clean resume |

### Phase 7 — Intent-aware conflict resolution

| ID | Task | Status | Verification |
| --- | --- | --- | --- |
| VSDLC-701 | Add deterministic conflict classifier | todo | Generated/additive/semantic/unknown fixtures |
| VSDLC-702 | Select relevant tickets and build resolution packet | todo | Relevance fixtures exclude unrelated stories |
| VSDLC-703 | Implement safe mechanical resolution recipes | todo | Regenerated output and repository checks pass |
| VSDLC-704 | Add semantic conflict-resolution agent | todo | Agent cannot merge or self-approve |
| VSDLC-705 | Detect contradictory intentions and block | todo | Contradictory-story fixture always asks user |
| VSDLC-706 | Persist and display resolution records | todo | Record links stories, diff, criteria, checks, approval |

### Phase 8 — Hardening and operations

| ID | Task | Status | Verification |
| --- | --- | --- | --- |
| VSDLC-801 | Long-running voice and queue soak tests | todo | No leaked PTYs, streams, worktrees, locks, or timers |
| VSDLC-802 | Adversarial voice/action/conflict tests | todo | Prompt injection cannot bypass local gates |
| VSDLC-803 | Queue observability and diagnostic export | todo | A failed attempt can be explained without raw secrets |
| VSDLC-804 | Worktree and closed-entry retention policy | todo | No silent data loss or unbounded disk growth |
| VSDLC-805 | Packaged-app end-to-end verification | todo | Voice-to-merged-PR scenario on a disposable repository |

## Initial end-to-end acceptance scenario

The first milestone is complete when this works in a disposable repository:

1. With vbcdr listening, say “new ticket.”
2. Dictate a two-part UI change and confirm it with “go.”
3. Review and approve the refined user story.
4. Let the agent inspect the repository and answer at least one clarification question.
5. Approve the specification by voice.
6. Let the implementation agent change the code in a ticket worktree and pass repository checks.
7. Review a stable before/after capture and the diff.
8. Approve the change by voice.
9. Observe the PR creation and local enqueue.
10. Introduce another queued ticket that touches the same behavior.
11. Confirm the queue rebuilds from fresh `main`, loads both user stories, preserves compatible intentions, runs combined checks, and records its reasoning.
12. Confirm the PR merges through GitHub and the ticket reaches `merged`.
13. Restart vbcdr during a second queue attempt and confirm it recovers without duplicating or skipping work.

## Open questions

1. Should the canonical integration branch be literally `main`, or a configurable repository target with `main` as the product terminology?
2. Which go phrases ship by default, and can users configure them per language?
3. Should semantic conflict resolutions always require approval, or can repositories opt into bounded autonomous resolution after trust is established?
4. Does ticket priority allow queue reordering after approval, and who may reorder it?
5. How should stacked or explicitly dependent PRs appear in the queue?
6. Should the queue update PR branches on GitHub, or keep conflict-resolution commits on a queue-owned branch until approval?
7. Which evidence recipes can be inferred safely, and which must be authored per repository?
8. How long should merged ticket artifacts, worktrees, screenshots, recordings, and queue logs be retained?
9. Should TTS use the existing companion voice, a separate system voice, or a per-workflow setting?
10. What happens when the machine that owns the queue is offline for an extended period and another person merges directly to `main`?

## Explicitly deferred ideas

- Multiple machines collaboratively owning one local queue.
- Cross-repository atomic merges.
- Automatically modifying contradictory acceptance criteria.
- Direct pushes to protected branches.
- Using voice biometrics as authorization.
- Treating a model-generated screenshot description as visual proof.

## Revision log

- **2026-09-16:** Initial plan created from the voice-first SDLC discussion. Established fresh `main` as the code authority, relevant user stories as semantic context, projected-main verification for queued PRs, and a local deterministic queue with agent-assisted conflict resolution.

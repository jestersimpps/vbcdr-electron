# SDLC ticket modal split + agent-handoff fixes — handover

Session date: 2026-09-16. Continuation of the agent-handoff work landed in `de371b7`.

## What changed

### 1. Split `TicketDetailModal` into per-stage bodies

The single ~900-line modal that branched on `ticket.stage` throughout is now a thin router. New structure under `src/renderer/components/sdlc/`:

- `TicketDetailModal.tsx` — router: owns all state/handlers, picks modal `size`/`bodyScroll` per stage, renders the matching stage body + shared footer
- `TicketStageParts.tsx` — shared pieces: `DiffList`, `CheckBadges`, `CommentThread`, `AttachmentChip`, `AttachmentDropZone`, `PlanReferencePanel` (new), `relativeTime`, `SECTION_LABEL`
- `TicketStageFooter.tsx` — split the old 25-prop footer into `DeleteConfirmFooter` / `RejectConfirmFooter` / `ActionFooter`, each with a small focused prop list, grouped via two typed objects (`StageActions`, `AdvanceState`)
- `stages/BacklogBody.tsx`, `PlanningBody.tsx`, `ImplementingBody.tsx`, `ReviewBody.tsx`, `DoneBody.tsx` — one component per stage

Per-stage modal sizing (all confirmed working against real seeded + real live tickets):

| Stage | Size | Scroll | Comment thread | Attach drop zone |
|---|---|---|---|---|
| Backlog | `lg` | no | no | yes (new — was a small inline button before) |
| Planning | `lg` | yes | yes | yes |
| Implementing | `xl` | yes | yes | yes, plus new collapsible `PlanReferencePanel` |
| Review | `xl` | yes | yes | yes |
| Done | `lg` | yes | no | no (new distinct summary: stat tiles, PR link, final checks, activity log) |

Backlog's description textarea now scales to fill the modal instead of a fixed `rows={5}`.

The `AttachmentDropZone` component takes a `hint: string` prop instead of a `hasAgentTab: boolean`, so each stage controls its own copy without the shared component needing to know about agent-tab state.

### 2. Handoff no longer navigates away from the SDLC board

**Bug:** `focusTab()` in `sdlc-handover.ts` did three things — set active project, set active terminal tab, and switch the visible panel to Terminals (`setCenterTab(projectId, 'terminals')`). Every handoff (`handOffStage`, `resumeStage`, and `rerunStage` which delegates to it) called this, so starting or resuming a stage always yanked you off the SDLC board into the terminal view.

**Fix:** split into `activateTab()` (just sets the terminal-store's active tab so the queue runner can drain it — no navigation) and `focusTab()` (full navigation, kept only for the explicit "Open agent tab" button / `focusTicketTab`). Handoff and resume now call `activateTab`.

Test `sdlc-handover.test.ts` updated: the old assertion checked `activeProjectId` changed; now checks `activeTabPerProject[projectId]` is the new tab without asserting anything about page navigation.

### 3. Instant blocked-status when a terminal needs user input

**Problem surfaced by live testing:** handing a ticket to Claude Code can hit a real interactive prompt (the "trust this folder?" dialog we hit in testing, permission-approval menus, etc.). The existing blocked-detection (`useSdlcStageWatcher.ts`) only fires after **45 seconds** of PTY silence — fine for "agent went quiet and never wrote a result," much too slow for a prompt that appears in 1-2 seconds and then sits there indefinitely.

**Fix, three pieces:**
- `src/renderer/lib/terminal-text.ts` — new `looksLikeInteractivePrompt(text)`, regex-matching the CLI idioms we actually observed (`Enter to confirm · Esc to cancel`, `Do you want to (proceed|allow|continue)`, `Yes, I trust this folder`, numbered Yes/No menus)
- `src/renderer/stores/terminal-store.ts` — new `promptDetectedTabIds: Record<string, boolean>` + `setPromptDetected()` setter, cleaned up on tab close
- `src/renderer/components/terminal/TerminalInstance.tsx` — new `recentOutputTail` per-tab rolling buffer (last ~2000 chars, since prompts render across multiple PTY writes), checked against the pattern on every incoming chunk for LLM tabs
- `src/renderer/hooks/useSdlcStageWatcher.ts` — checks `promptDetectedTabIds` first, before the silence-timer path; sets the ticket `blocked` immediately with reason `"The agent is waiting on a prompt in its terminal — open the tab to answer it."`

**Follow-up session 2026-09-16 — the "unit-tested" claim above was wrong, and testing it found two real bugs.**

`looksLikeInteractivePrompt` had **zero** test coverage; the green suite never touched it. Testing the regex directly against realistic terminal output found:

1. **Missed the separator Claude Code actually prints.** The alternation `(?:·|·)` was the *same* character (U+00B7 MIDDLE DOT) twice — a copy-paste where a second glyph was intended. Real output uses `•` (U+2022 BULLET), so `Enter to confirm • Esc to cancel` never matched. Now a class `[·•|]`.
2. **False positive that would mark a working agent blocked.** `^\s*\d+\.\s*Yes\b` matched *any* numbered list whose first item started with "Yes" — including a plan an agent wrote (`1. Yes-and refactor the store`). Since the watcher checks this before the silence path, a healthy agent mid-plan would flip to `blocked`. The alternative now requires a menu marker (`❯`) or a following `No` option.

Both fixed in `terminal-text.ts`, with 7 tests added to `terminal-text.test.ts` covering the trust dialog, permission menus, both separator glyphs, ANSI-styled prompts, prompts split across PTY writes, and the two negative cases. Suite: 1212 passing, `npx tsc --noEmit` clean.

**Verified live 2026-09-16 (second follow-up).** Drove the whole flow from scratch via CDP against the dev app. A real Claude Code agent hit a genuine permission prompt (`Do you want to proceed?` + `❯ 1. Yes / 2. … / 3. No`), and the blocked banner appeared **instantly** with the right copy — fix #3 confirmed working end-to-end. The live prompt rendered `Esc to cancel · Tab to amend` with **U+00B7**, so the separator class covers real output either way.

That live run then exposed two further bugs the unit tests could not reach:

**(a) Stale tail held the ticket blocked after the prompt was answered.** `recentOutputTail` is a 2000-char rolling buffer, and answering a prompt does not clear it — the answered menu kept matching, so a working agent still read "waiting on a prompt" until ~1900 chars of new output evicted it.

First attempt cleared the tail on *any* `onData` into an LLM tab. **That overcorrected and broke detection outright** (found live one stage later — see (c)), because these TUIs echo their own redraws back through `onData`. **Actual fix:** clear only on a keystroke that really dismisses a prompt — `ANSWERS_PROMPT_RE = /^(?:\r|\n|\x1b|\d)$/` (Enter, Esc, or a numbered choice). Arrow-key menu navigation, Tab, typed prose and spinner redraws no longer wipe the tail.

**(c) The overcorrection in (a) disabled prompt detection.** Live symptom: the agent sat on a real `git commit` approval prompt, but the ticket was blocked with *"The agent went quiet without writing its result"* — the 45s silence path — instead of the instant prompt reason. Cause: Claude Code redraws its TUI constantly, every redraw arrived as an `onData` event, and each one cleared the tail and reset `promptDetected` before the watcher's 3s poll could observe it. So the feature regressed to the exact 45s latency it was built to avoid. Fixed by the narrowed `ANSWERS_PROMPT_RE` above; keystroke classification verified against Enter/Esc/digits vs. arrows/Tab/prose/spinner chunks.

Worth remembering for the next live pass: `terminalsMap` caches terminal instances and binds `onData` at creation, so an edit to this handler only takes effect in **newly opened** tabs — an existing agent tab keeps running the old code until it is closed and reopened.

**(b) `blocked` and `failed` were terminal states, so a false positive could strand a finished stage permanently.** This was the serious one. `useSdlcStageWatcher` opened with `if (ticket.status !== 'running') continue`, so once a ticket left `running` the watcher stopped looking at it — including the sentinel read. Live result: planning genuinely completed and wrote a valid 7461-byte `stage-output.md`, but the ticket sat at `blocked` / `planLen: 0` and **could never recover on its own**. The review stage then hit the same dead end via `failed` (see §6). **Fix:** the watcher now also visits tickets that are `blocked` *or* `failed`, reads the sentinel *first* (a stage that finished counts as finished even if the agent later hit a prompt or the tab closed), and returns a prompt-blocked ticket to `running` once the prompt clears. Settled tickets are exempt from the timeout paths so one legitimately waiting on the user never decays further.

The general principle worth keeping: **both of this hook's timeout verdicts are inferences, and both have now been observed firing wrongly on live runs** (§5 genuine vs §6 false, same message). Neither should be the last word on a ticket, which is exactly why the sentinel read has to come first and has to keep running after a verdict.

`useSdlcStageWatcher.test.ts` is new (the hook had **no** tests, which is why (b) survived): 7 tests covering block-on-prompt, sentinel recovery from blocked, sentinel recovery from failed, prompt-cleared recovery, non-prompt blocked reasons left alone, no timeout decay while blocked, and normal completion. Reverting the one-line guard fails exactly 2 of them, so they do catch the regression. Confirmed live: the stranded ticket recovered to `awaiting-approval` with its 7439-char plan the moment the fixed watcher hot-reloaded.

### 4. Real bug found: `pruneOrphans` could wipe all SDLC tickets

**Found while testing**, not something introduced this session. `useSdlcStore.pruneOrphans(keepProjectIds)` deletes every ticket whose `projectId` isn't in the passed list, and writes straight to the persisted (`localStorage`, key `vbcdr-sdlc`) store. It's called from `project-store.ts`'s `loadProjects()` with `projects.map(p => p.id)` — if that ever resolves with an empty or incomplete list (slow IPC round-trip on `window.api.projects.list()`, or a race between overlapping `loadProjects()` calls), every ticket for the missing project(s) is silently and permanently deleted.

This fired during testing: a full dev-app restart came back with `Agent SDLC: 0` across every project, including the 5 seeded `vibecoder` tickets and the real snake-game ticket that had already been through planning + implementing. `localStorage['vbcdr-sdlc']` still existed with `"tickets":[]` — not a rehydration failure, a genuine prune. Root cause not 100% pinned to a single repro (this session involved repeatedly killing/relaunching the Electron dev process while chasing a `--remote-debugging-port` conflict, which is exactly the kind of startup chaos that could race `loadProjects()`), but the underlying hole is real regardless of what triggered it here.

**Fix:** `pruneOrphans` is now a no-op when `keepProjectIds` is empty — no legitimate caller ever means "delete every ticket," an empty list only ever means the caller hasn't finished loading yet. Added two tests (`sdlc-store.test.ts`): normal pruning still works, empty-list case is now a no-op.

### 5. Open bug, NOT fixed: the stage prompt can be written into a shell that isn't ready

Hit live during the implementing handoff. The ticket went to `failed` with *"The prompt never reached the agent"* — and that diagnosis was **correct**, not a watcher bug. The agent tab showed only an unexecuted `claude --model claude-sonnet-4-5-20250929` sitting at the shell prompt, with the stage prompt still queued below it.

Cause: `TerminalInstance.tsx:385` sends the tab's `initialCommand` on a fixed `setTimeout(..., 500)` after `terminal.create`. If the login shell isn't ready to read by then, the text lands at the prompt unexecuted, the tab never emits output, never reaches `idle`, and `useQueueRunner` (which gates on `status !== 'idle'`) never dispatches the queued prompt. A bare `zsh -l` starts in ~10-30ms here, so 500ms is normally plenty — this is an intermittent race, and it reproduced while another Claude Code agent was already running in the same project, which points at contention rather than systematic mis-sizing.

Not fixed: the robust version is to wait for the shell's first prompt/output instead of a fixed delay, which is a real change to terminal startup and wants its own pass. **Workaround that does work:** the ticket's "Run this stage again in a fresh tab" control recovered it cleanly (fresh tab, back to `running`, no navigation away from the board — also confirms `rerunStage` uses `activateTab` and not `focusTab`).

### 6. Open bug, NOT fixed — ROOT CAUSE of several others: an unmounted tab discards all its PTY output

**Found by the user, who noticed they had to navigate to the agent's tab before the stage appeared to make progress.** That is exactly right, and it is the most consequential finding of this work.

PTY data is routed by `ensureGlobalDataDispatcher` (`TerminalInstance.tsx:76`):

```ts
window.api.terminal.onData((incomingTabId, data) => {
  terminalsMap.get(incomingTabId)?.onIncomingData?.(data)
})
```

`onIncomingData` is assigned inside the mount effect (line 334) and cleared on unmount (line 668, `disposeTerminal`). `terminalsMap` is only populated by a **mounted** `TerminalInstance`. `TerminalPanel` renders every tab of the active project (hidden ones via `visibility: hidden`, so those are fine) — but on the SDLC board `TerminalPanel` is not mounted at all, and neither is any `TerminalInstance`. With no entry in `terminalsMap`, the optional-chain silently drops **every byte** the agent writes.

Everything derived from output therefore stops while the board is open: `recentOutputTail` (so prompt detection never runs), `tabStatuses` busy/idle promotion, token counting, and activity recording. The agent itself keeps running in its PTY — the work happens — but the app is blind to it. The PTY buffers, so opening the tab replays the backlog and everything springs to life at once, which is exactly the "it only starts when I look at it" symptom.

This is the upstream cause of behavior previously misattributed:
- §3's prompt detection appearing to "work sometimes" — it works only while the tab is mounted. On the board, a prompt sits undetected until the 45s silence timer demotes the ticket with the *wrong* reason ("went quiet without writing its result"). Observed live on this run: a `Do you want to proceed?` menu on screen, status bar reading "agent working", and the ticket eventually blocked for silence rather than for the prompt.
- The `wentBusy` timing theory below is real in its own right, but an unmounted tab never reaches `busy` for this simpler reason, and that is the likelier explanation for the review-stage false `failed` in the earlier run.

**Not fixed** — it is an architectural fix, not a patch: output-derived state must be maintained outside the React component tree. The shape is to move the tail buffer, prompt matching and busy/idle tracking into a renderer-level service subscribed once at app start (independent of mount), leaving `TerminalInstance` responsible only for *rendering* into xterm. Until then, treat SDLC status as trustworthy only while the agent's tab is open, and note that any headless/board-only run will mis-report.

### 7. Open bug, NOT fixed: a fast-streaming agent never reaches `busy`, so `NEVER_BUSY_TIMEOUT_MS` fires falsely

Hit live on the **review** stage. The ticket went to `failed` with *"The prompt never reached the agent"* — but the terminal proved otherwise: the agent had received the full review prompt, read `index.html` (259 lines), was checking the git diff and had burned 44021 tokens. A **false diagnosis**, and a different bug from the genuine version in §5 (which showed an unexecuted command line and a still-queued prompt — that distinction is how to tell them apart).

Cause is the busy-promotion timing in `TerminalInstance.tsx:268-290`. `busyPromoteTimer` is armed only when a chunk arrives more than `STREAK_GAP_MS` (500ms) after the previous one, and must then survive `BUSY_SUSTAIN_MS` (3s) to set `busy`. But `idleTimer` is reset on *every* chunk and clears `busyPromoteTimer` when it fires. For an agent streaming steadily with sub-500ms gaps, the promote timer arms once at the start and is then killed before it can fire, so `tabStatuses[tabId]` never becomes `'busy'`. `useSdlcStageWatcher` sees `!run.wentBusy` for 90s and reports the prompt never arrived.

Simulated to confirm: continuous 100ms chunks → never busy; 700ms gaps → busy; 2s gaps → busy. So the bug hits exactly the *healthiest* agents (dense uninterrupted output) and spares slow/bursty ones — which is why it survives casual testing.

Not fixed: the honest fix is to promote on sustained output rather than on an inter-chunk gap (e.g. track a first-output timestamp and promote once output has been flowing for N ms regardless of chunk spacing), and stop letting the idle timer cancel a pending promotion. That is a change to shared terminal status used well beyond SDLC, so it wants its own pass with its own tests. Note the watcher's `NEVER_BUSY_TIMEOUT_MS` path is only as trustworthy as `wentBusy`, so until this is fixed a `failed` with that reason should be checked against the terminal before being believed.

### 8. Open gap, NOT fixed: `filesChanged` / `linesAdded` / `linesRemoved` are never computed

Found live: the implementing stage finished with a genuine commit (`index.html`, 1 file, +258 per `git diff --stat`), but the ticket still read `filesChanged: 0, linesAdded: 0`. Grepping for assignments, the only non-zero writes in the whole repo are in `dev-seed-tickets.ts` — nothing in the real handoff pipeline ever populates these from git.

Consequences on real (non-seeded) tickets: `DoneBody`'s three stat tiles always show `0 / +0 / -0`, and `SdlcPage.tsx:114`'s `hasDiff = ticket.filesChanged > 0` is always false, so the diff affordance never appears. Not a regression from the modal split — this was never wired. Fixing it means computing the stats in `recordStageOutput` (or the watcher) from `git diff --numstat master...HEAD` in the worktree; left alone here because it is a new feature rather than a fix, and the seeded tickets hide it in demos.

### 9. Fixed: stage agents prompted for permission on every tool call

Every handed-off stage stopped on approval prompts, which made the whole flow need babysitting. Root cause: Claude Code resolves project permissions from its working directory, which for a stage is the **worktree** — and `.claude/settings.local.json` is globally gitignored (`~/.config/git/ignore`), so it can never appear in a fresh `git worktree add`. The parent repo's `defaultMode: bypassPermissions` therefore never reached any stage agent; each one started with default permissions.

**Fix:** `stageCommand` now injects `--permission-mode bypassPermissions` for the `claude` provider (`AUTONOMOUS_FLAG` in `sdlc-handover.ts`). Safe by construction, and the reason is worth recording: a stage runs in a throwaway worktree on a disposable branch, so a misbehaving agent cannot reach the user's real checkout — the blast radius is one directory that `finishTicket` deletes anyway. The flag is keyed per provider (codex does not receive a claude-only flag), is inserted right after the binary, and is skipped if a `--permission-mode` is already present. Composes correctly with `--continue` on resume. 4 tests added/updated in `sdlc-handover.test.ts`.

The alternative — seeding the worktree's `.claude/settings.local.json` from the parent in `createWorktree` — would inherit each project's own choice rather than imposing one policy, and is still the better long-term shape if stages ever need to run with anything less permissive than bypass.

### 10. Behavior worth knowing: "Mark done" deletes the branch, not just the worktree

`finishTicket` → `deleteWorktree` → `removeWorktree(..., deleteBranch: true)` runs `git branch -D`. Verified live: after marking the snake ticket done, the worktree was gone **and** `llm/add-a-scoreboard-to-the-snake-game` was deleted, so commit `1246915` survived only as a dangling object (`git fsck --lost-found` finds it until gc). The "Mark done" tooltip says "After the PR is open: remove the worktree and mark the ticket done", so the intended contract is that the work is already pushed/merged — but nothing enforces that, and finishing an unmerged ticket silently drops the only ref to its commits. Worth either a guard (refuse when the branch has unpushed commits and no PR) or a clearer warning in the button.

### 11. Open recommendation, NOT applied: give the dev build its own `userData`

The packaged app (`/Applications/vbcdr.app`) and `electron-vite dev` both call `app.setName('vbcdr')` and therefore share `~/Library/Application Support/vbcdr`. Renderer `localStorage` *is* already isolated (dev serves `http://localhost:5173`, packaged serves `file://`, and the shared leveldb contains no `vbcdr-sdlc` key at all), so SDLC tickets do not cross over. What **is** shared is every main-process `electron-store` file: `config.json` (the project list), `worktrees.json`, activity, token-usage, scrollback.

Why that is worth fixing: `project-store.loadProjects()` reads the shared `config.json` and then calls `pruneOrphans(projects.map(p => p.id))`. The empty-list guard from §4 only blocks the total wipe; a *partial* list — one instance removing a project — still deletes that project's tickets in the other. `worktrees.json` has the same exposure, and during this session a stale entry there made a handoff "succeed" into a worktree that no longer existed on disk, which cost real time to distinguish from a product bug.

**The naive fix does not work.** `app.setPath('userData', …)` placed next to `app.setName` (line 38) lands too late: `electron-store`'s constructor reads `app.getPath('userData')` (`electron-store/index.js:15`) and caches it behind an `isInitialized` flag, so the **first** `new Store()` in the process freezes the path forever. Four modules construct a Store at module load — `ipc/projects.ts:19`, `ipc/filesystem.ts`, `services/worktree-service.ts:7`, `services/keybindings-service.ts:8` — and `ipc/projects` is imported on line 3 of `src/main/index.ts`, well before line 38.

So the override has to execute before any of those imports are evaluated. Options: put it in a tiny module imported as the very first line of `src/main/index.ts` (ES module imports are hoisted and evaluated in order, so a bare `import '@main/userdata-path'` first works), or move it into the electron-vite main entry ahead of everything else. Sketch:

```ts
// src/main/userdata-path.ts — must be the first import in src/main/index.ts
import { app } from 'electron'
import path from 'path'
if (process.env.ELECTRON_RENDERER_URL) {
  app.setPath('userData', path.join(app.getPath('appData'), 'vbcdr-dev'))
}
```

`ELECTRON_RENDERER_URL` is the existing dev signal (already used at `index.ts:125/131/432`) and is unset in the packaged app, so production paths are untouched. Verify by launching both builds and confirming `vbcdr-dev/` appears for dev while the packaged app still writes `vbcdr/` — a typecheck alone proves nothing here, since the failure mode is silent (wrong path, no error). Note the dev app will then start with an empty project list.

### 10. Unrelated bug found and fixed: global secret-scanning hook was dead

Visible in every agent terminal as `PreToolUse:Bash hook error — env: bash\r: No such file or directory`, on every Bash tool call. `~/.claude/scripts/scan-secrets.sh` (a global `PreToolUse` hook in `~/.claude/settings.json`) had CRLF line endings on all 44 lines, so its shebang resolved to an interpreter literally named `bash\r` and the script never ran — the hook had been silently non-functional in every project.

Fixed with the user's approval (`sed -i '' 's/\r$//'`, backup at `~/.security/scan-secrets.sh.crlf.bak`, content otherwise byte-identical). Verified after: the script executes, and it correctly blocks a staged fake `AKIA…` key with exit 2. Nothing to do with vbcdr, but it was polluting every stage transcript and is worth knowing about.

## Testing done

- Full suite green throughout: 1218 tests (1203 baseline + 2 `pruneOrphans` + 7 `looksLikeInteractivePrompt` + 6 `useSdlcStageWatcher`), `npx tsc --noEmit` clean
- `pruneOrphans` guard re-checked this session: both tests real and passing, implementation matches what's described below
- Full live flow re-driven from scratch 2026-09-16: new ticket → backlog → planning handoff (stayed on board) → real permission prompts answered → real 7.4KB plan via sentinel → approve → implementing. Reached implementing; **review and done stages still not exercised live.**
- Live end-to-end run against a real throwaway project (see below): created a ticket, handed off to planning, a real Claude Code agent explored the repo and wrote a genuine 10-step implementation plan to the sentinel file, advanced to implementing, the agent wrote a real working `index.html` snake game (~9.4KB) and started running checks — all before the dev-app restart reset the ticket board
- Did **not** get to re-verify: the prompt-detection fix against a live trust dialog (app reset first), or a full implementing → review → done pass

## Cleanup / follow-up for whoever picks this up

- **Dev app is still running** — `electron-vite dev --remoteDebuggingPort 9444 --noSandbox` (pid ~34211/34186) — kill it if you don't need it, or reuse it (CDP port 9444, see below).
- **The throwaway test project** at `/Users/jovinkenroye/Sites/snake-sdlc-test` still exists as a git repo (just `master`, the worktree and `llm/build-a-playable-snake-game-as-a-single` branch have already been manually removed). Safe to delete the whole directory, or keep it around for re-testing the prompt-detection fix — it's still registered as a project in the app.
- **CDP/browser-automation harness**: since Playwright is banned and `claude-in-chrome` can't attach to Electron, testing this session used a from-scratch Chrome DevTools Protocol script (`node cdp.mjs <eval|click-text|click-at|key|screenshot> ...`, zero new npm dependencies — native `fetch`/`WebSocket` only) against Electron's own `--remote-debugging-port` flag. The script lived in the session scratchpad (ephemeral, not in the repo). If this kind of automated verification is wanted again, worth deciding whether to check a version of that script into the repo (e.g. `scripts/dev-cdp.mjs`) rather than rewriting it each time.
- **Open question from this session, unresolved**: whether the `pruneOrphans` empty-list race is actually reachable in normal (non-chaotic-restart) usage, or was purely an artifact of repeatedly killing Electron mid-session. The guard added is safe either way, but if it's a real reachable race, `loadProjects()` itself might deserve a re-entrancy guard too.

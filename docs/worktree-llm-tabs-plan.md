# Worktree-backed LLM tabs, with close-time PR flow and conflict handling

## Context

Today every LLM tab in the terminal panel just runs in the project's own working
directory, so two LLM tabs in the same project step on each other's uncommitted
changes. The goal is to let each LLM tab optionally run in its own `git worktree`
(its own branch, own working directory, no interference), and to build the
surrounding workflow: naming/renaming the branch, opening a PR when the work is
done, fixing merge conflicts, and seeing all in-flight worktree PRs in one place.

This came out of an exploratory discussion (not yet any code beyond the generic
`Modal` primitive already added at `src/renderer/components/ui/Modal.tsx`, still
uncommitted). Decisions locked in during that discussion:

- Worktrees live **inside the repo** under `.worktrees/<branch>/` (not an external
  app-managed folder) — simpler discovery, at the cost of needing to keep
  `.worktrees/` gitignored per project.
- PR creation shells out to the **`gh` CLI** (reuses the user's existing
  `gh auth login`; no token vault to build — none exists today). If `gh` is
  missing/unauthenticated, PR creation is skipped with a visible warning; the
  branch still gets created/pushed.
- Branch naming is **auto-generated at creation** (e.g. `llm/<timestamp>-<shortid>`)
  since `git worktree add` needs a branch immediately, and the user **renames it
  later** in the close-time modal, before a PR is opened.
- This plan should cover the **full roadmap** (all 5 pieces), but only **Phase 1**
  is scoped tightly enough to implement immediately. Phases 2-5 are sequenced
  next steps, not to be built in this pass, and carry two flagged open questions
  that need a decision before they're implemented.

## Relevant existing code (traced this session, all facts verified against source)

- **Tabs**: `TerminalTab` model — `src/renderer/models/types.ts:17` (id, title,
  projectId, cwd, optional `initialCommand`; `initialCommand` presence = LLM tab).
  `createTab()` — `src/renderer/stores/terminal-store.ts:53` (generates id, titles
  `LLM` vs `Terminal N`, stores owner/cwd/command, activates). Tab's `cwd` is
  captured once and never rewritten later.
- **Tab creation entry point**: `handleNewTab()` in
  `src/renderer/components/terminal/TerminalPanel.tsx:230`, wired to the panel's
  `+` button at line 311. Three ownership modes (project / global / override) are
  resolved around lines 94-106 of the same file.
- **cwd → process**: `handleNewTab` → `createTab` → `TerminalInstance` renders and
  calls `window.api.terminal.create(tabId, projectId, cwd, cols, rows)`
  (`TerminalInstance.tsx:301/351`) → preload bridge (`preload/index.ts:91`) →
  `main/ipc/terminal.ts:6` → `createPty()` in
  `main/services/pty-manager.ts:104` (falls back to home dir if cwd invalid) →
  `pty.spawn(shell, ['-l'], { cwd: safeCwd, ... })` at `pty-manager.ts:125`. The
  assistant command itself is typed into the shell 500ms after spawn
  (`TerminalInstance.tsx:352`), not passed as the PTY executable.
- **Settings/persistence pattern to mirror**: `LayoutState` in
  `src/renderer/stores/layout-store.ts` holds all other LLM-related settings
  (provider, custom startup command, global terminal cwd) — defaults at line 85,
  setters at 164, `persist` middleware with `partialize` + a validating `merge` at
  line 210, localStorage key `vbcdr-layout`. A complete boolean-setting precedent
  already exists end-to-end: `src/renderer/stores/editor-prefs-store.ts:6/39`
  (type/default/setter) bound via the reusable `PrefToggle` control
  (`src/renderer/components/settings/SettingsControls.tsx:77`) in
  `src/renderer/components/settings/EditorSection.tsx:5/27`. The LLM settings UI
  lives in `src/renderer/components/settings/Settings.tsx:70`.
- **Git operations available today**: `src/main/services/git-service.ts` — exec
  helper (line 13), `getBranches` (75), `checkoutBranch` (445, auto-stash/pop
  around dirty trees), `getStatus`/porcelain parsing (392/104-113, already
  classifies `conflict`), `getConflicts` (531, exposed via `git:conflicts` IPC at
  `main/ipc/git.ts:196`), `pull`/`push`/`rebaseRemote` (560/569/578). **Missing
  today**: create-branch, rename-branch, merge, rebase continue/abort, any PR
  operation.
- **Existing "ask the LLM to fix it" precedent**: `ConflictBanner.tsx:23` already
  detects conflicts via `getConflicts()` and offers to have the active LLM
  resolve + `git add` them, by writing an instruction into the terminal — this is
  the same mechanism Phases 2-4 below should reuse rather than building new
  git-merge orchestration in the main process.
- **Modal precedents**: `NewFeatureModal.tsx` (portal, backdrop/Escape dismiss,
  sends a free-text task to the LLM terminal, closes immediately) and
  `SessionHistoryModal.tsx` (async loading/error/content states) — both now
  superseded, for new modals, by the generic primitive at
  `src/renderer/components/ui/Modal.tsx` (already built this session: `isOpen`,
  `onClose`, `title`, `footer`, `size`, `closeOnBackdropClick`, `closeOnEscape`,
  `preventClose` for in-flight async actions).
- **Tab close today**: fully synchronous, no confirmation gate anywhere —
  `handleCloseTab()` in `TerminalPanel.tsx:270` marks teardown, fire-and-forgets
  `window.api.terminal.kill(tabId)`, disposes xterm, removes the tab from the
  store. `closeTab()` itself — `terminal-store.ts:70`.
- **No credential vault exists** (`main/models/types.ts:127`'s `EncryptedCredential`
  is unused); `electron-store` is used only for project metadata
  (`main/ipc/projects.ts:19`) — this is the natural place for durable worktree/PR
  tracking data in Phase 5, since that data needs to survive app restarts and is
  queried by main-process git/gh calls, unlike renderer-only `layout-store.ts`.

## Phase 1 (build now): "Use worktrees for new LLM tabs" setting + worktree creation

**Setting**
- Add `useWorktreesForNewLlmTabs: boolean` (default `false`) to `LayoutState` in
  `layout-store.ts`: type, default in the initializer, a setter, add to
  `partialize`, add a validated fallback in `merge` — mirror
  `editor-prefs-store.ts:6/39` exactly.
- Add a `PrefToggle` for it in the General → LLM section of `Settings.tsx`
  (near line 70), next to the existing assistant/global-folder controls.

**Worktree creation (main process)**
- Add to `git-service.ts`, next to the existing exec helper (line 13):
  - `createWorktree(projectPath, branchName?)`: generates `llm/<timestamp>-<shortId>`
    if no name given, runs `git worktree add -b <branch> .worktrees/<branch>`
    rooted at `projectPath`, returns the absolute worktree path + branch name.
  - `ensureWorktreesGitignored(projectPath)`: checks the project's `.gitignore`
    for a `.worktrees/` entry; if absent, appends one (with a short comment)
    before creating the first worktree. Call this from `createWorktree`.
- New IPC handler `git:createWorktree` in `main/ipc/git.ts` (same registration
  pattern as `git:conflicts` at line 196) + preload bridge entry next to the
  other `git.*` bridges, exposed as `window.api.git.createWorktree(projectPath, branchName?)`.

**Wiring into tab creation**
- Extend `TerminalTab` (`types.ts:17`) with an optional
  `worktree?: { path: string; branch: string; projectPath: string }` so later
  phases can identify worktree-backed tabs. Thread an optional param through
  `createTab()` (`terminal-store.ts:53`).
- In `handleNewTab()` (`TerminalPanel.tsx:230`): when the tab is being created in
  "project workspace" ownership mode (not global/override) **and**
  `useLayoutStore.getState().useWorktreesForNewLlmTabs` is true **and** the tab is
  an LLM tab (has an `initialCommand`) **and** the project is a git repo (reuse
  whatever repo-detection `git-store`/`BranchSwitcher` already relies on) — call
  `window.api.git.createWorktree(project.path)`, await it, then
  `createTab(ownerId, worktreePath, command, { path, branch, projectPath })`
  instead of the plain project path.
- On any failure (not a repo, git error, `.worktrees` write failure): fall back to
  creating a normal tab at the project path and log the error — no new toast/error
  UI is being built in this phase.
- **Explicitly out of scope for Phase 1**: tab close behavior is untouched.
  Closing a worktree tab just closes the terminal like today
  (`handleCloseTab`, `TerminalPanel.tsx:270`); the worktree directory and its
  branch are left on disk. Phase 2 is what changes close behavior.

**Verification**
- `npx tsc --noEmit -p tsconfig.web.json` (and the main-process equivalent config,
  check `package.json` for the exact script name) after each of the two new
  main-process functions and the renderer wiring.
- Manual run: toggle the setting on in Settings, open a project that's a git
  repo, click `+` in the LLM panel, confirm a `.worktrees/<branch>/` directory
  appears with its own branch checked out, confirm `.gitignore` picked up the new
  entry, and confirm the LLM terminal actually starts in that worktree path (e.g.
  `pwd` inside the tab). Then toggle the setting off and confirm new tabs go back
  to the plain project path.

## Roadmap (not built in this pass — sequenced follow-ups)

**Phase 2 — Close-tab modal: rename branch + open PR**
Intercept `handleCloseTab` when `tab.worktree` is set: instead of closing
immediately, show a `Modal` with the branch name (editable, prefilled with the
auto-generated name) and a summary of `git status`/`getConflicts()` for that
worktree. Confirming should push the (possibly renamed) branch and run
`gh pr create` scoped to that worktree's cwd, using the `preventClose` prop on
`Modal` while that's in flight, then proceed with the normal tab-close teardown.
**Open question to resolve before building this**: pushing + `gh pr create` can
take a few seconds, but the underlying pty is killed as soon as the tab closes —
decide whether the modal *blocks* tab-close until push/PR finishes, or the tab
closes immediately and the in-flight operation runs from the main process
independent of the (now-dead) terminal. This determines whether Phase 5's
tracking store (below) needs to exist before Phase 2 ships.

**Phase 3 — Editable "close workflow" instruction setting**
A new persisted string setting (e.g. `closeTabWorkflowPrompt`, same pattern as
Phase 1's boolean but a textarea) with a sensible default ("commit any changes,
push the branch, open a PR, stop if there are conflicts"), editable in Settings
with a "reset to default" action. The Phase 2 modal shows/edits this text per
close and, instead of Claude/Electron orchestrating git+gh directly, writes the
resulting instruction into the worktree tab's terminal the same way
`TerminalInstance.tsx:352` already injects the startup command — letting the LLM
already in that terminal do the actual git/gh work, consistent with the
`ConflictBanner.tsx:23` precedent. This likely *simplifies* Phase 2: less new
git/gh orchestration code needed in the main process.

**Phase 4 — "Fix conflicts" button**
Same LLM-instruction mechanism as `ConflictBanner.tsx:23`, reusing
`getConflicts()`/`getStatus()` for detection, but scoped to a worktree row rather
than the main working tree. If the worktree's tab is already closed, this needs
to respawn a terminal rooted at that worktree path first (reuse the Phase 1
worktree-tab creation flow, pointed at an *existing* worktree instead of a new
one).

**Phase 5 — Persistent "Worktree PRs" panel in the git area**
A durable list of tracked worktrees (`{ projectId, worktreePath, branch, prUrl,
prStatus, hasConflicts }`), stored in the main process via `electron-store`
alongside `projects.ts:19` (not renderer `layout-store.ts`, since this needs to
survive restarts and be queried by main-process git/`gh pr view` polling). New
component (e.g. `WorktreePrPanel.tsx`) mounted alongside `GitActions.tsx` /
`BranchSwitcher.tsx`, listing branch, PR link/status, a conflict badge, the
Phase 4 "fix conflicts" button, and a "reopen tab" action. Also needs a
`git worktree remove` cleanup action once a PR merges — not detailed further
here.

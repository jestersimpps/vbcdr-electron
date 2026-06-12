# Bug file

Bugs found during the 2026-06-12 architecture review. Each one was verified against the code by hand, not just flagged by a scanner. Refactor work in this pass is behavior-preserving, so none of these are fixed yet. We go over them together and decide per bug.

A second section lists suspected issues that I could not fully confirm.

---

## Verified bugs

### 1. Terminal links open inside Electron instead of the system browser
- **Where:** `src/main/index.ts` (no `setWindowOpenHandler` anywhere) + `src/renderer/components/terminal/TerminalInstance.tsx:198` (`new WebLinksAddon()`)
- **What happens:** WebLinksAddon's default activate handler calls `window.open(uri)`. The main process never installs a `webContents.setWindowOpenHandler`, so Electron creates a brand-new bare BrowserWindow for any URL clicked in a terminal. No menu, no preload, and arbitrary remote content running inside the app instead of the default browser.
- **Also:** there is no `will-navigate` guard, so a stray navigation in the renderer would replace the app UI.
- **Severity:** high (security posture + UX)
- **Suggested direction:** `setWindowOpenHandler` returning `{ action: 'deny' }` + `shell.openExternal(url)` for http/https, plus a `will-navigate` preventDefault.

### 2. `credential.helper=osxkeychain` is forced on Linux and Windows terminals
- **Where:** `src/main/services/pty-manager.ts:65-67`
  ```ts
  env.GIT_CONFIG_COUNT = '1'
  env.GIT_CONFIG_KEY_0 = 'credential.helper'
  env.GIT_CONFIG_VALUE_0 = 'osxkeychain'
  ```
- **What happens:** this env is applied to every PTY on every platform, but the app ships Linux (AppImage/deb) and Windows (nsis) builds. On those platforms git will try to run the nonexistent `git-credential-osxkeychain` helper, printing warnings and breaking the user's configured credential helper.
- **Severity:** medium (broken git auth UX on Linux/Windows)

### 3. Cached terminal closure holds a stale container element after remount
- **Where:** `src/renderer/components/terminal/TerminalInstance.tsx:247-252`
- **What happens:** terminals are intentionally cached in the module-level `terminalsMap`, and `onIncomingData` is only created once, at terminal creation. That closure captures `el` (the container div from the *first* mount). When the tab remounts elsewhere (layout switch, tab move), the xterm element is re-parented into a new container, but the closure still reads the old detached div:
  ```ts
  const hidden = el.offsetParent === null   // always true once the old div is detached
  ```
  After any remount, `hidden` is permanently `true`, so the `autoScroll && (atBottom || hidden)` branch always scrolls to bottom — the "don't yank the scroll position while reading history" behavior silently breaks.
- **Severity:** medium
- **Note:** same pattern means a changed `initialCommand`/`cwd` prop would also be ignored by the cached closure, but in practice those never change for a tab. The `el` capture is the part that bites.

### 4. PATH probe runs an interactive login shell synchronously on the main process
- **Where:** `src/main/services/pty-manager.ts:68-75`
  ```ts
  const loginPath = execSync('/bin/bash -ilc "echo $PATH"', ...)
  ```
- **What happens:** `execSync` with `-i` (interactive) blocks the main process for however long the user's bashrc takes (nvm users: easily 500ms+), and it runs once *per terminal creation*, not cached. Every new terminal can freeze the whole app for that duration. On Windows `/bin/bash` doesn't exist and this throws every time (caught, but still spawns a failing process per terminal).
- **Severity:** medium (main-process jank on every terminal open)

### 5. Queue runner can stall a queued item; throttle is shared across all tabs
- **Where:** `src/renderer/hooks/useQueueRunner.ts:21-36`
- **What happens:** two related defects:
  1. `lastDispatchAtRef` is a single ref shared by all tabs. Dispatching on tab A blocks dispatch on tab B for 2s even though they are independent terminals.
  2. When the effect bails on the throttle (`Date.now() - last < 2000`), nothing re-triggers it. If no store state changes in the next render cycle, the queued item sits until some unrelated state change re-runs the effect.
- **Severity:** low-medium (queue items occasionally need a "nudge")

### 6. FileTree inline create swallows failures and gives no feedback
- **Where:** `src/renderer/components/sidebar/FileTree.tsx` (`handleInlineSubmit`)
- **What happens:** if `fs.createFile/createFolder` rejects (permissions, name collision with invalid chars), the error goes to `console.error` only and `setInlineInput(null)` still closes the input. To the user the create just silently does nothing. (Tree refresh itself is fine — the main-process watcher pushes `fs:tree-changed`.)
- **Severity:** low (UX)

### 7. Window/global shortcut `Cmd+Alt+1-9` reads `input.key`, breaks with Alt on macOS
- **Where:** `src/main/index.ts:75`
  ```ts
  if (input.meta && input.alt && /^[1-9]$/.test(input.key))
  ```
- **What happens:** on macOS, Option+digit produces a symbol character in `key` (e.g. Option+1 → `¡`), not the digit. `input.code` would be `Digit1`. Whether this fires depends on keyboard layout; on most layouts the switch-project shortcut never matches.
- **Severity:** low (feature likely dead on many layouts)

### 8. `projects:reorder`-style boolean returns mask write failures (pattern)
- **Where:** `src/main/ipc/terminal.ts` (`terminal:write`), `src/main/services/pty-manager.ts:148-150`
- **What happens:** `writePty` silently no-ops when the tab has no PTY (e.g. PTY died, renderer still thinks it's alive). Queue runner and menu actions (`/clear`, `/commit`) write into the void with no error signal, and the queue item is already dequeued — the prompt is lost.
- **Severity:** low-medium (lost queue items when a PTY died underneath a tab)

---

## Suspected / unverified (needs a decision or deeper repro)

### S1. Statistics computes the session tree three times from raw data
`Statistics.tsx` builds sessions independently in `sessions`, `todayMs`, and `heatmap` memos. Not a correctness bug today (deps are complete), but the triple computation is heavy with large histories, and the three code paths can drift. Addressed structurally in the refactor (single memoized source), with identical outputs.

### S2. DiffPanel view-zone effect has an intentionally empty cleanup
`DiffPanel.tsx:543-545` relies on the next effect run to clear zones. In every path I traced the zones are cleared (or the editor unmounts), but it is fragile against future edits. Worth tightening when we touch DiffPanel after the binary-preview work lands.

### S3. Command palette substring matches always beat fuzzy matches
`CommandPalette.tsx` scores substring hits at ~1000 and fuzzy hits at ~1-5 per char, so a long path containing the query as a substring outranks a much better fuzzy match. Ranking choice, not a crash — flagging in case results feel wrong in practice.

### S4. Auto-update lifecycle calls are fire-and-forget
`window-all-closed`/`before-quit` call flush/compact helpers without awaiting; if the activity/token flush does async I/O at quit, the write can be cut off. The current implementations are sync writes, so it holds today — but it's load-bearing on that assumption.

### S5. Background git fetch runs unbounded `Promise.all` over all projects
`git-fetch-service.ts` fetches every registered project concurrently. With many projects this spikes processes/network at once. Throttle/queue if users report fan noise on fetch ticks.

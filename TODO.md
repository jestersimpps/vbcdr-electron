# TODO - Features & Fixes

## Bugs

### Editor is readonly
- Editor panel is read-only — cannot edit files directly
- Should allow inline editing with save support

### Cannot send screenshots to Claude
- No way to take/paste a screenshot and send it to the Claude terminal
- Should support clipboard image paste or a screenshot button that attaches the image to the conversation

### File viewer doesn't reflect latest changes
- Code/file viewer shows stale content — files modified externally (or by Claude) don't update
- Likely missing a file watcher or re-read on focus/tab switch
- Should watch for file changes and auto-refresh, or at minimum refresh when the editor panel gains focus

### Claude commands refresh not working
- Refresh button in ClaudeFileList triggers `loadFiles` → `scanFiles` but changes to commands are not reflected
- **Root cause**: Zustand store caches `filesPerProject` and `contentCache` — likely stale content cache not being invalidated on refresh
- **Files**: `src/renderer/stores/claude-store.ts`, `src/renderer/components/claude/ClaudeFileList.tsx`
- **Fix**: Clear `contentCache` for the project when `loadFiles` is called, or add a file watcher on `.claude/commands/` to auto-refresh

## Features

### ~~Branch switcher dropdown~~ (DONE)
- Click branch name in StatusBar → dropdown with local/remote branches → direct checkout
- Auto-stash dirty work, auto-pop on arrival

### ~~Auto-fetch + Drift Warning~~ (DONE)
- Background `git fetch` every 60s per project
- Banner with Pull/Rebase action buttons when behind/diverged

### ~~PR Draft Generator~~ (DONE)
- "PR" button in GitTree toolbar gathers diff summary vs default branch
- Sends prompt to Claude terminal to create PR via `gh`

### ~~Conflict Resolution Assistant~~ (DONE)
- Detects merge conflicts from git status
- Red banner with "View" (opens files in editor) and "Ask Claude" (sends context to terminal) buttons

### Per-project panel layout
- Panel layout (sizes, visibility, arrangement) is currently shared across all projects
- Should be stored per project so each project remembers its own layout
- Persist layout state keyed by project ID

### Default file open in editor
- Editor should have one file open by default when a project loads (e.g. README.md or main entry point)
- Avoids a blank editor panel on startup

### File tree context menu
- Right-click on a file in the tree should open a context menu
- First action: "Copy path" — copies the file's absolute path to clipboard

## Browser API Optimizations

Based on research of browser-use library (https://github.com/browser-use/browser-use)

### Current Features
- ✅ Basic browser control (click, type, navigate)
- ✅ Screenshot support
- ✅ JavaScript execution
- ✅ Scraping with jina.ai
- ✅ querySelector for targeted inspection
- ✅ Token-efficient patterns (silent mode, limit parameters)

### Priority 1: DOM State Endpoint with Element Indexing
**Token Savings: 60-80%**

Add `/state` endpoint that returns indexed interactive elements:
- Selector map with numeric indices
- Element properties: tag, text, aria-label, role, bounds
- Visibility filtering (only visible/near-viewport elements)
- Compact JSON format

Then add `/clickByIndex`, `/typeByIndex` for direct element access

### Priority 2: Accessibility Tree Integration
**Value: Better semantic understanding**

Use Chrome DevTools Protocol Accessibility domain:
- Get accessibility tree (roles, names, descriptions)
- Merge with DOM data for richer context
- Better form field labeling

### Priority 3: Viewport Filtering
**Token Savings: 30-50% on complex pages**

- Add viewport threshold parameter (default: 1000px beyond viewport)
- Mark elements outside threshold as hidden
- Provide scroll hints (e.g., "3 more buttons 2 pages down")

### Priority 4: Interactive Element Detection

Detect:
- Elements with JS event listeners (click, mousedown, etc.)
- Clickable elements (cursor: pointer, onclick handlers)
- Form inputs and their labels
- Pagination controls

### Priority 5: Performance Optimizations

- Parallel CDP operations (snapshot + AX tree + viewport in parallel)
- Smart iframe handling (depth limits, size limits)
- Paint order filtering (only show top layer elements)
- Element caching & diffing

### References
- browser-use: https://github.com/browser-use/browser-use
- DOM service: https://github.com/browser-use/browser-use/blob/main/browser_use/dom/service.py
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/

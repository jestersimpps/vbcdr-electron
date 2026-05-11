# vbcdr — the first AIDE

[![Build](https://github.com/jestersimpps/vbcdr-electron/actions/workflows/build.yml/badge.svg)](https://github.com/jestersimpps/vbcdr-electron/actions/workflows/build.yml)

**An AIDE for developers who vibe**

A desktop environment built around terminal AI agents, not traditional code editing

**Download at [vbcdr.io](https://www.vbcdr.io/)**

## What is an AIDE?

AIDE stands for AI-Integrated Development Environment

Traditional IDEs put the code editor front and center
vbcdr flips that — terminals and browser previews take the main stage, because in a vibe coding workflow the AI writes the code and you steer, review, and test

The editor is still there when you need to peek at something, but it's intentionally secondary

## Screenshots

![Sortable projects analytics table with active days and totals](docs/screenshot-projects.png)

![Monaco editor with file tree](docs/screenshot-editor.png)

## Features

### Workspace

- **Multi-project dashboard** — switch between projects in one click, all state travels with you (terminals, file tree, browser tabs, queues)
- **Project cards with modal** — open any project in a focused modal with its own terminal preview
- **Command palette** — fuzzy finder for projects, terminals, files, themes, settings, and actions
- **File tree** — hides gitignored files by default, with context menu and drag-and-drop into terminals
- **Project switcher** with async tree loading and cache for fast first-time opens

### Terminals (the main stage)

- **Large terminal panel** with multiple tabs per project, WebGL rendering, search, scrollback persistence across restarts
- **Dynamic tab labels** that reflect Claude Code's current state, busy/idle status indicators
- **Permissions presets** — switch between read-only / auto-accept / yolo modes per terminal with a single button
- **Task queue panel** — line up prompts and feed them to the LLM terminal one by one
- **Shift+Enter newlines** — insert newlines in LLM coding terminal input without submitting (kitty keyboard protocol)
- **File drag-and-drop** into terminals for quick context; images auto-attach via clipboard
- **Send to LLM** — one-click forward of console errors, network failures, and selected files to the active LLM terminal

### Browser & devtools

- **Integrated browser** — per-project tabs for localhost, dashboards, docs, with history, bookmarks, zoom, find-in-page, tab drag-and-drop
- **Device emulation** — preview your app in mobile and tablet viewports
- **Console panel** with one-click send to LLM
- **Network inspector** — expandable request details, headers, accurate response sizes, response body viewer
- **Browserless mode** — per-project toggle that merges terminals into the main panel as tabs (Terminals/Editor/Claude) when you don't need the browser

### Claude Code integration

- **Claude config editor** — edit `~/.claude` settings, CLAUDE.md files, and global config directly from the UI
- **Skills page** — browse and install Claude Code skills with per-scope (project/user) install buttons
- **Activity feed** — live stream of file changes, commands, and diffs surfaced after each terminal action
- **Inline diff overlay** — see the diff of every change made by the LLM right after each terminal command
- **Token velocity dashboard** — per-project token usage history, active-day tracking, sortable analytics table across all projects

### Editor & git

- **Monaco editor** — available when you need it, intentionally secondary; binary preview for non-text files
- **Git tree** — commit graph with branch lanes, branch switcher, drift banner, conflict banner, diff panel
- **Dev server scanner** — list of running dev servers across the system with port, PID, uptime, CPU, memory, and kill button

### Polish

- **17 themes** with dark/light variants — GitHub, One Dark Pro, Dracula, Material, Nord, Tokyo Night, Catppuccin, Pastel, Gruvbox, Monokai, Psychedelic, Synthwave, Cyberpunk, Rainbow, Tropical, Afternoon — plus a custom theme editor
- **Auto-updater** with update banner
- **Persistent terminals** — tabs and scrollback survive app restarts, even after a reboot

## Tech Stack

- Electron + React + TypeScript
- Zustand for per-project state management
- Monaco Editor, Xterm.js (WebGL), react-resizable-panels
- node-pty for native terminal processes
- chokidar for file watching, recharts for token usage charts

## Getting Started

```
npm install
npm run dev
```

Run the test suite:

```
npm test
```

Build a distributable:

```
npm run build:mac      # macOS arm64 dmg + zip
npm run build:linux    # Linux AppImage + deb
npm run build:win      # Windows NSIS installer
```

## Still on the roadmap

- **Password manager** — current password storage needs a redesign for better UX and reliability
- Click files and folders in the project tree to send to the LLM for easy context input
- Give the LLM access to the webview browser so it can manipulate and test the preview
- Many more ideas

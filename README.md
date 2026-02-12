# vbcdr — the first AIDE

**An AIDE for developers who vibe**

A desktop environment built around terminal AI agents, not traditional code editing

## What is an AIDE?

AIDE stands for AI-Integrated Development Environment

Traditional IDEs put the code editor front and center
vbcdr flips that — terminals and browser previews take the main stage, because in a vibe coding workflow the AI writes the code and you steer, review, and test

The editor is still there when you need to peek at something, but it's intentionally secondary

## Screenshot

![Browser preview, devtools, git graph, Claude terminal, and dev terminals](docs/screenshot-browser.png)

## Features

- **Multi-project workspace** — switch between projects in one click, all state travels with you (terminals, browser tabs, file tree)
- **Terminal-first layout** — large dedicated terminal panel with multiple tabs per project, WebGL rendering, search
- **Integrated browser** — per-project browser tabs for localhost, dashboards, docs — with device mode, console, and network panels
- **Code editor** — Monaco editor available when you need it, intentionally secondary
- **Git visualization** — commit graph with branch lanes
- **11 themes with dark/light variants** — GitHub, Dracula, Catppuccin, Nord, Monokai, Gruvbox, Tokyo Night, One Dark Pro, Material, Pastel, Psychedelic — with a built-in theme picker
- **Device emulation** — preview your app in mobile and tablet viewports directly in the browser panel
- **Network inspector** — expandable request details with headers, type, and accurate response sizes
- **Send to Claude** — one-click send console errors/warnings and network failures straight to the active Claude terminal for instant debugging
- **File drag-and-drop** — drag files into terminals for quick context; images are auto-attached to Claude via clipboard
- **Shift+Enter newlines** — insert newlines in Claude Code input without submitting
- **Terminal search** — search highlights, clear/restart buttons, scroll-to-bottom, and tooltips on all controls

## Tech Stack

- Electron + React + TypeScript
- Zustand for per-project state management
- Monaco Editor, Xterm.js (WebGL), react-resizable-panels
- node-pty for native terminal processes

## Getting Started

```
npm install
npm run dev
```

## Still on the roadmap

- **Visual Claude skills manager** — browse, enable/disable, and configure Claude Code skills and slash commands from a dedicated UI panel instead of managing config files manually
- **Password & browser favorites overhaul** — the current password storage and browser favorites system needs a redesign for better UX and reliability
- Click files and folders in the project tree to send to Claude for easy context input
- Give Claude access to the webview browser so it can manipulate and test the preview
- Many more ideas


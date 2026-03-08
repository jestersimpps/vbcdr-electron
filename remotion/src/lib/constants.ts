export const VIDEO = {
  WIDTH: 1920,
  HEIGHT: 1080,
  FPS: 30,
} as const;

export const SCENES = {
  INTRO: { duration: 90 },
  PROBLEM: { duration: 120 },
  PHILOSOPHY: { duration: 90 },
  PRODUCT_REVEAL: { duration: 150 },
  FEATURE_TERMINAL: { duration: 120 },
  FEATURE_BROWSER: { duration: 120 },
  FEATURE_SEND_TO_CLAUDE: { duration: 90 },
  FEATURE_WORKSPACE: { duration: 90 },
  THEME_SHOWCASE: { duration: 150 },
  OUTRO: { duration: 90 },
} as const;

export const TOTAL_DURATION = Object.values(SCENES).reduce(
  (sum, s) => sum + s.duration,
  0
);

export const FONTS = {
  UI: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif",
  MONO: "Menlo, Monaco, 'Courier New', monospace",
} as const;

export const CONTENT = {
  APP_NAME: "vbcdr",
  TAGLINE: "An AIDE for developers who vibe",
  DESCRIPTION: "Desktop vibe coding environment for Claude Code developers",
  PHILOSOPHY_LINE_1: "Terminals and browser previews take the main stage",
  PHILOSOPHY_LINE_2: "The editor is intentionally secondary",
  PROBLEM: "Traditional IDEs weren't built for AI agents",
  GITHUB_URL: "github.com/jestersimpps/vbcdr-electron",
  FEATURES: [
    {
      title: "Terminal-First Design",
      bullets: [
        "WebGL-rendered Claude terminals",
        "Multi-tab with search & Shift+Enter newlines",
        "Drag files & images directly into Claude",
      ],
    },
    {
      title: "Integrated Browser",
      bullets: [
        "Per-project browser tabs",
        "Device emulation: Desktop, iPad, iPhone",
        "Console & Network inspector panels",
      ],
    },
    {
      title: "Send to Claude",
      bullets: [
        "One-click send console errors to Claude",
        "Forward network failures instantly",
        "Debug without copy-pasting",
      ],
    },
    {
      title: "Multi-Project Workspace",
      bullets: [
        "Instant project switching",
        "All state persists across sessions",
        "Terminals, browser tabs, layout — everything travels",
      ],
    },
  ],
} as const;

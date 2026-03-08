export interface ThemePalette {
  name: string;
  bg: string;
  fg: string;
  cursor: string;
  accents: string[];
}

export const GITHUB_DARK = {
  bg950: "#09090b",
  bg900: "#161b22",
  bg800: "#21262d",
  bg700: "#30363d",
  fg: "#e6edf3",
  fgSecondary: "#c9d1d9",
  fgMuted: "#8b949e",
  accent: "#58a6ff",
  red: "#ff7b72",
  green: "#7ee787",
  yellow: "#ffa657",
  blue: "#79c0ff",
  magenta: "#d2a8ff",
  cyan: "#a5d6ff",
} as const;

export const THEMES: ThemePalette[] = [
  {
    name: "GitHub",
    bg: "#0d1117",
    fg: "#e6edf3",
    cursor: "#58a6ff",
    accents: ["#ff7b72", "#7ee787", "#ffa657", "#79c0ff", "#d2a8ff", "#a5d6ff"],
  },
  {
    name: "Dracula",
    bg: "#282a36",
    fg: "#f8f8f2",
    cursor: "#f8f8f0",
    accents: ["#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd"],
  },
  {
    name: "Catppuccin",
    bg: "#1e1e2e",
    fg: "#cdd6f4",
    cursor: "#89b4fa",
    accents: ["#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#cba6f7", "#94e2d5"],
  },
  {
    name: "Nord",
    bg: "#2e3440",
    fg: "#eceff4",
    cursor: "#88c0d0",
    accents: ["#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0"],
  },
  {
    name: "Tokyo Night",
    bg: "#1a1b26",
    fg: "#c0caf5",
    cursor: "#7aa2f7",
    accents: ["#f7768e", "#9ece6a", "#ff9e64", "#7aa2f7", "#bb9af7", "#2ac3de"],
  },
  {
    name: "One Dark Pro",
    bg: "#21252b",
    fg: "#abb2bf",
    cursor: "#528bff",
    accents: ["#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2"],
  },
  {
    name: "Material",
    bg: "#1e1e1e",
    fg: "#eeffff",
    cursor: "#82aaff",
    accents: ["#f07178", "#c3e88d", "#ffcb6b", "#82aaff", "#c792ea", "#89ddff"],
  },
  {
    name: "Monokai",
    bg: "#1e1f1c",
    fg: "#f8f8f2",
    cursor: "#f8f8f0",
    accents: ["#f92672", "#a6e22e", "#e6db74", "#66d9ef", "#ae81ff", "#fd971f"],
  },
  {
    name: "Gruvbox",
    bg: "#1d2021",
    fg: "#ebdbb2",
    cursor: "#fabd2f",
    accents: ["#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c"],
  },
  {
    name: "Pastel",
    bg: "#1e1e2e",
    fg: "#e0d0f0",
    cursor: "#c8b8e0",
    accents: ["#f0a0c0", "#a8d8a8", "#f0d898", "#a0c8f0", "#c8a8e8", "#f0c0a0"],
  },
  {
    name: "Psychedelic",
    bg: "#08060e",
    fg: "#f0e0ff",
    cursor: "#ff2d95",
    accents: ["#ff2d95", "#39ff14", "#ffff00", "#00ffff", "#bf5af2", "#ff8c00"],
  },
];

export const GIT_LANE_COLORS = [
  "#4ade80",
  "#60a5fa",
  "#c084fc",
  "#facc15",
  "#f472b6",
  "#22d3ee",
  "#fb923c",
  "#a78bfa",
  "#34d399",
  "#f87171",
];

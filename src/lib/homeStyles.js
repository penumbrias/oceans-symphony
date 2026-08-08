// Visual style catalogue for the experimental homescreen.
//
// Each style is a wrapper-level "shell" applied around every widget (the
// widgets keep their own internal chrome) — so styles compose with any
// widget without per-widget work. Ids live in HOME_STYLE_IDS
// (experimentalHome.js, the sanitizer's source of truth); this file holds
// the presentation. A page has one style (experimental_home.styleMode) and
// any widget can override it individually (widget.settings.style).
//
// The catalogue came out of the owner's ask for real variety — named after
// recognizable aesthetics: glassmorphism, social feed cards, neobrutalism
// ("toybox"), early-web forum, terminal, spreadsheet, Frutiger Aero.

export const HOME_STYLES = [
  {
    id: "current",
    label: "Current",
    description: "Widgets keep their normal app look.",
    shell: "",
    look: {},
  },
  {
    id: "glass",
    label: "Glass",
    description: "Frosted translucent cards — pairs well with a wallpaper.",
    // `shell` is now ONLY for what a CSS variable can't express (blur,
    // gradients). Everything box-shaped moved into `look`, so a style and a
    // widget's own settings live on one axis instead of painting two boxes.
    shell: "backdrop-blur-sm",
    look: { radius: 16, borderW: 1, borderColor: "#8a8a9a55", bg: "#20202b", bgOpacity: 45, padding: 8 },
  },
  {
    id: "social",
    label: "Social feed",
    description: "Flat cards with soft shadows, like a social timeline.",
    shell: "",
    look: { radius: 12, borderW: 1, borderColor: "#8a8a9a33", bg: "#1a1a24", padding: 10, shadow: "soft" },
  },
  {
    id: "toybox",
    label: "Toybox",
    description: "Chunky borders and hard offset shadows.",
    shell: "",
    look: { radius: 12, borderW: 3, borderColor: "#e8e8f0cc", bg: "#1a1a24", padding: 8, shadow: "hard" },
  },
  {
    id: "forum",
    label: "Old forum",
    description: "Beveled parchment boxes and serif type.",
    shell: "",
    look: { radius: 0, borderW: 2, borderColor: "#8a6a3a66", borderStyle: "double", bg: "#2a2318", padding: 8, font: "serif" },
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Monospace, square corners, a faint green glow.",
    shell: "",
    look: { radius: 0, borderW: 1, borderColor: "#3fbf3f66", bg: "#050805", padding: 8, font: "monospace", accent: "#3fbf3f", shadow: "glow" },
  },
  {
    id: "spreadsheet",
    label: "Spreadsheet",
    description: "Tight gridline cells, no rounding.",
    shell: "",
    look: { radius: 0, borderW: 1, borderColor: "#3f7f5f66", bg: "#101418", padding: 6 },
  },
  {
    id: "aero",
    label: "Aero",
    description: "Glossy gradients and soft glass.",
    shell: "os-style-aero backdrop-blur-sm",
    look: { radius: 16, borderW: 1, borderColor: "#ffffff40", padding: 8 },
  },
  {
    id: "barebones",
    label: "Barebones",
    description: "No shell at all, tighter spacing.",
    shell: "",
    look: { radius: 0, borderW: 0, padding: 0 },
  },
];

const BY_ID = Object.fromEntries(HOME_STYLES.map((s) => [s.id, s]));

export function getHomeStyle(id) {
  return BY_ID[id] || BY_ID.current;
}

export function getStyleShell(id) {
  return getHomeStyle(id).shell;
}

// A style's box values, used as the BASE layer under a widget's own look.
export function getStyleLook(id) {
  return getHomeStyle(id).look || {};
}

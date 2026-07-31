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
  },
  {
    id: "glass",
    label: "Glass",
    description: "Frosted translucent cards — pairs well with a wallpaper.",
    shell: "rounded-2xl bg-card/45 backdrop-blur-sm border border-border/30 p-2 h-full",
  },
  {
    id: "social",
    label: "Social feed",
    description: "Flat cards with soft shadows, like a social timeline.",
    shell: "rounded-xl bg-card border border-border/30 shadow-md p-2.5 h-full",
  },
  {
    id: "toybox",
    label: "Toybox",
    description: "Chunky borders and hard offset shadows (neobrutalism).",
    shell: "rounded-xl bg-card border-[3px] border-foreground/80 shadow-[4px_4px_0_0_rgba(0,0,0,0.85)] dark:shadow-[4px_4px_0_0_rgba(255,255,255,0.28)] p-2 h-full",
  },
  {
    id: "forum",
    label: "Old forum",
    description: "Beveled parchment boxes and serif type, early-web style.",
    shell: "rounded-none bg-amber-100/70 dark:bg-amber-950/30 border-2 border-amber-900/40 [border-style:outset] font-serif p-2 h-full",
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Monospace, square corners, a faint green phosphor glow.",
    shell: "rounded-none bg-black/50 border border-green-500/40 font-mono shadow-[0_0_10px_rgba(63,191,63,0.12)] p-2 h-full",
  },
  {
    id: "spreadsheet",
    label: "Spreadsheet",
    description: "Tight gridline cells, no rounding — very Excel.",
    shell: "rounded-none bg-background border border-emerald-700/40 p-1.5 h-full",
  },
  {
    id: "aero",
    label: "Aero",
    description: "Glossy blue-green gradients (Frutiger Aero nostalgia).",
    shell: "rounded-2xl bg-gradient-to-br from-sky-400/25 via-cyan-300/15 to-emerald-300/25 border border-white/30 dark:border-white/15 shadow-inner backdrop-blur-sm p-2 h-full",
  },
  {
    id: "barebones",
    label: "Barebones",
    description: "No shell at all, tighter spacing.",
    shell: "",
  },
];

const BY_ID = Object.fromEntries(HOME_STYLES.map((s) => [s.id, s]));

export function getHomeStyle(id) {
  return BY_ID[id] || BY_ID.current;
}

export function getStyleShell(id) {
  return getHomeStyle(id).shell;
}

// Shared profile-style model — the single source of truth for how the
// custom_field style keys (written by ProfileStyleEditor) are READ and turned
// into background layers + scoped CSS. Used by every "profile style" surface:
// AlterProfile, ProfileTab (view), GroupProfile.
//
// Keys (all live on the profile's custom_fields):
//   _bg_color           background / card colour
//   _bg_image           background image (page-filling)
//   _bg_opacity         opacity of the body bg layer — the IMAGE's opacity when
//                       an image is set (default 0.5), else the colour's
//                       opacity (default 0.15). With an image set, the _bg_color
//                       is painted as a SOLID base UNDER the image, so lowering
//                       the image opacity reveals the colour.
//   _section_bg_opacity "Surface opacity": opacity of the _bg_color fill laid
//                       over the page's surfaces (cards + entry windows) so text
//                       stays readable over the image (default 0.9).
//   _header_opacity     opacity of the header background IMAGE (default 0.45)
//   _header_bg_opacity  opacity of the header background COLOUR fill (default
//                       1 / fully opaque) — mirrors the Body's bg-colour
//                       opacity so the header colour can be made translucent.
//   _header_bg_color / _header_image / _header_text_color / _header_font
//   _page_text_color / _page_font / _hide_header
//
//   Per-profile theme palette (overrides the app theme for this profile's
//   pages — sets the app's --color-* variables on the .os-pf wrapper so every
//   Tailwind utility, bg-card / bg-muted/20 / text-foreground / bg-primary etc.,
//   adopts the profile's colours):
//   _theme_bg / _theme_surface / _theme_primary / _theme_secondary /
//   _theme_accent / _theme_muted / _theme_text / _theme_text2 / _theme_wave

export const PS = {
  BG_COLOR: "_bg_color",
  BG_IMAGE: "_bg_image",
  BG_OPACITY: "_bg_opacity",
  READABILITY: "_section_bg_opacity",
  HEADER_BG: "_header_bg_color",
  HEADER_IMAGE: "_header_image",
  HEADER_TEXT: "_header_text_color",
  HEADER_FONT: "_header_font",
  HEADER_OPACITY: "_header_opacity",
  HEADER_BG_OPACITY: "_header_bg_opacity",
  HIDE_HEADER: "_hide_header",
  PAGE_TEXT: "_page_text_color",
  PAGE_FONT: "_page_font",
  // Per-profile theme palette (8 colours + wave).
  THEME_BG: "_theme_bg",
  THEME_SURFACE: "_theme_surface",
  THEME_PRIMARY: "_theme_primary",
  THEME_SECONDARY: "_theme_secondary",
  THEME_ACCENT: "_theme_accent",
  THEME_MUTED: "_theme_muted",
  THEME_TEXT: "_theme_text",
  THEME_TEXT2: "_theme_text2",
  THEME_WAVE: "_theme_wave",
  // Header-scoped palette (independent of the body/page theme). Background +
  // text reuse the existing HEADER_BG / HEADER_TEXT keys (so existing profiles
  // are untouched); these add the DEEPER colours so the header banner can have
  // its own full palette. No wave — it doesn't render in the header. Applied as
  // inline CSS vars on the header element via headerThemeStyleVars().
  HEADER_THEME_SURFACE: "_header_theme_surface",
  HEADER_THEME_PRIMARY: "_header_theme_primary",
  HEADER_THEME_SECONDARY: "_header_theme_secondary",
  HEADER_THEME_ACCENT: "_header_theme_accent",
  HEADER_THEME_MUTED: "_header_theme_muted",
  HEADER_THEME_TEXT2: "_header_theme_text2",
};

// Normalised read of the background-related style keys, with the contextual
// defaults applied (image vs colour-only).
export function readProfileBg(cf = {}) {
  const bgColor = cf[PS.BG_COLOR] || "";
  const bgImage = cf[PS.BG_IMAGE] || "";
  const hasImage = !!bgImage;
  const bgOpacity = cf[PS.BG_OPACITY] !== undefined ? cf[PS.BG_OPACITY] : (hasImage ? 0.5 : 0.15);
  // "Surface opacity" / readability: how opaque the _bg_color fill on the
  // page's surfaces (cards + entry windows) is. Default near-solid so text
  // stays readable; the user can lower it to let the image show through.
  const readability = cf[PS.READABILITY] !== undefined ? cf[PS.READABILITY] : 0.9;
  const headerImage = cf[PS.HEADER_IMAGE] || "";
  const headerOpacity = cf[PS.HEADER_OPACITY] !== undefined ? cf[PS.HEADER_OPACITY] : 0.45;
  // Opacity of the header background COLOUR. Defaults to 1 (fully opaque) so
  // existing profiles' header colours look exactly as before; the user can
  // lower it to let the page bg / image show through the header.
  const headerBgOpacity = cf[PS.HEADER_BG_OPACITY] !== undefined ? cf[PS.HEADER_BG_OPACITY] : 1;
  const headerBgColor = cf[PS.HEADER_BG] || "";
  return {
    bgColor,
    bgImage,
    hasImage,
    bgOpacity,
    readability,
    headerBgColor,
    // The header background colour with its own opacity baked in (rgba). Use
    // this as the header card's background so the colour can be translucent.
    headerBgColorWithAlpha: headerBgColor ? colorWithAlpha(headerBgColor, headerBgOpacity) : "",
    headerBgOpacity,
    headerImage,
    headerOpacity,
    pageTextColor: cf[PS.PAGE_TEXT] || "",
    hasPageBg: !!(bgColor || bgImage),
  };
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// "#rrggbb" + alpha → rgba() string (falls back to the hex if unparseable).
export function colorWithAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex || "";
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

// CSS that fills the profile's SURFACES — section cards AND entry windows
// (inputs, textareas, selects, the rich bio editor) — with _bg_color at the
// surface ("readability") opacity, when a background image is set. This is
// deliberately broad: it covers every common surface utility the profile pages
// use (bg-card, bg-background, the bg-muted/N tints used by the info cards, the
// Profile-style editor SubSection cards, group/subsystem rows) so they ALL get
// the colour backing instead of floating transparently over the image. Scoped
// to a wrapper class so it never leaks to modals/nav elsewhere. Returns "" when
// not applicable.
export function profileSurfaceCss(scopeClass, cf = {}) {
  const { bgColor, hasImage, readability } = readProfileBg(cf);
  if (!hasImage || !bgColor) return "";
  const rgb = hexToRgb(bgColor);
  const fill = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${readability})` : bgColor;
  // A lighter version of the same fill for "chrome" surfaces (nav tabs, section
  // labels, ghost/outline buttons) that should read as backed but not as heavy
  // as a content card. Clamp so it's always at least faintly visible.
  const chromeAlpha = rgb ? Math.min(1, Math.max(0.55, readability)) : 1;
  const chromeFill = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${chromeAlpha})` : bgColor;
  const sel = (s) => `.${scopeClass} ${s}`;
  // NB: in a CSS string the Tailwind class `bg-muted/20` is the selector
  // `.bg-muted\/20` — the slash must be escaped, and in this JS string the
  // backslash itself must be escaped, hence `\\/`.
  const targets = [
    ".bg-card",
    ".bg-background",
    ".bg-muted\\/5",
    ".bg-muted\\/10",
    ".bg-muted\\/15",
    ".bg-muted\\/20",
    ".bg-muted\\/30",
    ".bg-muted\\/40",
    ".bg-muted\\/50",
    // Primary-tinted surface: the profile activity-feed cards (Board tab) use
    // bg-primary/5 for "mentioned" items — they float transparently over a bg
    // image without this backing. (We deliberately don't add bg-primary/10 /15
    // here — those are used by small inline chips / pills whose primary tint
    // should stay; the active nav tab's bg-primary/10 is already legible
    // because its row is backed via data-pf-chrome below.)
    ".bg-primary\\/5",
    'input:not([type="range"]):not([type="checkbox"]):not([type="radio"])',
    "textarea",
    "select",
    '[contenteditable="true"]',
  ].map(sel).join(",");
  // "Chrome" elements that have NO background of their own and so float
  // illegibly over the image: the profile nav-tabs row, the row of section
  // labels ("GROUPS", "…'S SUBSYSTEMS", "INFO", etc.) and the header control
  // row (Prev / Next / Edit / Message / Pin / Back buttons). The renderers tag
  // these with data-pf-chrome (a backed pill) or data-pf-chrome-label (a small
  // inline-block label chip) so the backing is scoped tightly — we don't
  // blanket-fill every <button> / <p>. The label variant gets a touch of
  // horizontal padding + radius so the short text reads as a chip, not a bar.
  const chrome = sel("[data-pf-chrome]");
  const chromeLabel = sel("[data-pf-chrome-label]");
  // [data-pf-surface] = "back this whole container as one card". Used for big
  // composite areas that aren't a single bg-utility element — the in-profile
  // EDIT form (so every label + field reads), the Profile-style editor card,
  // and tab bodies like Lineage that are bare text over the image.
  // Match a descendant OR the scope element itself carrying the attribute
  // (GroupProfile's edit root is the .os-pf wrapper itself).
  const surface = `.${scopeClass}[data-pf-surface],.${scopeClass} [data-pf-surface]`;
  return (
    `${targets}{background-color:${fill} !important;}` +
    `${surface}{background-color:${fill} !important;padding:0.75rem;}` +
    `${chrome}{background-color:${chromeFill} !important;border-radius:0.75rem;}` +
    `${chromeLabel}{background-color:${chromeFill} !important;border-radius:0.5rem;padding:0.15rem 0.5rem;}`
  );
}

// Per-profile theme palette → scoped CSS that overrides the app's theme
// variables on `.scopeClass`. Sets BOTH the app's own `--color-*` custom
// properties (which Tailwind's colour utilities reference directly — see
// tailwind.config.js: background→--color-bg, card→--color-surface,
// primary→--color-primary, foreground→--color-text-primary, etc.) AND the
// derived `--color-surface-rgb` triplet used by the rgba(var(--color-surface-rgb))
// pattern. Only emits a declaration for keys the user actually set, so unset
// colours fall through to the inherited app theme. Returns "" when nothing set.
//
// Because Tailwind's `bg-card`, `bg-muted/20`, `text-foreground`, `bg-primary`
// etc. all resolve to these variables, overriding them on the profile wrapper
// makes every utility inside `.os-pf` adopt the profile's palette — which also
// fixes the card/text backing problem holistically.
export function profileThemeCss(scopeClass, cf = {}) {
  if (!cf) return "";
  const map = [
    [PS.THEME_BG, "--color-bg"],
    [PS.THEME_SURFACE, "--color-surface"],
    [PS.THEME_PRIMARY, "--color-primary"],
    [PS.THEME_SECONDARY, "--color-secondary"],
    [PS.THEME_ACCENT, "--color-accent"],
    [PS.THEME_MUTED, "--color-muted"],
    [PS.THEME_TEXT, "--color-text-primary"],
    [PS.THEME_TEXT2, "--color-text-secondary"],
  ];
  const lines = [];
  for (const [key, cssVar] of map) {
    const val = cf[key];
    if (val) lines.push(`${cssVar}:${val};`);
  }
  // Keep --color-surface-rgb in sync with the surface override so the
  // rgba(var(--color-surface-rgb), opacity) readability tint matches.
  const surface = cf[PS.THEME_SURFACE];
  if (surface) {
    const rgb = hexToRgb(surface);
    if (rgb) lines.push(`--color-surface-rgb:${rgb.r}, ${rgb.g}, ${rgb.b};`);
  }
  // Wave colour — the 9th customisable colour. Emit it as --color-wave so any
  // wave rendered inside the profile scope adopts it. (The global app-header
  // wave in AppLayout sits OUTSIDE .os-pf and reads its own palette key, so
  // it's intentionally untouched here.)
  const wave = cf[PS.THEME_WAVE];
  if (wave) lines.push(`--color-wave:${wave};`);
  if (lines.length === 0) return "";
  return `.${scopeClass}{${lines.join("")}}`;
}

// Header-scoped palette → inline CSS-variable overrides for the HEADER element
// only, so the banner can carry its own colour palette independent of the body/
// page theme. Returns a style object to spread onto the header wrapper; the vars
// cascade to the header's descendants and override the page-level
// profileThemeCss values within the header. Background + text come from the
// existing HEADER_BG / HEADER_TEXT keys (the banner already paints those
// explicitly; we mirror them into --color-bg / --color-text-primary so
// utility-based header children adopt them too). The deeper colours come from
// the _header_theme_* keys. No wave — it doesn't render in the header. Only set
// keys emit a var, so unset colours fall through to the page theme.
export function headerThemeStyleVars(cf = {}) {
  if (!cf) return {};
  const map = [
    [PS.HEADER_BG, "--color-bg"],
    [PS.HEADER_THEME_SURFACE, "--color-surface"],
    [PS.HEADER_THEME_PRIMARY, "--color-primary"],
    [PS.HEADER_THEME_SECONDARY, "--color-secondary"],
    [PS.HEADER_THEME_ACCENT, "--color-accent"],
    [PS.HEADER_THEME_MUTED, "--color-muted"],
    [PS.HEADER_TEXT, "--color-text-primary"],
    [PS.HEADER_THEME_TEXT2, "--color-text-secondary"],
  ];
  const vars = {};
  for (const [key, cssVar] of map) {
    const val = cf[key];
    if (val) vars[cssVar] = val;
  }
  const surface = cf[PS.HEADER_THEME_SURFACE];
  if (surface) {
    const rgb = hexToRgb(surface);
    if (rgb) vars["--color-surface-rgb"] = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  }
  return vars;
}

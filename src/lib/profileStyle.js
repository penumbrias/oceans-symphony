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
//   _header_opacity     opacity of the header background image (default 0.45)
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
  return {
    bgColor,
    bgImage,
    hasImage,
    bgOpacity,
    readability,
    headerBgColor: cf[PS.HEADER_BG] || "",
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
    'input:not([type="range"]):not([type="checkbox"]):not([type="radio"])',
    "textarea",
    "select",
    '[contenteditable="true"]',
  ].map(sel).join(",");
  return `${targets}{background-color:${fill} !important;}`;
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
  if (lines.length === 0) return "";
  return `.${scopeClass}{${lines.join("")}}`;
}

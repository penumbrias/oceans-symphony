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
//                       opacity (default 0.15)
//   _section_bg_opacity "Readability": opacity of the _bg_color tint laid over
//                       the background image (default 0.1). Only used with an
//                       image. Also reused as the card-surface alpha hint.
//   _header_opacity     opacity of the header background image (default 0.45)
//   _header_bg_color / _header_image / _header_text_color / _header_font
//   _page_text_color / _page_font / _hide_header

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
// deliberately scoped to the page's boxes and NOT a full-page wash. Scoped to a
// wrapper class so it never leaks to modals/nav elsewhere. Returns "" when not
// applicable.
export function profileSurfaceCss(scopeClass, cf = {}) {
  const { bgColor, hasImage, readability } = readProfileBg(cf);
  if (!hasImage || !bgColor) return "";
  const rgb = hexToRgb(bgColor);
  const fill = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${readability})` : bgColor;
  const sel = (s) => `.${scopeClass} ${s}`;
  const targets = [
    ".bg-card",
    'input:not([type="range"]):not([type="checkbox"]):not([type="radio"])',
    "textarea",
    "select",
    '[contenteditable="true"]',
  ].map(sel).join(",");
  return `${targets}{background-color:${fill} !important;}`;
}

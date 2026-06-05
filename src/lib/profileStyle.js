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
  const readability = cf[PS.READABILITY] !== undefined ? cf[PS.READABILITY] : 0.1;
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

// CSS that recolours the profile's cards to _bg_color when a background image
// is set (so cards/bio/dropdowns read against the image). Scoped to a wrapper
// class so it never leaks out of the profile. Returns "" when not applicable.
export function profileCardCss(scopeClass, cf = {}) {
  const { bgColor, hasImage } = readProfileBg(cf);
  if (!hasImage || !bgColor) return "";
  // Target the card surface utility used inside profiles. !important to win
  // over the Tailwind utility class. Scoped to the profile wrapper so it never
  // leaks to inputs/modals elsewhere.
  return `.${scopeClass} .bg-card{background-color:${bgColor} !important;}`;
}

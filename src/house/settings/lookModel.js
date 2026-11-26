// Display options → Look (board 07's "Appearance: the look"): the pure rules
// behind the Look tab, kept apart from the page so
// scripts/test-house-settings.mjs can test them without a browser.
//
// The tab writes nothing new of its own kind. Each control lands in a
// setting that already drives the look:
//
//   Look            SystemSettings.ui_look ("pixel" | "smooth")
//   Colours         the theme's eight colours (ThemeContext customColors,
//                   localStorage, mirrored into the DB like every look pref)
//                   for deep/panel/raised/text/text 2/accent/accent 2; the
//                   pixel overrides on SystemSettings.ui_pixel for outline,
//                   tab (the title bars) and deep when a floor colour is set;
//                   SystemSettings.wave_color_custom for the wave; and
//                   ui_pixel.swatches for bevel, bevel light, good, warning,
//                   info and note (house only)
//   Fonts           the accessibility font prefs (useAccessibility.js)
//   Border, bevel,  ui_pixel.line, ui_pixel.bevel, ui_pixel.corners
//   corners
//   Icons           ui_pixel.icons ("classic" = round ends)
//   Header wave     ui_pixel.wave (off | stepped | smooth) + wave_color_custom
//   Penumblob       ui_pixel.guide (small | hidden)

import { THEME_TO_SWATCH } from "@/house/paint/translate";
import { PIXEL_LABEL_FONT } from "@/house/tokens/roles";

// The pixel font's own name, from its one token.
const PIXEL_FONT_NAME = (String(PIXEL_LABEL_FONT).match(/'([^']+)'/) || [])[1] || "the pixel font";

// Board 07's sixteen swatches, in its order, with its names.
export const LOOK_SWATCHES = Object.freeze([
  { key: "outline", label: "outline" },
  { key: "deep", label: "deep" },
  { key: "panel", label: "panel" },
  { key: "raised", label: "raised" },
  { key: "bevelLight", label: "bevel light" },
  { key: "wave", label: "wave" },
  { key: "text", label: "text" },
  { key: "text2", label: "text 2" },
  { key: "accent", label: "accent" },
  { key: "accent2", label: "accent 2" },
  { key: "good", label: "good" },
  { key: "warning", label: "warning" },
  { key: "bevel", label: "bevel" },
  { key: "tab", label: "tab" },
  { key: "info", label: "info" },
  { key: "note", label: "note" },
]);

// The swatch → the theme colour that fills it (the reverse of the paint
// translator's THEME_TO_SWATCH). "tab" is left out on purpose: in the house
// the tab colour is the title bar, which is the pixel title-bar override.
const SWATCH_TO_THEME = Object.freeze(Object.fromEntries(
  Object.entries(THEME_TO_SWATCH).filter(([, sw]) => sw !== "tab").map(([theme, sw]) => [sw, theme]),
));

// The house colours that live in ui_pixel.swatches (house only).
export const HOUSE_ONLY_SWATCHES = Object.freeze(["bevel", "bevelLight", "good", "warning", "info", "note"]);

// Where a swatch is saved, given the pixel overrides already set (`px`, from
// readPixelLook):
//   { kind: "theme", key }   one of the theme's eight colours
//   { kind: "pixel", key }   a ui_pixel colour (outline, titleBar, floorTop)
//   { kind: "house", key }   ui_pixel.swatches[key]
//   { kind: "wave" }         wave_color_custom
export function swatchTarget(key, px = {}) {
  if (key === "outline") return { kind: "pixel", key: "outline" };
  if (key === "tab") return { kind: "pixel", key: "titleBar" };
  // The floor: a floor colour of the pixel look wins over the theme's
  // background, so the swatch edits whichever is showing.
  if (key === "deep" && px.floorTop) return { kind: "pixel", key: "floorTop" };
  if (key === "wave") return { kind: "wave" };
  if (HOUSE_ONLY_SWATCHES.includes(key)) return { kind: "house", key };
  if (SWATCH_TO_THEME[key]) return { kind: "theme", key: SWATCH_TO_THEME[key] };
  return null;
}

// The colour a swatch shows: what the house is drawing. `paint` is
// translatePaint's result, `roles` houseTokens' roles. The tab and bevel
// swatches show the title bar and the button bevel as drawn.
export function swatchShown(key, paint, roles = {}) {
  const sw = paint?.tokens?.swatches || {};
  if (key === "tab") return roles.title || sw.titleBar || sw.raised || null;
  if (key === "bevel") return roles.bevelRaised || sw.bevel || null;
  return sw[key] || null;
}

// Is this swatch the person's own colour (so it can go back to the house's)?
// Theme colours are always a theme, never "unset", so they never clear here
// (Reset the look puts the whole theme back).
export function swatchIsOwn(key, px = {}, row = {}) {
  const t = swatchTarget(key, px);
  if (!t) return false;
  if (t.kind === "pixel") return !!px[t.key];
  if (t.kind === "house") return !!px.swatches?.[t.key];
  if (t.kind === "wave") return typeof row?.wave_color_custom === "string" && !!row.wave_color_custom;
  return false;
}

// A theme colour change as the full two-variant draft ThemeContext saves.
// `custom`: the saved custom colours (or null); `base`: the colours the house
// is showing for each variant (themeColours(device, "pixel")), so editing one
// colour never swaps the other seven for a different theme.
export function themeDraft(custom, base, variant, key, value) {
  const from = (v) => ({ ...(base?.[v] || {}), ...(custom?.[v] || {}) });
  const draft = { light: from("light"), dark: from("dark") };
  draft[variant === "light" ? "light" : "dark"][key] = value;
  return draft;
}

// The ui_pixel.swatches object after one change (`value` "" or null clears).
export function nextHouseSwatches(current, key, value) {
  const next = { ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}) };
  if (value) next[key] = value;
  else delete next[key];
  return next;
}

// The sliders (board 07: Border, Bevel depth, Corner rounding). `fallback`
// is what the house draws when the person hasn't set one.
export const LOOK_SLIDERS = Object.freeze([
  { id: "line", label: "Border", min: 1, max: 4, fallback: 1 },
  { id: "bevel", label: "Bevel depth", min: 0, max: 4, fallback: 1 },
  { id: "corners", label: "Corner rounding", min: 0, max: 16, fallback: 0 },
]);

// The header wave as the Look tab shows it.
export function waveChoice(paint) {
  const t = paint?.tokens || {};
  if (t.waveOff) return "off";
  return t.waveShape === "smooth" ? "smooth" : "stepped";
}

// Everything "Reset the look" puts back to the house's own (ui_pixel keys
// to clear). The Look choice (Pixel/Smooth) and Penumblob are left alone:
// they are not paint. The theme colours are put away as a kept preset
// (stashAndClearCustomColors), never thrown away.
export const LOOK_RESET_PIXEL_KEYS = Object.freeze([
  "outline", "titleBar", "floorTop", "floorBottom", "corners", "bevel", "line", "icons", "wave", "swatches", "type",
]);

// The ui_pixel patch for a reset, and the one that undoes it.
export function lookResetPatch(uiPixel = {}) {
  const clear = {};
  const undo = {};
  const src = uiPixel && typeof uiPixel === "object" ? uiPixel : {};
  for (const k of LOOK_RESET_PIXEL_KEYS) {
    clear[k] = undefined;
    if (src[k] !== undefined) undo[k] = src[k];
  }
  return { clear, undo };
}

// The body-font list as the house offers it. Inter is the old house's
// default and the house reads it as "not chosen", so in its place the list
// offers the house's own default (Atkinson Hyperlegible).
export const HOUSE_BODY_DEFAULT_ID = "__house_body";
export const HOUSE_HEADING_DEFAULT_ID = "default";
const UNCHOSEN_BODY = new Set(["", "inter", "'Inter', sans-serif", "Inter"]);
export function isUnchosenBody(v) { return v == null || UNCHOSEN_BODY.has(String(v).trim()); }
export function houseBodyOptions(options = []) {
  return [
    { id: HOUSE_BODY_DEFAULT_ID, label: "Atkinson Hyperlegible (house)" },
    ...options.filter((o) => !isUnchosenBody(o.id)),
  ];
}
export function houseHeadingOptions(options = [], look = "pixel") {
  return [
    { id: HOUSE_HEADING_DEFAULT_ID, label: look === "pixel" ? `${PIXEL_FONT_NAME} (house)` : "Same as the body" },
    ...options.filter((o) => o.id && o.id !== HOUSE_HEADING_DEFAULT_ID),
  ];
}

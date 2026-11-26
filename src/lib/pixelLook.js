// Pure readers for the app look (uiLook.js) and the pixel look's own
// settings, with no React, so pure code (the new house's paint translator)
// and node tests can use them. uiLook.js re-exports everything here.

export const UI_LOOKS = Object.freeze({ SMOOTH: "smooth", PIXEL: "pixel" });
export const DEFAULT_UI_LOOK = UI_LOOKS.SMOOTH;

export function readUiLook(settings) {
  return settings?.ui_look === UI_LOOKS.PIXEL ? UI_LOOKS.PIXEL : DEFAULT_UI_LOOK;
}


// The pixel look's own defaults, which the person can change
// (Display options → Shape → App look). Stored on SystemSettings.ui_pixel,
// a device look field like ui_look. Every key is optional: unset means the
// pixel look's built-in value. A widget's own look still wins over these.
export const PIXEL_LOOK_DEFAULTS = Object.freeze({ corners: 0, bevel: 2 });
export const PIXEL_COLOUR_VARS = {
  outline: "--px-line",       // the dark outline round panels and buttons
  titleBar: "--px-bar",       // title bars of widgets, menus and the header
  floorTop: "--px-floor-top", // the page floor's gradient, top
  floorBottom: "--px-floor-bottom", // …and bottom
};
const HEX = /^#[0-9a-f]{3,8}$/i;
// The header wave's shapes (ui_pixel.wave) and the house colours a person can
// set beyond the theme's eight (ui_pixel.swatches), read by readPixelLook.
export const PIXEL_WAVE_SHAPES = Object.freeze(["off", "stepped", "smooth"]);
export const PIXEL_HOUSE_SWATCHES = Object.freeze(["bevel", "bevelLight", "good", "warning", "info", "note"]);
const num = (v, lo, hi) => {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) ? null : Math.min(hi, Math.max(lo, n));
};

export function readPixelLook(settings) {
  const raw = settings?.ui_pixel && typeof settings.ui_pixel === "object" ? settings.ui_pixel : {};
  const out = {};
  const corners = num(raw.corners, 0, 16);
  if (corners != null) out.corners = corners;
  const bevel = num(raw.bevel, 0, 4);
  if (bevel != null) out.bevel = bevel;
  for (const k of Object.keys(PIXEL_COLOUR_VARS)) if (HEX.test(raw[k] || "")) out[k] = raw[k];
  if (raw.type === "plain") out.type = "plain";
  // The new house's own look (Settings → Display options → Look, v0.393).
  // The old house never reads these; unset is the house's default.
  //   line    the outline width, 1–4 px (unset: 1 px)
  //   icons   "classic": round ends on the line icons (unset: square, pixel)
  //   wave    the header wave: "off" | "stepped" | "smooth" (unset: the old
  //           wave setting decides on/off, and the wave is stepped)
  //   guide   Penumblob, the guide: "small" | "hidden" (unset: shown)
  //   swatches the house colours no theme colour fills: bevel, bevelLight,
  //           good, warning, info, note (hex; unset: worked out / built in)
  const line = num(raw.line, 1, 4);
  if (line != null) out.line = Math.round(line);
  if (raw.icons === "classic") out.icons = "classic";
  if (PIXEL_WAVE_SHAPES.includes(raw.wave)) out.wave = raw.wave;
  if (raw.guide === "small" || raw.guide === "hidden") out.guide = raw.guide;
  const sw = raw.swatches && typeof raw.swatches === "object" && !Array.isArray(raw.swatches) ? raw.swatches : {};
  const swatches = {};
  for (const k of PIXEL_HOUSE_SWATCHES) if (HEX.test(sw[k] || "")) swatches[k] = sw[k];
  if (Object.keys(swatches).length) out.swatches = swatches;
  // The status bar along the bottom (computer): on unless switched off,
  // and which of its items are hidden.
  out.statusBar = raw.statusBar !== false;
  out.statusHidden = Array.isArray(raw.statusHidden) ? raw.statusHidden.filter((id) => PIXEL_STATUS_ITEMS.some((i) => i.id === id)) : [];
  // The tool rail (computer): quick actions and this page's tools down one
  // edge. On unless switched off; left unless moved right.
  out.rail = raw.rail !== false;
  out.railSide = raw.railSide === "right" ? "right" : "left";
  // The timeline dock along the bottom of Home (computer): off unless
  // switched on, and which of its layers are hidden.
  out.dock = raw.dock === true;
  out.dockHidden = Array.isArray(raw.dockHidden) ? raw.dockHidden.filter((id) => PIXEL_DOCK_LAYERS.some((l) => l.id === id)) : [];
  return out;
}

// The timeline dock's layers, top to bottom. Each reads one kind of record;
// "fronting" draws one row per {alter} who was in front that day.
export const PIXEL_DOCK_LAYERS = [
  { id: "fronting", label: "{{Fronting}}" },
  { id: "activities", label: "Activities" },
  { id: "feelings", label: "Feelings" },
  { id: "symptoms", label: "Symptoms" },
  { id: "sleep", label: "Sleep" },
  { id: "locations", label: "Locations" },
  { id: "statuses", label: "Statuses" },
  { id: "journals", label: "Journals" },
];

// The status bar's items, in order (Display options → Bars → Status bar).
export const PIXEL_STATUS_ITEMS = [
  { id: "saved", label: "Saved" },
  { id: "synced", label: "Last sync" },
  { id: "nextPlan", label: "Next plan" },
  { id: "nextMeds", label: "Next medication" },
  { id: "look", label: "Look" },
  { id: "version", label: "Version" },
];


import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { reapplyFontFamily } from "@/lib/useAccessibility";

// The app's overall look (Display options → Shape → App look):
//   "smooth" — the look the app has always had (the default)
//   "pixel"  — the old-school pixel look: square bevelled panels, raised
//              buttons, sunken fields, pixel headings and a stepped wave.
//
// A LOOK, not a theme: it changes how the shared blocks are drawn (panels,
// buttons, fields, tabs, sheets, the wave) and never what a page does or
// which colours it uses. Colours stay the person's own; a "pixel" colour
// preset sits in Styles for anyone who wants that too. Alters always keep
// their own profile colours.
//
// Stored on SystemSettings.ui_look, a device look field (syncLook.js), so a
// phone and a desktop can each have their own. The applier sets
// data-ui-look on <html>; index.css carries every rule, all scoped to
// html[data-ui-look="pixel"], so the smooth look is untouched.

export const UI_LOOKS = Object.freeze({ SMOOTH: "smooth", PIXEL: "pixel" });
export const DEFAULT_UI_LOOK = UI_LOOKS.SMOOTH;

export function readUiLook(settings) {
  return settings?.ui_look === UI_LOOKS.PIXEL ? UI_LOOKS.PIXEL : DEFAULT_UI_LOOK;
}

export function useUiLook() {
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  return readUiLook(pickPrimarySystemSettings(list));
}

// The pixel look's own defaults, which the person can change
// (Display options → Shape → App look). Stored on SystemSettings.ui_pixel,
// a device look field like ui_look. Every key is optional: unset means the
// pixel look's built-in value. A widget's own look still wins over these.
export const PIXEL_LOOK_DEFAULTS = Object.freeze({ corners: 0, bevel: 2 });
const PIXEL_COLOUR_VARS = {
  outline: "--px-line",       // the dark outline round panels and buttons
  titleBar: "--px-bar",       // title bars of widgets, menus and the header
  floorTop: "--px-floor-top", // the page floor's gradient, top
  floorBottom: "--px-floor-bottom", // …and bottom
};
const HEX = /^#[0-9a-f]{3,8}$/i;
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
  return out;
}

// The editor's handle on the pixel defaults: Display options shows these
// rows IN PLACE OF the usual corner/edge rows while the pixel look is on.
export function usePixelLook() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const row = pickPrimarySystemSettings(list);
  const on = readUiLook(row) === UI_LOOKS.PIXEL;
  const px = readPixelLook(row);
  // Writes onto a fresh read, so two quick changes never undo each other.
  const write = async (patch) => {
    if (!row?.id) return;
    const fresh = pickPrimarySystemSettings(await base44.entities.SystemSettings.list()) || row;
    const next = { ...(fresh.ui_pixel && typeof fresh.ui_pixel === "object" ? fresh.ui_pixel : {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null || v === "") delete next[k];
      else next[k] = v;
    }
    await base44.entities.SystemSettings.update(fresh.id, { ui_pixel: next });
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };
  return { on, px, write };
}

// The CSS variables (on <html>) for the person's pixel defaults.
export function pixelLookVars(px = {}) {
  const v = {};
  if (px.corners != null) v["--px-corner"] = `${px.corners}px`;
  if (px.bevel != null) v["--px-bw"] = `${px.bevel}px`;
  for (const [k, cssVar] of Object.entries(PIXEL_COLOUR_VARS)) if (px[k]) v[cssVar] = px[k];
  return v;
}
const ALL_PIXEL_VARS = ["--px-corner", "--px-bw", ...Object.values(PIXEL_COLOUR_VARS)];

// Mount once near the top of the app tree (beside CornerModeApplier).
export function UiLookApplier() {
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const row = pickPrimarySystemSettings(list);
  const look = readUiLook(row);
  const px = look === UI_LOOKS.PIXEL ? readPixelLook(row) : {};
  const pxKey = JSON.stringify(px);
  useEffect(() => {
    const el = document.documentElement;
    if (look === UI_LOOKS.PIXEL) el.setAttribute("data-ui-look", "pixel");
    else el.removeAttribute("data-ui-look");
    for (const k of ALL_PIXEL_VARS) el.style.removeProperty(k);
    for (const [k, val] of Object.entries(pixelLookVars(px))) el.style.setProperty(k, val);
    if (px.type === "plain") el.setAttribute("data-px-type", "plain");
    else el.removeAttribute("data-px-type");
    // The pixel look's body font applies only while none is chosen.
    reapplyFontFamily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, pxKey]);
  return null;
}

// The header wave drawn in steps, for the pixel look. Same 240×32 box and
// the same rise and fall as the smooth wave (trough ~22, swell ±3), so the
// title sits where it always did. Built once.
export const STEPPED_WAVE_PATH = (() => {
  let d = "M240 0 L0 0";
  const step = 2;
  for (let x = 0; x < 240; x += step) {
    const y = 2 * Math.round((22 - 3 * Math.sin((2 * Math.PI * x) / 60)) / 2);
    d += ` V${y} H${x + step}`;
  }
  return `${d} V0 Z`;
})();

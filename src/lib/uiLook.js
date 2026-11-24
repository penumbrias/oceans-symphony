import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { writeSettings } from "@/lib/settingsWriter";
import { reapplyFontFamily } from "@/lib/useAccessibility";
import { UI_LOOKS, readPixelLook, PIXEL_COLOUR_VARS } from "@/lib/pixelLook";

// The pure readers and constants live in pixelLook.js (no React), so the
// new house's paint translator and its tests can use them; re-exported here
// so every existing import keeps working.
export { UI_LOOKS, DEFAULT_UI_LOOK, readUiLook, PIXEL_LOOK_DEFAULTS, readPixelLook, PIXEL_DOCK_LAYERS, PIXEL_STATUS_ITEMS } from "@/lib/pixelLook";
import { readUiLook } from "@/lib/pixelLook";

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

export function useUiLook() {
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  return readUiLook(pickPrimarySystemSettings(list));
}

// True while the pixel look is on AND the screen is computer-wide (the
// width the pixel frame's desktop panels use). Pages use it to switch to
// their mockup workspace layout; phones keep the stacked layout.
const DESK_QUERY = "(min-width: 1024px)";
export function usePixelDesk() {
  const pixel = useUiLook() === UI_LOOKS.PIXEL;
  const get = () => { try { return window.matchMedia(DESK_QUERY).matches; } catch { return false; } };
  const [wide, setWide] = useState(get);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(DESK_QUERY); } catch { return undefined; }
    const on = () => setWide(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return pixel && wide;
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
    // Empty values clear a key; the settings writer merges ui_pixel key by
    // key onto the fresh row (undefined = remove).
    const sub = {};
    for (const [k, v] of Object.entries(patch || {})) sub[k] = (v === undefined || v === null || v === "") ? undefined : v;
    await writeSettings({ ui_pixel: sub }, { queryClient: qc });
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

// localStorage key index.html reads before boot (see UiLookApplier).
export const UI_LOOK_HINT_KEY = "symphony_ui_look_hint_v1";

// Mount once near the top of the app tree (beside CornerModeApplier).
export function UiLookApplier() {
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const row = pickPrimarySystemSettings(list);
  const look = readUiLook(row);
  const px = look === UI_LOOKS.PIXEL ? readPixelLook(row) : {};
  // Only the parts that draw CSS re-run the applier.
  const pxKey = JSON.stringify({ ...px, statusBar: undefined, statusHidden: undefined, rail: undefined, railSide: undefined, dock: undefined, dockHidden: undefined });
  const ready = !!row;
  useEffect(() => {
    // Until the settings row is read, keep whatever index.html applied from
    // the device hint (so the unlock screen and first paint already match).
    if (!ready) return;
    const el = document.documentElement;
    // Device-only hint for the next launch's first paint and unlock screen.
    // A look name only, never data; not backed up (the look itself is).
    try { localStorage.setItem(UI_LOOK_HINT_KEY, look === UI_LOOKS.PIXEL ? "pixel" : "smooth"); } catch { /* storage blocked */ }
    if (look === UI_LOOKS.PIXEL) el.setAttribute("data-ui-look", "pixel");
    else el.removeAttribute("data-ui-look");
    for (const k of ALL_PIXEL_VARS) el.style.removeProperty(k);
    for (const [k, val] of Object.entries(pixelLookVars(px))) el.style.setProperty(k, val);
    if (px.type === "plain") el.setAttribute("data-px-type", "plain");
    else el.removeAttribute("data-px-type");
    // The pixel look's body font applies only while none is chosen.
    reapplyFontFamily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, look, pxKey]);
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

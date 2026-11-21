import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

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

// Mount once near the top of the app tree (beside CornerModeApplier).
export function UiLookApplier() {
  const look = useUiLook();
  useEffect(() => {
    const el = document.documentElement;
    if (look === UI_LOOKS.PIXEL) el.setAttribute("data-ui-look", "pixel");
    else el.removeAttribute("data-ui-look");
  }, [look]);
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

// Keep Android's back gesture off the sliders (v0.288.0).
//
// On Android 10+ a sideways drag that starts within the screen's edge zone
// is the system BACK gesture, whatever is drawn there. A slider whose track
// runs to the edge of a sheet loses its first drag to it ("sometimes the
// slider triggers back on my phone"). Two defences:
//   1. Every SliderRow track is inset from the edges (SettingRows.jsx).
//   2. On the installed Android app, the rectangles of the sliders on
//      screen are handed to the system as gesture-exclusion rects
//      (View.setSystemGestureExclusionRects, through the SystemSettings
//      plugin), so a drag that starts on a track is ours.
// Android honours at most 200dp of exclusion per edge, counted from the
// bottom of the screen — which is where the sheets open, so the sliders
// in view are the ones covered.
//
// Call `useEdgeSafeSliders(active)` from a sheet that holds sliders: while
// active it publishes the rects of every [data-edge-safe] element in view
// (after layout, on scroll and on resize) and clears them when it goes
// inactive. Elsewhere this is a no-op.

import { useEffect } from "react";
import { isNative, getNativePlatform } from "@/lib/platform";

let plugin = null;
let pluginTried = false;
async function getPlugin() {
  if (pluginTried) return plugin;
  pluginTried = true;
  try {
    if (!isNative() || getNativePlatform() !== "android") return null;
    const { registerPlugin } = await import("@capacitor/core");
    plugin = registerPlugin("SystemSettings");
  } catch { plugin = null; }
  return plugin;
}

let lastKey = "";
async function publish(rects) {
  const p = await getPlugin();
  if (!p) return;
  const key = JSON.stringify(rects);
  if (key === lastKey) return;
  lastKey = key;
  try { await p.setGestureExclusion({ rects }); } catch { /* older native build: the inset alone stands */ }
}

export function collectEdgeSafeRects() {
  if (typeof document === "undefined") return [];
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const out = [];
  for (const el of document.querySelectorAll("[data-edge-safe]")) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.top > vh) continue;
    // A little taller than the track so a thumb at rest is covered; the
    // whole width, so both edges are kept.
    out.push({
      left: 0, right: vw,
      top: Math.max(0, Math.round(r.top - 6)),
      bottom: Math.min(vh, Math.round(r.bottom + 6)),
    });
  }
  return out;
}

export function useEdgeSafeSliders(active, deps = []) {
  useEffect(() => {
    if (!active || !isNative() || getNativePlatform() !== "android") return undefined;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; publish(collectEdgeSafeRects()); });
    };
    // After the sheet's open animation, then on every scroll and resize.
    const timers = [60, 400, 900].map((ms) => setTimeout(schedule, ms));
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      timers.forEach(clearTimeout);
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      publish([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);
}

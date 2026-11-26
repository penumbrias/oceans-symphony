// Contrast helpers for the new house's colour roles (step 1.1). PURE.
//
// The person's colours are never changed in their settings. When a role
// built from them would be hard to read, the HOUSE draws a nearby readable
// shade instead (the paint translator separately offers the person a
// one-tap fix in Display options). The minimums are the building code's:
// 4.5:1 for text, 3:1 for borders, parts and the focus ring.

import { contrastRatio } from "@/lib/contrast";
import { mix, suggestReadable } from "@/house/paint/translate";

const ratio = (a, b) => contrastRatio(a, b) ?? 0;

// The lowest ratio `fg` reaches against any of `bgs`.
export function worstRatio(fg, bgs) {
  const list = (Array.isArray(bgs) ? bgs : [bgs]).filter(Boolean);
  if (!list.length) return 0;
  return Math.min(...list.map((bg) => ratio(fg, bg)));
}

// True when `fg` reads at `min` on every background in `bgs`.
export function meetsOnAll(fg, bgs, min) {
  return worstRatio(fg, bgs) >= min;
}

// A colour as close to `fg` as possible that reads at `min` on EVERY
// background in `bgs`. Keeps `fg` when it already does. Tries the
// translator's hue-keeping suggestion against the hardest background, then
// steps toward black and toward white; when no shade reaches `min` on all of
// them (backgrounds far apart in lightness), returns whichever of the
// candidates reads best on the worst one.
export function readableOnAll(fg, bgs, min) {
  const list = (Array.isArray(bgs) ? bgs : [bgs]).filter(Boolean);
  if (!fg || !list.length) return fg;
  if (meetsOnAll(fg, list, min)) return fg;
  const hardest = list.reduce((a, b) => (ratio(fg, a) <= ratio(fg, b) ? a : b));
  const candidates = [suggestReadable(fg, hardest, min)];
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    candidates.push(mix(fg, "#000000", t), mix(fg, "#FFFFFF", t));
  }
  for (const c of candidates) if (meetsOnAll(c, list, min)) return c;
  return candidates.reduce((a, b) => (worstRatio(a, list) >= worstRatio(b, list) ? a : b));
}

// Text drawn ON a filled colour (a primary button, a danger chip): white or
// black, whichever reads better. White is kept whenever it reaches `min`.
export function onFill(fill, min = 4.5) {
  const w = ratio("#FFFFFF", fill);
  if (w >= min) return "#FFFFFF";
  return ratio("#000000", fill) > w ? "#000000" : "#FFFFFF";
}

// Every pair the house promises, as [foreground role, background roles, min].
// The sample page draws this table; the test runs it over every theme.
export const ROLE_PAIRS = Object.freeze([
  ["text", ["page", "panel", "raised", "sunken"], 4.5],
  ["muted", ["page", "panel", "sunken"], 4.5],
  ["accentText", ["page", "panel"], 4.5],
  ["dangerText", ["page", "panel"], 4.5],
  ["onAccent", ["accent"], 4.5],
  ["onDanger", ["danger"], 4.5],
  ["accent", ["page", "panel"], 3],
  ["border", ["page", "panel", "sunken"], 3],
  ["focus", ["page", "panel"], 3],
]);

// Every promised pair that a set of roles misses: [{ fg, bg, ratio, min }].
export function roleFailures(roles) {
  const out = [];
  for (const [fg, bgs, min] of ROLE_PAIRS) {
    for (const bg of bgs) {
      const r = Math.round(ratio(roles[fg], roles[bg]) * 100) / 100;
      if (r < min) out.push({ fg, bg, ratio: r, min });
    }
  }
  return out;
}

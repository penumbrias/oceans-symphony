// Which of the timeline's layers show, kept per device (board 01-Main:
// "the timeline widget remembers per page"). The Home room's dock and the
// Timeline room share the layers (show/hide, order, colour); what each
// page shows (a day, six hours or a week, and whose) is kept per page
// (board 09-TimelineOptions: Show, Whose). ONE localStorage field, listed
// in BACKUP_LS_KEYS so the settings mirror keeps it through a cache clear.
// It holds no record. Every write is a fresh read, one layer changed, and
// an unreadable value is never overwritten blind (kept under *_kept first).
//
// Pure apart from the storage it is handed (scripts/test-house-home.mjs).

import { DAY_LAYERS, DEFAULT_HIDDEN_LAYERS, FIRST_LAYER_IDS } from "@/house/home/dayLayers";

export const HOUSE_HOME_LAYERS_KEY = "symphony_house_home_layers_v1";
export const HOUSE_HOME_LAYERS_KEPT_KEY = "symphony_house_home_layers_v1_kept";
export const HOUSE_HOME_LAYERS_EVENT = "symphony-house-home-layers";

const KNOWN = new Set(DAY_LAYERS.map((l) => l.id));
const store = (s) => s || (typeof localStorage !== "undefined" ? localStorage : null);

function readObj(storage) {
  let raw = null;
  try { raw = store(storage)?.getItem(HOUSE_HOME_LAYERS_KEY) ?? null; } catch { return null; }
  if (raw == null) return null;
  try { const v = JSON.parse(raw); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; }
}

/** The hidden layer ids (the defaults when nothing is saved or it can't be read). */
export function readHiddenLayers(storage) {
  const v = readObj(storage);
  if (!v || !Array.isArray(v.hidden)) return [...DEFAULT_HIDDEN_LAYERS];
  const hidden = v.hidden.filter((id) => KNOWN.has(id));
  // A layer newer than the saved list keeps its default (hidden or shown).
  const seen = new Set(Array.isArray(v.seen) ? v.seen : FIRST_LAYER_IDS);
  for (const id of DEFAULT_HIDDEN_LAYERS) if (!seen.has(id) && !hidden.includes(id)) hidden.push(id);
  return hidden;
}

/** The layers in the person's order (every known layer, new ones last). */
export function readLayerOrder(storage) {
  const base = DAY_LAYERS.map((l) => l.id);
  let raw = null;
  try { raw = store(storage)?.getItem(HOUSE_HOME_LAYERS_KEY) ?? null; } catch { return base; }
  if (raw == null) return base;
  try {
    const v = JSON.parse(raw);
    if (v && Array.isArray(v.order)) {
      const seen = v.order.filter((id, i, a) => KNOWN.has(id) && a.indexOf(id) === i);
      return [...seen, ...base.filter((id) => !seen.includes(id))];
    }
  } catch { /* fall through */ }
  return base;
}

// The one writer: a fresh read, one change, an unreadable value kept first.
function writePrefs(change, storage) {
  const s = store(storage);
  if (!s) return null;
  let raw = null;
  try { raw = s.getItem(HOUSE_HOME_LAYERS_KEY); } catch { return null; }
  let base = null;
  if (raw != null) {
    try { const v = JSON.parse(raw); if (v && typeof v === "object" && !Array.isArray(v)) base = v; } catch { /* unreadable */ }
    if (!base) { try { s.setItem(HOUSE_HOME_LAYERS_KEPT_KEY, raw); } catch { return null; } }
  }
  // Every write says which layers it knew, so a later layer keeps its default.
  const next = { ...(base || {}), ...change(base || {}), seen: DAY_LAYERS.map((l) => l.id) };
  try { s.setItem(HOUSE_HOME_LAYERS_KEY, JSON.stringify(next)); } catch { return null; }
  try { window.dispatchEvent(new CustomEvent(HOUSE_HOME_LAYERS_EVENT)); } catch { /* no window */ }
  return next;
}

/** Show or hide one layer. Returns the new hidden list (or null if storage refused). */
export function setLayerShown(id, shown, storage) {
  if (!KNOWN.has(id)) return null;
  const next = writePrefs(() => {
    const hidden = new Set(readHiddenLayers(storage));
    if (shown) hidden.delete(id); else hidden.add(id);
    return { hidden: [...hidden] };
  }, storage);
  return next ? next.hidden : null;
}

/** Keep a new layer order. Unknown ids are dropped; returns the order kept. */
export function setLayerOrder(ids, storage) {
  const clean = (ids || []).filter((id, i, a) => KNOWN.has(id) && a.indexOf(id) === i);
  if (!clean.length) return null;
  const next = writePrefs(() => ({ order: clean, hidden: readHiddenLayers(storage) }), storage);
  return next ? readLayerOrder(storage) : null;
}

// ── Colours (board 09: "Tap one to set its colour") ───────────────────
const HEX = /^#[0-9a-f]{6}$/i;

/** The person's own layer colours: { layerId: "#rrggbb" }. */
export function readLayerColours(storage) {
  const v = readObj(storage);
  const out = {};
  if (v && v.colours && typeof v.colours === "object") {
    for (const [id, c] of Object.entries(v.colours)) if (KNOWN.has(id) && HEX.test(String(c))) out[id] = String(c);
  }
  return out;
}

/** Set (a "#rrggbb") or clear (null) one layer's colour. */
export function setLayerColour(id, colour, storage) {
  if (!KNOWN.has(id)) return null;
  if (colour != null && !HEX.test(String(colour))) return null;
  const next = writePrefs(() => {
    const colours = { ...readLayerColours(storage) };
    if (colour == null) delete colours[id]; else colours[id] = String(colour);
    return { colours, hidden: readHiddenLayers(storage) };
  }, storage);
  return next ? readLayerColours(storage) : null;
}

// ── What each page shows (board 09: Show · Whose) ─────────────────────
export const TIMELINE_RANGES = Object.freeze(["day", "hours6", "week"]);
const VIEW_DEFAULTS = Object.freeze({ home: { range: "hours6", whose: null }, timeline: { range: "day", whose: null } });

/** { range: "day"|"hours6"|"week", whose: alterId|null } for a page ("home" | "timeline"). */
export function readTimelineView(page, storage) {
  const def = VIEW_DEFAULTS[page] || VIEW_DEFAULTS.timeline;
  const v = readObj(storage);
  const mine = v && v.views && typeof v.views === "object" ? v.views[page] : null;
  const range = mine && TIMELINE_RANGES.includes(mine.range) ? mine.range : def.range;
  const whose = mine && typeof mine.whose === "string" && mine.whose ? mine.whose : null;
  return { range, whose };
}

/** Change what one page shows. Returns the page's view, or null if storage refused. */
export function setTimelineView(page, patch = {}, storage) {
  if (!VIEW_DEFAULTS[page]) return null;
  const cur = readTimelineView(page, storage);
  const range = TIMELINE_RANGES.includes(patch.range) ? patch.range : cur.range;
  const whose = "whose" in patch ? (typeof patch.whose === "string" && patch.whose ? patch.whose : null) : cur.whose;
  const next = writePrefs((base) => {
    const views = base.views && typeof base.views === "object" ? { ...base.views } : {};
    views[page] = { range, whose };
    return { views, hidden: readHiddenLayers(storage) };
  }, storage);
  return next ? readTimelineView(page, storage) : null;
}

/**
 * Reset content (board 09): every layer back to shown/hidden as new, in
 * the first order, no colours of their own, and this page's Show and Whose
 * back to their defaults. Returns the text it replaced, for Undo.
 */
export function resetTimelinePrefs(page, storage) {
  const s = store(storage);
  let before = null;
  try { before = s?.getItem(HOUSE_HOME_LAYERS_KEY) ?? null; } catch { return { ok: false, before: null }; }
  const next = writePrefs((base) => {
    const views = base.views && typeof base.views === "object" ? { ...base.views } : {};
    delete views[page];
    return { views, hidden: [...DEFAULT_HIDDEN_LAYERS], order: DAY_LAYERS.map((l) => l.id), colours: {} };
  }, storage);
  return { ok: !!next, before };
}

/** Undo a reset: put back the text resetTimelinePrefs replaced. */
export function restoreTimelinePrefs(before, storage) {
  const s = store(storage);
  if (!s) return false;
  try {
    if (before == null) {
      // There was nothing before: an empty record reads as the defaults.
      s.setItem(HOUSE_HOME_LAYERS_KEY, JSON.stringify({ seen: DAY_LAYERS.map((l) => l.id), hidden: [...DEFAULT_HIDDEN_LAYERS] }));
    } else {
      s.setItem(HOUSE_HOME_LAYERS_KEY, before);
    }
  } catch { return false; }
  try { window.dispatchEvent(new CustomEvent(HOUSE_HOME_LAYERS_EVENT)); } catch { /* no window */ }
  return true;
}

// Which of the Home timeline's layers show, kept per device (board 01-Main:
// "the timeline widget remembers per page"). ONE localStorage field, listed
// in BACKUP_LS_KEYS so the settings mirror keeps it through a cache clear.
// It holds no record. Every write is a fresh read, one layer changed, and
// an unreadable value is never overwritten blind (kept under *_kept first).
//
// Pure apart from the storage it is handed (scripts/test-house-home.mjs).

import { DAY_LAYERS, DEFAULT_HIDDEN_LAYERS } from "@/house/home/dayLayers";

export const HOUSE_HOME_LAYERS_KEY = "symphony_house_home_layers_v1";
export const HOUSE_HOME_LAYERS_KEPT_KEY = "symphony_house_home_layers_v1_kept";
export const HOUSE_HOME_LAYERS_EVENT = "symphony-house-home-layers";

const KNOWN = new Set(DAY_LAYERS.map((l) => l.id));
const store = (s) => s || (typeof localStorage !== "undefined" ? localStorage : null);

/** The hidden layer ids (the defaults when nothing is saved or it can't be read). */
export function readHiddenLayers(storage) {
  let raw = null;
  try { raw = store(storage)?.getItem(HOUSE_HOME_LAYERS_KEY) ?? null; } catch { return [...DEFAULT_HIDDEN_LAYERS]; }
  if (raw == null) return [...DEFAULT_HIDDEN_LAYERS];
  try {
    const v = JSON.parse(raw);
    if (v && Array.isArray(v.hidden)) return v.hidden.filter((id) => KNOWN.has(id));
  } catch { /* fall through */ }
  return [...DEFAULT_HIDDEN_LAYERS];
}

/** Show or hide one layer. Returns the new hidden list (or null if storage refused). */
export function setLayerShown(id, shown, storage) {
  const s = store(storage);
  if (!s || !KNOWN.has(id)) return null;
  let raw = null;
  try { raw = s.getItem(HOUSE_HOME_LAYERS_KEY); } catch { return null; }
  let base = null;
  if (raw != null) {
    try { const v = JSON.parse(raw); if (v && typeof v === "object" && !Array.isArray(v)) base = v; } catch { /* unreadable */ }
    if (!base) { try { s.setItem(HOUSE_HOME_LAYERS_KEPT_KEY, raw); } catch { return null; } }
  }
  const hidden = new Set(base && Array.isArray(base.hidden) ? base.hidden : DEFAULT_HIDDEN_LAYERS);
  if (shown) hidden.delete(id); else hidden.add(id);
  const next = { ...(base || {}), hidden: [...hidden] };
  try { s.setItem(HOUSE_HOME_LAYERS_KEY, JSON.stringify(next)); } catch { return null; }
  try { window.dispatchEvent(new CustomEvent(HOUSE_HOME_LAYERS_EVENT)); } catch { /* no window */ }
  return next.hidden;
}

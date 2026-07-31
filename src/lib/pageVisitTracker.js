// Page-visit tracking for the experimental homescreen's "Frequently opened"
// widget. Per-system localStorage (psGetItem/psSetItem) with gentle decay so
// last month's habits don't drown out this week's.
//
// Deliberately NOT in BACKUP_LS_KEYS: visit counts are device-local usage
// stats (like the native reminder-id logs) — they regenerate naturally on a
// new device and carrying them over would just be stale noise.
//
// Shape: { pages: { [path]: { c: count, t: lastVisitISO } }, decayedAt: ISO }

import { psGetItem, psSetItem } from "@/lib/perSystemStorage";

const KEY = "symphony_page_visits_v1";
const DECAY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // weekly sweep
const DECAY_FACTOR = 0.5; // counts halve each sweep
const MAX_TRACKED = 80; // hard cap on distinct paths kept

function read() {
  try {
    const raw = psGetItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && parsed.pages && typeof parsed.pages === "object") {
      return parsed;
    }
  } catch { /* corrupted — start fresh */ }
  return { pages: {}, decayedAt: new Date().toISOString() };
}

function write(data) {
  try { psSetItem(KEY, JSON.stringify(data)); } catch { /* storage off */ }
}

// Halve every count when the last sweep is a week old; drop entries that
// decay below 0.5 (and the least-used overflow beyond MAX_TRACKED).
function applyDecay(data) {
  const last = Date.parse(data.decayedAt || "") || 0;
  if (Date.now() - last < DECAY_INTERVAL_MS) return data;
  const pages = {};
  for (const [path, entry] of Object.entries(data.pages)) {
    const c = (entry?.c || 0) * DECAY_FACTOR;
    if (c >= 0.5) pages[path] = { ...entry, c };
  }
  return { pages, decayedAt: new Date().toISOString() };
}

export function recordPageVisit(path) {
  if (!path || typeof path !== "string") return;
  const data = applyDecay(read());
  const entry = data.pages[path] || { c: 0, t: null };
  data.pages[path] = { c: entry.c + 1, t: new Date().toISOString() };
  const paths = Object.keys(data.pages);
  if (paths.length > MAX_TRACKED) {
    paths
      .sort((a, b) => (data.pages[a].c || 0) - (data.pages[b].c || 0))
      .slice(0, paths.length - MAX_TRACKED)
      .forEach((p) => delete data.pages[p]);
  }
  write(data);
}

// Top visited paths, most-visited first. Returns [{ path, count }].
export function getFrequentPages(limit = 8) {
  const data = applyDecay(read());
  return Object.entries(data.pages)
    .map(([path, e]) => ({ path, count: e?.c || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

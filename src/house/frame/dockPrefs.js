// The frame's fixed docks, kept per device and per page (new house step 2.1;
// plan §3 "Edit mode": "kept per device, per page, in one new add-only
// settings field, backed up").
//
// ONE field: localStorage HOUSE_LAYOUT_KEY, listed in BACKUP_LS_KEYS, so the
// settings mirror keeps it through an Android cache clear and a backup
// carries it. It is device-local on purpose: a desk and a tablet want
// different docks. Every write goes through saveDock() here:
//   - a fresh read of the field, then ONE dock of ONE page changed, every
//     other page and key kept as it was (add-only: nothing is ever removed);
//   - the same choice is also kept as "*", the default for pages this device
//     hasn't arranged yet, so a person who hides the right dock once doesn't
//     have to hide it on every page;
//   - sizes are clamped to the building code's min/max (§4) on the way in
//     AND on the way out, so a hand-edited or older value can't break a page;
//   - an unreadable field is never overwritten blind: its raw text is kept
//     under HOUSE_LAYOUT_KEPT_KEY first.
// Edit mode (step 4.1) will add arrangements to the same field.
//
// Pure apart from the storage it is handed, so scripts/test-house-frame.mjs
// can run it under node.

export const HOUSE_LAYOUT_KEY = "symphony_house_layout_v1";
export const HOUSE_LAYOUT_KEPT_KEY = "symphony_house_layout_v1_kept";
export const HOUSE_LAYOUT_EVENT = "symphony-house-layout";

export const DOCKS = ["left", "right", "bottom"];
export const DOCK_TABS = ["info", "layers", "history", "help"];

// Building code §4, in rem. `max: "half"` = half the page height.
export const DOCK_LIMITS = {
  full: {
    left: { min: 13, max: 22, def: 16 },
    right: { min: 18, max: 28, def: 20 },
    bottom: { min: 8, max: "half", def: 12.5 },
  },
  compact: {
    left: { min: 13, max: 18, def: 16 },
    right: { min: 20, max: 26, def: 20 },
    bottom: { min: 8, max: "half", def: 12.5 },
  },
};

// Shown when a page and "*" say nothing. The right dock opens on Info in the
// full studio; in the compact studio it is a sheet, so it starts closed. The
// left panel and the bottom dock start closed.
export function defaultDock(dock, size = "full") {
  if (dock === "right") return { shown: size === "full", size: DOCK_LIMITS[size === "compact" ? "compact" : "full"].right.def, tab: "info" };
  const lim = DOCK_LIMITS[size === "compact" ? "compact" : "full"][dock] || { def: 16 };
  return { shown: false, size: lim.def };
}

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** A dock's size, kept inside the building code's limits. */
export function clampDockSize(dock, size, sizeClass = "full", { pageHeightRem = 50 } = {}) {
  const lim = DOCK_LIMITS[sizeClass === "compact" ? "compact" : "full"][dock];
  if (!lim) return null;
  const max = lim.max === "half" ? Math.max(lim.min, pageHeightRem / 2) : lim.max;
  const n = Number(size);
  if (!Number.isFinite(n)) return lim.def;
  return Math.round(Math.min(max, Math.max(lim.min, n)) * 4) / 4;
}

/** The folded page key: every profile of one kind is one page. */
export function layoutPageKey(pathname) {
  const p = String(pathname || "/").split(/[?#]/)[0] || "/";
  const prof = p.match(/^\/(alter|group|contacts|location|bulletin)\/[^/]+/);
  if (prof) return `/${prof[1]}/:id`;
  const mod = p.match(/^\/mod\/([^/]+)\/[^/]+/);
  if (mod) return `/mod/${mod[1]}/:page`;
  return p.length > 1 ? p.replace(/\/+$/, "") : "/";
}

/** Parse the stored field. Never throws; `ok: false` means it was unreadable. */
export function parseLayout(raw) {
  if (raw == null || raw === "") return { ok: true, layout: { v: 1, pages: {} } };
  try {
    const v = JSON.parse(raw);
    if (!isObj(v)) return { ok: false, layout: { v: 1, pages: {} } };
    return { ok: true, layout: { ...v, v: v.v || 1, pages: isObj(v.pages) ? v.pages : {} } };
  } catch {
    return { ok: false, layout: { v: 1, pages: {} } };
  }
}

function cleanDock(dock, entry, sizeClass, opts) {
  const base = defaultDock(dock, sizeClass);
  if (!isObj(entry)) return base;
  const out = { ...base };
  if (typeof entry.shown === "boolean") out.shown = entry.shown;
  if (entry.size != null) out.size = clampDockSize(dock, entry.size, sizeClass, opts);
  if (dock === "right" && DOCK_TABS.includes(entry.tab)) out.tab = entry.tab;
  return out;
}

/** What one dock of one page looks like: the page's own choice, else "*", else the default. */
export function dockFor(layout, pageKey, dock, sizeClass = "full", opts = {}) {
  const pages = isObj(layout?.pages) ? layout.pages : {};
  const own = isObj(pages[pageKey]) ? pages[pageKey][dock] : null;
  const any = isObj(pages["*"]) ? pages["*"][dock] : null;
  // Size lives per size class, so the compact studio never inherits a full-width dock.
  const pick = (e) => (isObj(e) ? { ...e, size: isObj(e.sizes) ? e.sizes[sizeClass] : undefined } : null);
  const merged = { ...(pick(any) || {}), ...(pick(own) || {}) };
  return cleanDock(dock, Object.keys(merged).length ? merged : null, sizeClass, opts);
}

/** A new layout with one dock of one page (and "*") changed. Never removes anything. */
export function withDock(layout, pageKey, dock, patch, { sizeClass = "full", now = Date.now(), pageHeightRem } = {}) {
  if (!DOCKS.includes(dock)) return layout;
  const pages = isObj(layout?.pages) ? { ...layout.pages } : {};
  const apply = (key) => {
    const page = isObj(pages[key]) ? { ...pages[key] } : {};
    const cur = isObj(page[dock]) ? { ...page[dock] } : {};
    if (typeof patch.shown === "boolean") cur.shown = patch.shown;
    if (dock === "right" && DOCK_TABS.includes(patch.tab)) cur.tab = patch.tab;
    if (patch.size != null) {
      cur.sizes = { ...(isObj(cur.sizes) ? cur.sizes : {}), [sizeClass]: clampDockSize(dock, patch.size, sizeClass, { pageHeightRem }) };
    }
    page[dock] = cur;
    page._ut = now;
    pages[key] = page;
  };
  apply(pageKey);
  if (pageKey !== "*") apply("*");
  return { ...(isObj(layout) ? layout : {}), v: 1, pages };
}

function store(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

export function loadLayout(storage) {
  const s = store(storage);
  try { return parseLayout(s ? s.getItem(HOUSE_LAYOUT_KEY) : null).layout; } catch { return { v: 1, pages: {} }; }
}

/** The one writer. Fresh read, one change, write back. Returns the new layout (or null if storage refused). */
export function saveDock(pageKey, dock, patch, opts = {}) {
  const s = store(opts.storage);
  if (!s) return null;
  let raw = null;
  try { raw = s.getItem(HOUSE_LAYOUT_KEY); } catch { return null; }
  const parsed = parseLayout(raw);
  if (!parsed.ok) {
    // Keep what was there before writing over it.
    try { s.setItem(HOUSE_LAYOUT_KEPT_KEY, String(raw)); } catch { return null; }
  }
  const next = withDock(parsed.layout, pageKey, dock, patch, opts);
  try { s.setItem(HOUSE_LAYOUT_KEY, JSON.stringify(next)); } catch { return null; }
  try { window.dispatchEvent(new CustomEvent(HOUSE_LAYOUT_EVENT)); } catch { /* no window */ }
  return next;
}

// The house's Alters room (plan step 5.3, "who we are"): the pure rules
// behind boards 03-Alters (the directory) and 12-AlterProfilePhone (the
// profile). No React, no records written: tested by
// scripts/test-house-alters.mjs.
//
// The directory keeps the OLD page's keys (sort, filters, layout, "hide
// grouped", folded groups), so a view set up in one house carries to the
// other.

import { getMemberAlters, getAltersInsideSubsystems, getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";
import { alterRoles, hasRole } from "@/lib/alterRoles";

const H = 3600000;
const DAY = 24 * H;

// ── Where the room is drawn ─────────────────────────────────────────────
/** "directory" on /Home, "profile" on /alter/:id, else null. */
export function altersRoomOf(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  if (p === "/Home") return "directory";
  if (/^\/alter\/[^/]+$/.test(p)) return "profile";
  return null;
}

// ── The old page's keys (carried between the houses) ────────────────────
export const KEYS = Object.freeze({
  sort: "alterGrid_sortMode", // sessionStorage
  filters: "alterGrid_filters", // sessionStorage
  layout: "alter_display_mode", // localStorage: "list" | "2".."5"
  hideGrouped: "alter_hide_grouped", // localStorage: "true" | "false"
  folded: "pxa_groups_collapsed", // sessionStorage: JSON id list
});
export const SORT_IDS = Object.freeze(["manual", "alpha-asc", "alpha-desc", "most", "least"]);
export const LAYOUTS = Object.freeze(["list", "2", "3", "4", "5"]);
export const DEFAULT_FILTERS = Object.freeze({ nested: true, groupIds: [], subsystemIds: [], roles: [], mode: "any" });

const safeGet = (store, k) => { try { return store?.getItem(k) ?? null; } catch { return null; } };
const safeSet = (store, k, v) => { try { store?.setItem(k, v); } catch { /* storage off */ } };

/** The directory's view, read from the old keys (bad values fall back). */
export function readDirectoryPrefs({ session, local } = {}) {
  const sort = safeGet(session, KEYS.sort);
  let filters = { ...DEFAULT_FILTERS };
  try {
    const raw = JSON.parse(safeGet(session, KEYS.filters) || "null");
    if (raw && typeof raw === "object") {
      filters = {
        nested: raw.nested !== false,
        groupIds: Array.isArray(raw.groupIds) ? raw.groupIds : [],
        subsystemIds: Array.isArray(raw.subsystemIds) ? raw.subsystemIds : [],
        roles: Array.isArray(raw.roles) ? raw.roles : [],
        mode: raw.mode === "all" ? "all" : "any",
      };
    }
  } catch { /* bad JSON: defaults */ }
  const layoutRaw = safeGet(local, KEYS.layout) || safeGet(local, "alter_grid_cols");
  let folded = [];
  try { const f = JSON.parse(safeGet(session, KEYS.folded) || "[]"); if (Array.isArray(f)) folded = f; } catch { /* defaults */ }
  return {
    sort: SORT_IDS.includes(sort) ? sort : null,
    filters,
    // The house's default is board 03's Grid (the old page's was a list).
    layout: LAYOUTS.includes(layoutRaw) ? layoutRaw : "5",
    hideGrouped: safeGet(local, KEYS.hideGrouped) === "true",
    folded,
  };
}

export function writeDirectoryPref({ session, local } = {}, key, value) {
  if (key === "sort") safeSet(session, KEYS.sort, String(value));
  else if (key === "filters") safeSet(session, KEYS.filters, JSON.stringify(value));
  else if (key === "layout") safeSet(local, KEYS.layout, String(value));
  else if (key === "hideGrouped") safeSet(local, KEYS.hideGrouped, value ? "true" : "false");
  else if (key === "folded") safeSet(session, KEYS.folded, JSON.stringify(value || []));
}

// ── Grid · List · Tree (board 03's one radio row) ───────────────────────
/** The radio's value from the stored layout and the nested filter. */
export function viewOf(layout, nested) {
  if (layout !== "list") return "grid";
  return nested === false ? "list" : "tree";
}
/** What picking a view writes: the layout and whether the list nests. */
export function pickView(view, { layout, lastCols = "5" } = {}) {
  if (view === "grid") return { layout: layout !== "list" ? layout : (LAYOUTS.includes(lastCols) && lastCols !== "list" ? lastCols : "5"), nested: true };
  return { layout: "list", nested: view === "tree" };
}

// ── Sort ────────────────────────────────────────────────────────────────
export function sortOptions(terms = {}, { manual = false } = {}) {
  const fr = terms.fronting || "fronting";
  return [
    ...(manual ? [{ id: "manual", label: "My order" }] : []),
    { id: "alpha-asc", label: "A to Z" },
    { id: "alpha-desc", label: "Z to A" },
    { id: "most", label: `Most ${fr} time first` },
    { id: "least", label: `Least ${fr} time first` },
  ];
}

// ── Sessions ────────────────────────────────────────────────────────────
// A session's members: the per-alter shape, or a legacy grouped row.
export const membersOf = (s) => (s?.alter_id ? [s.alter_id] : [s?.primary_alter_id, ...(s?.co_fronter_ids || [])].filter(Boolean));

/** id → 0 (primary) | 1 (co-fronting); absent = not in front. */
export function frontRanks(activeSessions = []) {
  const map = {};
  for (const s of activeSessions || []) {
    if (s?.alter_id) { if (!(s.alter_id in map)) map[s.alter_id] = s.is_primary ? 0 : 1; continue; }
    if (s?.primary_alter_id) map[s.primary_alter_id] = 0;
    for (const id of s?.co_fronter_ids || []) if (!(id in map)) map[id] = 1;
  }
  return map;
}

/** id → total ms in front (finished sessions, as the old sort counts). */
export function frontTotals(sessions = []) {
  const t = {};
  for (const s of sessions || []) {
    const dur = s?.end_time && s?.start_time ? new Date(s.end_time) - new Date(s.start_time) : 0;
    if (!(dur > 0)) continue;
    for (const id of membersOf(s)) t[id] = (t[id] || 0) + dur;
  }
  return t;
}

/** id → the last time they left front (ms). */
export function lastFrontTimes(sessions = []) {
  const m = {};
  for (const s of sessions || []) {
    const end = s?.end_time ? new Date(s.end_time).getTime() : null;
    if (!end || Number.isNaN(end)) continue;
    for (const id of membersOf(s)) if (!m[id] || m[id] < end) m[id] = end;
  }
  return m;
}

/** "2 h ago", "yesterday", "last week"… (board 03's card foot). */
export function agoWords(ms, now = Date.now()) {
  const d = now - ms;
  if (!(d >= 0)) return "";
  if (d < H) return `${Math.max(1, Math.round(d / 60000))} min ago`;
  if (d < DAY) return `${Math.round(d / H)} h ago`;
  const days = Math.floor(d / DAY);
  if (days < 2) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "a month ago";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return days < 730 ? "a year ago" : `${Math.floor(days / 365)} years ago`;
}

/** A card's front line: "fronting", "co-fronting", or when they were last there. */
export function frontLine(alterId, { ranks = {}, last = {}, terms = {}, now = Date.now() } = {}) {
  const fr = terms.fronting || "fronting";
  if (ranks[alterId] === 0) return { words: fr, on: true };
  if (ranks[alterId] === 1) return { words: `co-${fr}`, on: true };
  return { words: last[alterId] ? agoWords(last[alterId], now) : "", on: false };
}

const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The last seven days for one alter, today last: each day's name, hours and
 * the stretches they were in front as fractions of the day (board 12's
 * "Fronting, last 7 days" bars; board 03's week chart reads `hours`).
 */
export function weekOf(alterId, sessions = [], now = Date.now(), { from = "rolling" } = {}) {
  const today = startOfDay(now);
  // "monday": this calendar week, Mon to Sun (boards 03 and 12); days still
  // to come are empty. "rolling": the last seven days, today last.
  const back = from === "monday" ? (new Date(today).getDay() + 6) % 7 : 6;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - back + i);
    const start = d.getTime();
    const e = new Date(d); e.setDate(e.getDate() + 1);
    return { start, end: e.getTime(), name: WEEKDAY[d.getDay()], bars: [] };
  });
  for (const s of sessions || []) {
    if (!s?.start_time || !membersOf(s).includes(alterId)) continue;
    const a = new Date(s.start_time).getTime();
    const b = Math.min(s.end_time ? new Date(s.end_time).getTime() : now, now);
    if (!(b > a)) continue;
    for (const d of days) {
      const lo = Math.max(a, d.start); const hi = Math.min(b, d.end);
      if (hi <= lo) continue;
      const span = d.end - d.start;
      d.bars.push({ from: (lo - d.start) / span, to: (hi - d.start) / span });
    }
  }
  // Hours come from the merged bars, so two overlapping rows (a duplicate,
  // or a legacy grouped row beside a per-alter one) are never counted twice.
  return days.map((d) => {
    const bars = mergeBars(d.bars);
    const span = d.end - d.start;
    return { name: d.name, start: d.start, future: d.start > now, hours: bars.reduce((n, b) => n + (b.to - b.from) * span, 0) / H, bars };
  });
}

function mergeBars(bars) {
  const s = [...bars].sort((x, y) => x.from - y.from);
  const out = [];
  for (const b of s) {
    const last = out[out.length - 1];
    if (last && b.from <= last.to) last.to = Math.max(last.to, b.to);
    else out.push({ ...b });
  }
  return out;
}

/** "31 h", "45 min", "0 h". */
export function hoursWords(hours) {
  if (!(hours > 0)) return "0 h";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  return `${Math.round(hours)} h`;
}

// ── Find ────────────────────────────────────────────────────────────────
const plain = (v) => String(v ?? "").replace(/<[^>]*>/g, " ");

/** The words "Find" looks through: name, alias, role, pronouns and every field value. */
export function findText(alter, systemFields = []) {
  const parts = [alter?.name, alter?.alias, alter?.role, alter?.pronouns, ...(alterRoles(alter) || [])];
  const cf = alter?.custom_fields || {};
  for (const f of systemFields || []) {
    const v = cf[f.id];
    if (v != null && v !== "" && typeof v !== "object") parts.push(f.name, v);
  }
  if (Array.isArray(alter?.alter_custom_fields)) {
    for (const f of alter.alter_custom_fields) if (f?.value) parts.push(f.name, f.value);
  }
  for (const t of Array.isArray(alter?.tags) ? alter.tags : []) parts.push(t);
  return parts.filter((x) => x != null && x !== "").map(plain).join(" ").toLowerCase();
}

/** Every word typed must be found (quotes keep a phrase). */
export function matchesFind(alter, query, systemFields = []) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const words = [];
  q.replace(/"([^"]+)"|(\S+)/g, (_, a, b) => { words.push(a || b); return ""; });
  const hay = findText(alter, systemFields);
  return words.every((w) => hay.includes(w));
}

/** Ids of alters in at least one group (new member keys and the legacy `alter.groups`). */
export function groupedIds(groups = [], alters = []) {
  const ids = new Set();
  for (const g of groups || []) for (const a of getMemberAlters(g, alters)) ids.add(a.id);
  for (const a of alters || []) if ((a.groups || []).length > 0) ids.add(a.id);
  return ids;
}

/**
 * The directory's list: everything the old page's filters, sort and nesting
 * do, in one pure step. Fronters always lead (owner), then the chosen order.
 */
export function directoryList({ alters = [], groups = [], systemFields = [], search = "", filters = DEFAULT_FILTERS, hideGrouped = false, sort = "alpha-asc", ranks = {}, totals = {}, manualIndex = null }) {
  const grouped = hideGrouped ? groupedIds(groups, alters) : null;
  const roles = filters.roles || [];
  const filtered = alters.filter((a) => !a.is_archived
    && (roles.length === 0 || roles.some((r) => hasRole(a, r) || (a.role || "").trim() === r))
    && (!grouped || !grouped.has(a.id))
    && matchesFind(a, search, systemFields));
  filtered.sort((a, b) => {
    const ra = ranks[a.id] ?? 2; const rb = ranks[b.id] ?? 2;
    if (ra !== rb) return ra - rb;
    if (sort === "manual" && manualIndex) {
      const ma = manualIndex.get(a.id); const mb = manualIndex.get(b.id);
      if (ma !== undefined && mb !== undefined) return ma - mb;
      if (ma !== undefined) return -1;
      if (mb !== undefined) return 1;
    }
    if (sort === "most") return (totals[b.id] || 0) - (totals[a.id] || 0);
    if (sort === "least") return (totals[a.id] || 0) - (totals[b.id] || 0);
    const cmp = (a.name || "").localeCompare(b.name || "");
    return sort === "alpha-desc" ? -cmp : cmp;
  });
  const picked = [...(filters.groupIds || []), ...(filters.subsystemIds || [])];
  let memberIds = null;
  if (picked.length) {
    const sets = picked.map((id) => {
      const g = groups.find((x) => x.id === id);
      return g ? new Set(getMemberAlters(g, alters).map((a) => a.id)) : new Set();
    });
    if (filters.mode === "all") memberIds = sets.reduce((acc, s) => (acc === null ? s : new Set([...acc].filter((id) => s.has(id)))), null) || new Set();
    else { memberIds = new Set(); sets.forEach((s) => s.forEach((id) => memberIds.add(id))); }
  }
  const flat = !!String(search).trim() || !!memberIds || roles.length > 0 || filters.nested === false;
  const inside = getAltersInsideSubsystems(groups, alters);
  const hidden = getAlterIdsByGroupFlag(groups, alters, "hide_from_lists");
  const top = String(search).trim() ? filtered : filtered.filter((a) => !inside.has(a.id) && !hidden.has(a.id));
  const flatList = memberIds ? filtered.filter((a) => memberIds.has(a.id)) : (String(search).trim() ? filtered : filtered.filter((a) => !hidden.has(a.id)));
  return { visible: flat ? flatList : top, top, flat, explicit: !!memberIds || roles.length > 0 };
}

/** The roles in use across the system (each once, in order). */
export function rolesInUse(alters = []) {
  const byKey = new Map();
  for (const a of alters) for (const r of alterRoles(a)) if (!byKey.has(r.toLowerCase())) byKey.set(r.toLowerCase(), r);
  return [...byKey.values()].sort((x, y) => x.localeCompare(y));
}

// ── The groups tree (board 03's left panel) ─────────────────────────────
/** Rows to draw from a flattened tree (`_depth`), skipping folded branches. */
export function groupRows(tree = [], folded = []) {
  const shut = new Set(folded);
  const out = [];
  let hideBelow = null;
  tree.forEach((g, i) => {
    if (hideBelow != null && g._depth > hideBelow) return;
    hideBelow = null;
    const hasKids = !!tree[i + 1] && tree[i + 1]._depth > g._depth;
    out.push({ g, hasKids, open: !shut.has(g.id) });
    if (hasKids && shut.has(g.id)) hideBelow = g._depth;
  });
  return out;
}

/** What picking a group row does to the filters (picking the picked one again clears it). */
export function filtersForGroup(filters, group) {
  const picked = [...(filters.groupIds || []), ...(filters.subsystemIds || [])];
  const only = picked.length === 1 && (filters.roles || []).length === 0 ? picked[0] : null;
  if (!group || only === group.id) return { ...filters, groupIds: [], subsystemIds: [] };
  return { ...filters, groupIds: group.owner_alter_id ? [] : [group.id], subsystemIds: group.owner_alter_id ? [group.id] : [], mode: "any" };
}
export function pickedGroupId(filters) {
  const picked = [...(filters.groupIds || []), ...(filters.subsystemIds || [])];
  return picked.length === 1 && (filters.roles || []).length === 0 ? picked[0] : null;
}

/** Board 03's status line. */
export function statusWords({ alters = [], ranks = {}, groups = [], terms = {} }) {
  const a = alters.filter((x) => !x.is_archived);
  const fronting = a.filter((x) => ranks[x.id] != null).length;
  const subs = groups.filter((g) => g.owner_alter_id).length;
  const regular = groups.length - subs;
  const sys = terms.system || "system";
  return [
    `${a.length} ${a.length === 1 ? (terms.alter || "alter") : (terms.alters || "alters")}`,
    `${fronting} ${terms.fronting || "fronting"}`,
    `${regular} ${regular === 1 ? "group" : "groups"}, ${subs} sub${sys}${subs === 1 ? "" : "s"}`,
  ];
}

// ── The profile (board 12) ──────────────────────────────────────────────
// Board 12 draws Profile · Notes · Fronting · Links; every other page of
// the old profile is one tap further, under More. Each old ?tab= name lands
// on the page that holds it now, so notifications and old links keep working.
export const PROFILE_TABS = Object.freeze(["profile", "notes", "fronting", "links"]);
export const MORE_TABS = Object.freeze(["board", "inbox", "journal", "wishes", "fields", "options"]);
export const ALL_PROFILE_TABS = Object.freeze([...PROFILE_TABS, ...MORE_TABS]);

const TAB_ALIASES = {
  profile: "profile",
  info: "fields", fields: "fields",
  history: "fronting", fronting: "fronting",
  notes: "notes",
  relationships: "links", lineage: "links", locations: "links", activities: "links", connections: "links", links: "links",
  "private-messages": "inbox", inbox: "inbox",
  board: "board",
  wishlist: "wishes", wishes: "wishes",
  journal: "journal",
  options: "options",
};

/**
 * The house page for an address's ?tab= (and ?view=layout). `newLayout` is
 * whether the alter uses the new profile, where "messages" means the
 * private inbox (on the classic profile it is the board).
 * Anything else (a page the person added to their own layout) opens their
 * own layout on that page.
 */
export function profileTabOf(tabParam, { view = null, newLayout = false } = {}) {
  if (view === "layout") return { tab: "layout", pageTab: tabParam || null };
  if (!tabParam) return { tab: "profile" };
  if (tabParam === "messages") return { tab: newLayout ? "inbox" : "board" };
  const t = TAB_ALIASES[tabParam];
  if (t) return { tab: t };
  return { tab: "layout", pageTab: tabParam };
}

/** The ?tab= a house page writes (the old names, so the old house reads it too). */
export function tabParamOf(tab, { newLayout = false } = {}) {
  switch (tab) {
    case "profile": return null;
    case "fronting": return newLayout ? "fronting" : "history";
    case "links": return newLayout ? "connections" : "relationships";
    case "inbox": return newLayout ? "messages" : "private-messages";
    case "board": return "board";
    case "wishes": return newLayout ? "wishes" : "wishlist";
    case "fields": return newLayout ? "fields" : "info";
    default: return tab;
  }
}

/** Filled custom fields, in the profile's own order, as label/value words. */
export function filledFields(alter, systemFields = [], { orderKey = "_field_order" } = {}) {
  const values = alter?.custom_fields || {};
  const order = Array.isArray(values[orderKey]) ? values[orderKey] : null;
  const fields = order
    ? [...systemFields].sort((a, b) => {
      const ai = order.indexOf(a.id); const bi = order.indexOf(b.id);
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
    })
    : systemFields;
  const out = [];
  for (const f of fields) {
    if (f.is_visible === false) continue;
    const v = values[f.id];
    if (v == null || v === "" || typeof v === "object") continue;
    const words = f.field_type === "boolean" ? (String(v) === "true" ? "Yes" : "No") : plain(v).replace(/\s+/g, " ").trim();
    if (words) out.push({ id: f.id, label: f.name, value: words });
  }
  for (const [i, f] of (Array.isArray(alter?.alter_custom_fields) ? alter.alter_custom_fields : []).entries()) {
    if (!f?.value || f.from_bio) continue;
    const words = plain(f.value).replace(/\s+/g, " ").trim();
    if (words) out.push({ id: `own-${i}`, label: f.name || "Field", value: words });
  }
  return out;
}

/** "they/them · late 20s" (board 12's line under the name). */
export function subLine(alter) {
  return [alter?.pronouns, alter?.age ? String(alter.age) : null].filter(Boolean).join("  ·  ");
}

/** A bio as plain paragraphs (board 12's About draws plain text). */
export function bioParagraphs(html) {
  const s = String(html || "");
  if (!s.trim()) return [];
  if (/data-blocks=|^%5B|^blocks=/.test(s)) return null; // corrupted: the caller says so
  return s
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .split(/\n+/).map((x) => x.trim()).filter(Boolean);
}

/** Previous and next in the directory's A to Z (the profile's ⋯). */
export function neighbours(alters = [], id) {
  const list = alters.filter((a) => !a.is_archived).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const i = list.findIndex((a) => a.id === id);
  return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
}

/** Board 03's "Feels lately": the feelings of their latest check-ins (newest first, each once). */
export function feelsLately(checkIns = [], alterId, { max = 3, within = 14 * DAY, now = Date.now() } = {}) {
  const mine = (checkIns || []).filter((c) => {
    if (!c?.timestamp || now - new Date(c.timestamp).getTime() > within) return false;
    const who = Array.isArray(c.fronting_alter_ids) && c.fronting_alter_ids.length ? c.fronting_alter_ids : (c.alter_id ? [c.alter_id] : []);
    return who.includes(alterId);
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const out = [];
  for (const c of mine) {
    for (const e of Array.isArray(c.emotions) ? c.emotions : []) {
      const w = String(e || "").trim().toLowerCase();
      if (w && !out.includes(w)) out.push(w);
      if (out.length >= max) return out;
    }
  }
  return out;
}

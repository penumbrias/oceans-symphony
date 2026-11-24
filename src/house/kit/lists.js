// Pure logic behind the kit's panels and content blocks (new house step
// 1.3). No React, no imports: scripts/test-house-kit.mjs reads it directly.
//
//   paging        lists over 200 rows show 100 at a time (plan §4 check 1)
//   flattenTree   nested records → visible rows, cycle-guarded, depth-clamped
//   moveItem      reorder (Layers), keyboard and buttons share it
//   overflowSplit the 7-member co-front: who shows, who folds into "+N"
//   toastClock    the Undo toast's clock: ≥ 10 s, paused while touched/focused

// ── Paging ────────────────────────────────────────────────────────────
// A list of up to PAGE_LIMIT rows is drawn whole; above that it is paged,
// PAGE_SIZE rows at a time. Paged, not windowed: rows keep their natural
// height (labels wrap at 200% text, never clip), and the DOM never holds
// more than PAGE_SIZE rows.
export const PAGE_LIMIT = 200;
export const PAGE_SIZE = 100;

export function needsPaging(count, limit = PAGE_LIMIT) {
  return Number(count) > limit;
}

export function pageCount(count, size = PAGE_SIZE) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return Math.max(1, Math.ceil(n / size));
}

export function clampPage(page, count, size = PAGE_SIZE) {
  const last = pageCount(count, size) - 1;
  const p = Math.floor(Number(page) || 0);
  return Math.max(0, Math.min(last, p));
}

export function pageOf(index, size = PAGE_SIZE) {
  return Math.max(0, Math.floor((Number(index) || 0) / size));
}

// The slice of `items` on `page`, with the range in words for the footer.
export function pageSlice(items = [], page = 0, { size = PAGE_SIZE, limit = PAGE_LIMIT } = {}) {
  const count = items.length;
  if (!needsPaging(count, limit)) return { rows: items, start: 0, end: count, page: 0, pages: 1, paged: false };
  const p = clampPage(page, count, size);
  const start = p * size;
  const end = Math.min(count, start + size);
  return { rows: items.slice(start, end), start, end, page: p, pages: pageCount(count, size), paged: true };
}

export function rangeWords({ start, end }, count) {
  const fmt = (n) => Number(n).toLocaleString("en");
  if (!count) return "Nothing to show";
  return `${fmt(start + 1)}–${fmt(end)} of ${fmt(count)}`;
}

// ── Trees ─────────────────────────────────────────────────────────────
// The deepest level a row is drawn at. Deeper rows still show, indented
// no further (and say their real level to a screen reader).
export const MAX_TREE_DEPTH = 8;

// Nested records → the visible rows, in order, each tagged
// { node, id, depth, level, hasChildren, expanded, parentId, setSize, posInSet }.
// Cycle-guarded: a record that is its own parent, or sits in a loop, or
// whose parent is missing, is drawn as a root (so nothing is buried and the
// person can still reach it to fix it), and never walked twice.
export function flattenTree(nodes = [], {
  getId = (n) => n.id,
  getParentId = (n) => n.parentId ?? n.parent_id ?? null,
  expanded = null,         // Set of ids, or null = everything open
  maxDepth = MAX_TREE_DEPTH,
  sort = null,             // (a, b) => number, applied among siblings
} = {}) {
  const byId = new Map();
  for (const n of nodes) {
    const id = getId(n);
    if (id == null || byId.has(id)) continue; // a duplicate id is drawn once
    byId.set(id, n);
  }
  // Which parent ids lead back to themselves? Walk up with a seen-set.
  const inLoop = new Set();
  for (const id of byId.keys()) {
    const seen = new Set([id]);
    let cur = getParentId(byId.get(id));
    let hops = 0;
    while (cur != null && byId.has(cur) && hops < byId.size + 1) {
      if (seen.has(cur)) { if (cur === id) inLoop.add(id); break; }
      seen.add(cur);
      cur = getParentId(byId.get(cur));
      hops += 1;
    }
  }
  const effectiveParent = (n) => {
    const id = getId(n);
    const p = getParentId(n);
    if (p == null || p === id || !byId.has(p) || inLoop.has(id)) return null;
    return p;
  };
  const children = new Map();
  const roots = [];
  for (const n of byId.values()) {
    const p = effectiveParent(n);
    if (p == null) roots.push(n);
    else {
      if (!children.has(p)) children.set(p, []);
      children.get(p).push(n);
    }
  }
  if (sort) {
    roots.sort(sort);
    for (const list of children.values()) list.sort(sort);
  }
  const out = [];
  const visited = new Set();
  const walk = (list, level, parentId) => {
    list.forEach((node, i) => {
      const id = getId(node);
      if (visited.has(id)) return;
      visited.add(id);
      const kids = (children.get(id) || []).filter((k) => !visited.has(getId(k)));
      const isOpen = expanded == null ? true : expanded.has(id);
      out.push({
        node, id, parentId,
        level,                                   // real level, 1-based (aria-level)
        depth: Math.min(level - 1, maxDepth),    // drawn indent, clamped
        hasChildren: kids.length > 0,
        expanded: kids.length > 0 ? isOpen : undefined,
        setSize: list.length, posInSet: i + 1,
      });
      if (kids.length && isOpen) walk(kids, level + 1, id);
    });
  };
  walk(roots, 1, null);
  return out;
}

// Every id that has children (for "Open all").
export function branchIds(rows) {
  return rows.filter((r) => r.hasChildren).map((r) => r.id);
}

// ── Reordering (Layers) ───────────────────────────────────────────────
// A new array with the item at `from` moved to `to` (both clamped).
export function moveItem(list = [], from, to) {
  const n = list.length;
  if (!n) return [];
  const f = Math.max(0, Math.min(n - 1, from));
  const t = Math.max(0, Math.min(n - 1, to));
  if (f === t) return list.slice();
  const out = list.slice();
  const [it] = out.splice(f, 1);
  out.splice(t, 0, it);
  return out;
}

// Move the item with `id` by `delta` places (−1 up, +1 down; "top" / "bottom").
export function moveById(list = [], id, delta, getId = (x) => x.id) {
  const from = list.findIndex((x) => getId(x) === id);
  if (from < 0) return list.slice();
  const to = delta === "top" ? 0 : delta === "bottom" ? list.length - 1 : from + delta;
  return moveItem(list, from, to);
}

// What the screen reader hears after a move.
export function moveWords(name, index, count) {
  if (index <= 0) return `${name} moved to the top, 1 of ${count}`;
  if (index >= count - 1) return `${name} moved to the bottom, ${count} of ${count}`;
  return `${name} moved to ${index + 1} of ${count}`;
}

// ── Overflow (the co-front) ───────────────────────────────────────────
// Who shows and who folds into "+N". Never folds a single person ("+1" is
// as wide as the chip it hides): with one extra, everyone shows.
export function overflowSplit(list = [], max = 3) {
  const n = list.length;
  const m = Math.max(1, Math.floor(max));
  if (n <= m + 1) return { shown: list.slice(), hidden: [] };
  return { shown: list.slice(0, m), hidden: list.slice(m) };
}

// Names in a sentence: "Ash, River and 3 others".
export function namesWords(names = [], { max = 3 } = {}) {
  const list = names.filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length <= max) return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  const rest = list.length - max;
  return `${list.slice(0, max).join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}

// ── The Undo toast's clock ────────────────────────────────────────────
// Building code §1: at least 10 seconds, never runs out while it has
// focus or a finger (or a mouse) on it. Pure: the caller feeds it times.
export const TOAST_MIN_MS = 10000;

export function toastClock(duration = TOAST_MIN_MS) {
  const total = Math.max(TOAST_MIN_MS, Number(duration) || 0);
  return { total, left: total, pausedBy: new Set(), lastTick: null };
}

// Start or resume counting at `now`.
export function toastTick(clock, now) {
  const c = { ...clock, pausedBy: new Set(clock.pausedBy) };
  if (c.lastTick != null && c.pausedBy.size === 0) c.left = Math.max(0, c.left - (now - c.lastTick));
  c.lastTick = now;
  return c;
}

// Pause for a reason ("focus", "pointer", "hover"); time stops while any
// reason holds.
export function toastPause(clock, reason, now) {
  const c = toastTick(clock, now);
  c.pausedBy.add(reason);
  return c;
}

export function toastResume(clock, reason, now) {
  const c = toastTick(clock, now);
  c.pausedBy.delete(reason);
  return c;
}

export const toastExpired = (clock) => clock.left <= 0 && clock.pausedBy.size === 0;

// Where the toast goes while a sheet is open (kit gate item 3, building
// code §5: nothing floats over a sheet the person opened). `sheetTop` is the
// top edge of the highest open sheet (null when none). The toast sits just
// above it when it fits there whole; when it doesn't (a full sheet, or the
// toast is tall at large text) it is HELD: hidden, its clock paused, and
// back the moment the sheet closes, so its Undo is never lost and never
// covers the sheet's buttons.
//   → { mode: "free" }                       no sheet: the usual place
//   → { mode: "above", bottom }              px from the viewport's bottom
//   → { mode: "held" }
export function toastPlacement({ viewportH, sheetTop, toastH, gap = 8 }) {
  if (sheetTop == null || !Number.isFinite(sheetTop)) return { mode: "free" };
  const room = sheetTop - gap * 2;
  if (!(toastH > 0) || toastH > room) return { mode: "held" };
  return { mode: "above", bottom: Math.max(0, Math.round(viewportH - sheetTop + gap)) };
}

// ── Chart helpers ─────────────────────────────────────────────────────
// A series' total and share, for the text version of a chart.
export function seriesSummary(data = [], key) {
  const vals = data.map((d) => Number(d?.[key])).filter((v) => Number.isFinite(v));
  const total = vals.reduce((a, b) => a + b, 0);
  return {
    total,
    min: vals.length ? Math.min(...vals) : null,
    max: vals.length ? Math.max(...vals) : null,
    count: vals.length,
  };
}

// Stamping a home board after a person changes it (v0.249.0, reworked
// v0.277.0). Pure — no imports — so scripts/test-sync-merge.mjs can run it.
// Boards sync between devices and merge page by page (syncMerge.mergeBoards);
// these stamps are what that merge reads.

// Called on every board write by a person (not the board's own auto-fit):
// stamp each page that changed, record pages that were deleted, and drop
// the record for any page that's back. `prev` / `next` are boards.
//
// v0.277.0: a page that did NOT change keeps the time it already had
// here, even when `next` came from somewhere older (a preset, a backup
// snapshot, an undo) carrying a stale `_ut` of its own; deletion records
// from both sides are kept; and a change to anything that isn't a page
// (background, grid, style, wallpaper…) stamps `_lt`, so sync can tell a
// real look change from the board quietly re-fitting itself.
const REMOVED_KEEP_MS = 180 * 86400000;
const BOARD_META_KEYS = new Set(["pages", "_removedPages", "_lt", "_seeded", "_heals"]);
function boardLook(board) {
  const out = {};
  for (const [k, v] of Object.entries(board || {})) if (!BOARD_META_KEYS.has(k)) out[k] = v;
  return JSON.stringify(out);
}
export function stampBoardChanges(prev, next, now = new Date().toISOString()) {
  if (!next || typeof next !== "object" || !Array.isArray(next.pages)) return next;
  const before = new Map((prev?.pages || []).map((p) => [p.id, p]));
  const strip = (p) => { const { _ut, ...rest } = p || {}; return rest; };
  const pages = next.pages.map((p) => {
    const old = before.get(p.id);
    if (!old || JSON.stringify(strip(old)) !== JSON.stringify(strip(p))) return { ...p, _ut: now };
    return old._ut ? { ...strip(p), _ut: old._ut } : strip(p);
  });
  const removed = { ...(prev?._removedPages || {}) };
  for (const [id, at] of Object.entries(next._removedPages || {})) {
    if (!removed[id] || Date.parse(at) > Date.parse(removed[id])) removed[id] = at;
  }
  const ids = new Set(pages.map((p) => p.id));
  for (const id of before.keys()) if (!ids.has(id)) removed[id] = now;
  for (const id of ids) delete removed[id];
  const cutoff = Date.parse(now) - REMOVED_KEEP_MS;
  for (const [id, at] of Object.entries(removed)) if (!(Date.parse(at) >= cutoff)) delete removed[id];
  const out = { ...next, pages };
  if (Object.keys(removed).length) out._removedPages = removed; else delete out._removedPages;
  if (boardLook(prev) !== boardLook(next)) out._lt = now;
  else if (prev?._lt) out._lt = prev._lt;
  else delete out._lt;
  return out;
}

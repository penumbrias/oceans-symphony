/**
 * Cycle-safe helpers for walking and rendering activity-category trees.
 *
 * Activity categories (`base44.entities.ActivityCategory`) nest via
 * `parent_category_id`. Historically the tree-walking code assumed a
 * well-formed forest (no cycles, no self-parents, no missing parents). A
 * single bad edge — created either by a botched drag-drop, a hand-edited
 * backup, or a future bug — was enough to:
 *
 *   1. Send `getAncestorIds` into an infinite `while (current?.parent_category_id)`
 *      loop (locks the tab on next render of the Activities page).
 *   2. Send the recursive `<ActivityTreeRow>` renderer into infinite
 *      recursion (stack overflow → page blanks).
 *
 * Once the bad data was persisted, the page would re-brick on every load —
 * the user couldn't get back in to fix it. These helpers are the
 * defence-in-depth layer so a single malformed row can never lock the UI.
 *
 * Public surface:
 *   - getAncestorIds(catId, byId)         — array, skips cycles
 *   - walkAncestors(catId, byId, visit)   — generator-style callback,
 *                                            stops on cycle/missing parent
 *   - getChildren(catId, all)             — filtered + sorted
 *   - hasCycle(catId, byId)               — true if walking up the parent
 *                                            chain ever revisits an id
 *   - MAX_RENDER_DEPTH                    — cap for recursive renderers
 *
 * None of these mutate the input arrays/objects.
 */

// How deep the recursive tree renderers will descend before flattening
// remaining descendants under the deepest allowed row. Anything deeper
// than this is almost certainly accidental — and rendering 30+ React
// components per row gets sluggish even when the data is well-formed.
// We pick 8 because real users very rarely intentionally nest beyond 4–5,
// and 8 still gives them lots of room to grow.
export const MAX_RENDER_DEPTH = 8;

/**
 * Build a fast lookup from id → category.
 */
export function indexById(categories) {
  const map = {};
  for (const c of categories || []) {
    if (c && c.id != null) map[c.id] = c;
  }
  return map;
}

/**
 * Walk up the parent chain from `catId`, calling `visit(parentId, parentCat)`
 * for each ancestor. Stops cleanly on:
 *   - missing parent (orphan)
 *   - self-parent edge (cat.parent_category_id === cat.id)
 *   - any revisit of an id already seen on this walk (cycle)
 *
 * Returns the set of ids visited (NOT including the starting id).
 */
export function walkAncestors(catId, byId, visit) {
  const seen = new Set();
  let current = byId[catId];
  if (!current) return seen;
  // Guard against a self-parent on the starting node too.
  seen.add(catId);
  let parentId = current.parent_category_id;
  while (parentId && parentId !== current.id && !seen.has(parentId)) {
    const parent = byId[parentId];
    if (!parent) break;
    seen.add(parentId);
    if (typeof visit === "function") visit(parentId, parent);
    current = parent;
    parentId = current.parent_category_id;
  }
  seen.delete(catId);
  return seen;
}

/**
 * Cycle-safe replacement for the old:
 *   while (current?.parent_category_id) {
 *     ancestors.push(current.parent_category_id);
 *     current = byId[current.parent_category_id];
 *   }
 *
 * Returns ancestor ids in order from nearest parent to root.
 */
export function getAncestorIds(catId, byId) {
  const out = [];
  walkAncestors(catId, byId, (pid) => out.push(pid));
  return out;
}

/**
 * Return immediate children of `catId`, filtering out any self-parent
 * row (defensive — it would otherwise appear as its own child and
 * recurse) and sorted by `order` then by name as a tie-break.
 */
export function getChildren(catId, all) {
  if (!Array.isArray(all)) return [];
  return all
    .filter((c) => c && c.parent_category_id === catId && c.id !== catId)
    .sort((a, b) => {
      const ao = a.order ?? 0;
      const bo = b.order ?? 0;
      if (ao !== bo) return ao - bo;
      return (a.name || "").localeCompare(b.name || "");
    });
}

/**
 * True if walking up the parent chain from `catId` ever revisits an id.
 * Used by the recovery view to count how many records are corrupted.
 */
export function hasCycle(catId, byId) {
  const seen = new Set([catId]);
  let current = byId[catId];
  if (!current) return false;
  let pid = current.parent_category_id;
  while (pid) {
    if (pid === current.id) return true; // self-parent
    if (seen.has(pid)) return true;
    seen.add(pid);
    const parent = byId[pid];
    if (!parent) return false;
    current = parent;
    pid = current.parent_category_id;
  }
  return false;
}

/**
 * Would assigning `candidateParentId` to `nodeId` create a cycle?
 * Used by drag-drop to refuse drops that would orphan a subtree onto
 * itself (e.g. dragging "Self Care" onto "Self Care > Brushing teeth").
 */
export function wouldCreateCycle(nodeId, candidateParentId, byId) {
  if (!nodeId || !candidateParentId) return false;
  if (nodeId === candidateParentId) return true;
  // Walk up from the candidate parent. If we hit `nodeId`, the drop would
  // make `nodeId` an ancestor of itself.
  const seen = new Set();
  let current = byId[candidateParentId];
  while (current) {
    if (current.id === nodeId) return true;
    if (seen.has(current.id)) return false; // pre-existing cycle, not ours to fix here
    seen.add(current.id);
    const pid = current.parent_category_id;
    if (!pid || pid === current.id) return false;
    current = byId[pid];
  }
  return false;
}

/**
 * True if any category in the list has a broken edge: self-parent,
 * cycle, or parent_category_id pointing at a deleted record.
 * Used by the recovery view to decide whether to suggest "flatten".
 */
export function detectCorruption(categories) {
  const byId = indexById(categories);
  let cycleCount = 0;
  let orphanCount = 0;
  let selfParentCount = 0;
  for (const c of categories || []) {
    if (!c) continue;
    if (c.parent_category_id === c.id) { selfParentCount++; continue; }
    if (c.parent_category_id && !byId[c.parent_category_id]) {
      orphanCount++;
      continue;
    }
    if (hasCycle(c.id, byId)) cycleCount++;
  }
  return { cycleCount, orphanCount, selfParentCount, total: (categories || []).length };
}

/**
 * Return the categories that should render at the top level of the
 * tree. A category is a "root" if any of:
 *   - parent_category_id is null/empty (true root)
 *   - parent_category_id points at a deleted record (orphan)
 *   - parent_category_id points at itself (self-parent — a corruption
 *     mode caused by botched drag-drop on older builds; surfaced here
 *     so the category remains visible until recovery can clean it up)
 * Without this, self-parented rows are invisible everywhere because
 * the orphan check (`!byId[parent]`) succeeds for them but the parent
 * IS in the index — so they're filtered out as "child of an existing
 * parent" while `getChildren` simultaneously refuses to descend into
 * them (self-recursion guard). Net: nowhere to render.
 */
export function getRootCategories(categories) {
  if (!Array.isArray(categories)) return [];
  const byId = indexById(categories);
  return categories
    .filter((c) => {
      if (!c) return false;
      if (!c.parent_category_id) return true;
      if (c.parent_category_id === c.id) return true;
      return !byId[c.parent_category_id];
    })
    .sort((a, b) => {
      const ao = a.order ?? 0;
      const bo = b.order ?? 0;
      if (ao !== bo) return ao - bo;
      return (a.name || "").localeCompare(b.name || "");
    });
}

// Default relationship types — seeded on first load.
//
// `parent_id` (added in the nestable-types feature) is the id of a parent
// RelationshipType. null/absent = top-level. Defaults are seeded flat
// (top-level) so the existing seed-on-first-load logic stays trivial — the
// defaults don't have stable ids until they're created, so we can't wire
// parent references between them at seed time. Nesting is opt-in: users nest
// types by editing them in RelationshipTypesManager.
export const DEFAULT_RELATIONSHIP_TYPES = [
  { label: "Friends", color: "#3b82f6" },
  { label: "Close friends", color: "#8b5cf6" },
  { label: "Romantic", color: "#ec4899" },
  { label: "Family", color: "#f59e0b" },
  { label: "Rivals", color: "#ef4444" },
  { label: "Conflicted", color: "#f97316" },
  { label: "Protects", color: "#10b981" },
  { label: "Protected by", color: "#10b981" },
  { label: "Created by", color: "#6366f1" },
  { label: "Split from", color: "#a855f7" },
  { label: "Caretaker of", color: "#14b8a6" },
  { label: "Avoids", color: "#6b7280" },
  { label: "Doesn't know", color: "#9ca3af" },
];

/* ------------------------------------------------------------------ *
 * Cycle-safe tree helpers for nestable relationship types.
 *
 * RelationshipType (`localEntities.RelationshipType`) nests via `parent_id`.
 * These mirror src/lib/categoryTreeUtils.js — a single bad edge (self-parent,
 * cycle, or parent pointing at a deleted/archived record) must never send a
 * tree walk into an infinite loop or recurse the renderer to a stack overflow.
 * See that file's header for the full rationale.
 *
 * IMPORTANT: nesting is purely organizational on the *catalogue*. The
 * `relationship_type` field on AlterRelationship stores a type's LABEL (a
 * string), never its id — so re-parenting a type never touches existing
 * relationships. Don't change a type's label as part of nesting.
 * ------------------------------------------------------------------ */

// How deep the indented tree renderer will descend before flattening the
// remaining descendants under the deepest allowed row. Relationship-type
// hierarchies are realistically 1–2 levels deep ("Family" → "Sibling"); 6
// gives generous room while keeping the picker readable and bounding render
// cost if a malformed chain somehow gets deeper.
export const MAX_TYPE_DEPTH = 6;

/**
 * Build a fast lookup from id → type. Skips records with no id (e.g. the
 * unseeded default fallbacks that some consumers synthesize with id: null).
 */
export function indexTypesById(types) {
  const map = {};
  for (const t of types || []) {
    if (t && t.id != null) map[t.id] = t;
  }
  return map;
}

/**
 * Return immediate children of `typeId`, filtering out any self-parent row
 * (defensive — it would otherwise appear as its own child and recurse) and
 * sorted by `order` then label as a tie-break.
 */
export function getChildTypes(typeId, all) {
  if (!Array.isArray(all)) return [];
  return all
    .filter((t) => t && t.parent_id === typeId && t.id !== typeId)
    .sort((a, b) => {
      const ao = a.order ?? 0;
      const bo = b.order ?? 0;
      if (ao !== bo) return ao - bo;
      return (a.label || "").localeCompare(b.label || "");
    });
}

/**
 * Walk up the parent chain from `typeId`, calling `visit(parentId, parent)`
 * for each ancestor. Stops cleanly on missing parent, self-parent, or any
 * revisited id (cycle). Returns the set of ancestor ids (NOT the start id).
 */
export function walkTypeAncestors(typeId, byId, visit) {
  const seen = new Set();
  let current = byId[typeId];
  if (!current) return seen;
  seen.add(typeId);
  let parentId = current.parent_id;
  while (parentId && parentId !== current.id && !seen.has(parentId)) {
    const parent = byId[parentId];
    if (!parent) break;
    seen.add(parentId);
    if (typeof visit === "function") visit(parentId, parent);
    current = parent;
    parentId = current.parent_id;
  }
  seen.delete(typeId);
  return seen;
}

/**
 * Ancestor ids from nearest parent to root. Cycle-safe.
 */
export function getTypeAncestorIds(typeId, byId) {
  const out = [];
  walkTypeAncestors(typeId, byId, (pid) => out.push(pid));
  return out;
}

/**
 * True if walking up the parent chain from `typeId` ever revisits an id
 * (cycle) or hits a self-parent.
 */
export function hasTypeCycle(typeId, byId) {
  const seen = new Set([typeId]);
  let current = byId[typeId];
  if (!current) return false;
  let pid = current.parent_id;
  while (pid) {
    if (pid === current.id) return true; // self-parent
    if (seen.has(pid)) return true;
    seen.add(pid);
    const parent = byId[pid];
    if (!parent) return false;
    current = parent;
    pid = current.parent_id;
  }
  return false;
}

/**
 * Would assigning `candidateParentId` as the parent of `nodeId` create a
 * cycle? A type may not be its own parent, ancestor, or descendant.
 * Used by the manager's parent picker to grey out invalid options.
 */
export function wouldCreateTypeCycle(nodeId, candidateParentId, byId) {
  if (!nodeId || !candidateParentId) return false;
  if (nodeId === candidateParentId) return true;
  // Walk up from the candidate parent. If we reach `nodeId`, then `nodeId`
  // would become an ancestor of itself.
  const seen = new Set();
  let current = byId[candidateParentId];
  while (current) {
    if (current.id === nodeId) return true;
    if (seen.has(current.id)) return false; // pre-existing cycle, not ours
    seen.add(current.id);
    const pid = current.parent_id;
    if (!pid || pid === current.id) return false;
    current = byId[pid];
  }
  return false;
}

/**
 * Return the types that should render at the top level of the tree. A type is
 * a "root" if any of:
 *   - parent_id is null/empty (true root)
 *   - parent_id points at itself (self-parent corruption — surfaced so it
 *     stays visible/editable)
 *   - parent_id points at a record not in `types` (deleted parent — orphan)
 *
 * NOTE on archiving: pass the FULL list (archived + active) as `types` so an
 * archived parent still indexes its children correctly. If you pre-filter out
 * archived types before calling this, children of an archived parent are
 * surfaced as roots (they orphan up to top level), which is the intended
 * "don't hide a child just because its parent was archived" behaviour.
 */
export function getRootTypes(types) {
  if (!Array.isArray(types)) return [];
  const byId = indexTypesById(types);
  return types
    .filter((t) => {
      if (!t) return false;
      if (!t.parent_id) return true;
      if (t.parent_id === t.id) return true;
      return !byId[t.parent_id];
    })
    .sort((a, b) => {
      const ao = a.order ?? 0;
      const bo = b.order ?? 0;
      if (ao !== bo) return ao - bo;
      return (a.label || "").localeCompare(b.label || "");
    });
}

/**
 * Flatten a type forest into a depth-tagged, render-order list:
 * `[{ ...type, _depth }]`, parents immediately followed by their descendants,
 * clamped at MAX_TYPE_DEPTH. Cycle-safe (a `seen` set prevents revisiting).
 *
 * `types` should be the FULL list you want represented (e.g. active types).
 * Roots are computed from that same list, so a child whose parent isn't in the
 * list (e.g. an archived parent excluded by the caller) still appears at top
 * level rather than vanishing.
 */
export function flattenTypeTree(types) {
  const roots = getRootTypes(types);
  const out = [];
  const seen = new Set();
  const visit = (type, depth) => {
    if (!type || seen.has(type.id)) return;
    seen.add(type.id);
    out.push({ ...type, _depth: depth });
    if (depth >= MAX_TYPE_DEPTH) {
      // Flatten any remaining descendants at the clamp depth so nothing is
      // dropped, but stop deepening the indentation.
      for (const child of getChildTypes(type.id, types)) {
        if (!seen.has(child.id)) visit(child, depth);
      }
      return;
    }
    for (const child of getChildTypes(type.id, types)) {
      visit(child, depth + 1);
    }
  };
  for (const root of roots) visit(root, 0);
  // Defensive: append any type that wasn't reached (shouldn't happen, but a
  // bizarre cycle could leave a node unvisited — never silently drop it).
  for (const t of types || []) {
    if (t && t.id != null && !seen.has(t.id)) {
      seen.add(t.id);
      out.push({ ...t, _depth: 0 });
    }
  }
  return out;
}

// Hook-free helper: fetch active relationship types (non-archived), sorted by order
export async function fetchActiveRelationshipTypes(entities) {
  const all = await entities.RelationshipType.list();
  if (all.length === 0) {
    // Seed defaults
    await Promise.all(
      DEFAULT_RELATIONSHIP_TYPES.map((t, i) =>
        entities.RelationshipType.create({ ...t, order: i, is_default: true })
      )
    );
    return DEFAULT_RELATIONSHIP_TYPES.map((t, i) => ({ ...t, id: null, order: i }));
  }
  return all
    .filter(t => !t.is_archived)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

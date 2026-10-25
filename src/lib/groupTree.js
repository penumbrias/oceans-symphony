// The group tree — one place that knows how groups nest.
//
// Two things could nest a group, and they were handled by different code in
// different files with different rules:
//
//   • group.parent          — this group sits inside another group (a folder)
//   • group.owner_alter_id  — this group belongs to an alter (a subsystem)
//
// They're not alternatives. A subsystem can live inside a folder, and a
// folder can hold both plain groups and subsystems. The old manager split
// them across two tabs, and the subsystem tab couldn't nest at all — which
// is why nesting felt broken.
//
// `parent` has several historical spellings for "top level": the string
// "root", "none", "", null, and the field being absent. normalizeParent
// collapses them so nothing downstream has to remember that.
//
// `parent` also points at a group in TWO ways: its id, or — for groups
// imported from Simply Plural — its sp_id. indexGroups keys both, and
// resolvedParentId always answers with the parent's real id.
//
// THE one group tree library (v0.279.9, roadmap step 4). The old
// groupTreeUtils.js (a second walker with its own depth limit and no sp_id
// support) now re-exports from here; never add a second tree walker or an
// inline `g.parent === …` filter.
//
// LOAD-BEARING: every walk here is cycle-guarded and depth-clamped. One bad
// parent pointer must never be able to hang a render — the user would have
// no way back in to fix the row. Same lesson as the activity category tree.

export const MAX_GROUP_DEPTH = 12;
const ROOT = null;

export function normalizeParent(group) {
  const p = group?.parent;
  if (!p || p === "root" || p === "none") return ROOT;
  return p;
}

// A group's parent, but only if that parent actually exists. A pointer at a
// deleted group is treated as top-level rather than hiding the group
// forever — being wrong about placement beats being invisible.
export function resolvedParentId(group, byId) {
  const p = normalizeParent(group);
  const parent = p ? byId[p] : null;
  return parent ? parent.id : ROOT;
}

// The parent group itself (or null when top level / missing).
export function parentGroupOf(group, groups) {
  const byId = indexGroups(groups);
  const pid = resolvedParentId(group, byId);
  return pid ? byId[pid] : null;
}

// True when the group is deliberately top level (no stored parent).
export function isTopLevel(group) {
  return normalizeParent(group) === ROOT;
}

/**
 * THE group display comparator — use this for every group list/tree sort.
 * Explicit `order` wins; ties fall back to created_date ASCENDING (the
 * order groups were made or imported), then name. Without the created_date
 * leg, order-less groups inherit Group.list()'s default newest-first sort,
 * so every import (and every hand-built set of groups) rendered REVERSED.
 */
export function byGroupOrder(a, b) {
  return (
    (a?.order || 0) - (b?.order || 0) ||
    String(a?.created_date || "").localeCompare(String(b?.created_date || "")) ||
    (a?.name || "").localeCompare(b?.name || "")
  );
}

// id → group, plus sp_id → group for imported parents (an id always wins).
export function indexGroups(groups) {
  const byId = {};
  for (const g of groups || []) if (g?.sp_id && !byId[g.sp_id]) byId[g.sp_id] = g;
  for (const g of groups || []) if (g?.id) byId[g.id] = g;
  return byId;
}

// Walk up from a group, stopping on a cycle or the depth clamp.
export function ancestorIds(group, byId) {
  const out = [];
  const seen = new Set();
  let current = group;
  let depth = 0;
  while (current && depth < MAX_GROUP_DEPTH) {
    const pid = resolvedParentId(current, byId);
    if (!pid || seen.has(pid)) break;
    seen.add(pid);
    out.push(pid);
    current = byId[pid];
    depth += 1;
  }
  return out;
}

// True if `group` sits inside a cycle (its own ancestor chain reaches it).
export function isInCycle(group, byId) {
  return ancestorIds(group, byId).includes(group?.id);
}

// Top-level groups: real roots PLUS anything whose chain is broken or
// cyclic, so a group can never be buried where the user can't reach it.
export function rootGroups(groups) {
  const byId = indexGroups(groups);
  return (groups || []).filter((g) => {
    const pid = resolvedParentId(g, byId);
    if (!pid) return true;
    return isInCycle(g, byId);
  });
}

// Children of `parentId`; null gives the top-level groups (not the ones in
// a loop — rootGroups adds those).
export function childGroups(groups, parentId) {
  const byId = indexGroups(groups);
  return (groups || []).filter(
    (g) => (!parentId || g.id !== parentId) && resolvedParentId(g, byId) === parentId && !isInCycle(g, byId)
  );
}

// Every group nested anywhere under `groupId` (not including it), cycle-
// guarded and depth-clamped.
export function descendantGroupIds(groups, groupId) {
  const out = [];
  const seen = new Set([groupId]);
  const walk = (id, depth) => {
    if (depth > MAX_GROUP_DEPTH) return;
    for (const c of childGroups(groups, id)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c.id);
      walk(c.id, depth + 1);
    }
  };
  walk(groupId, 0);
  return out;
}

// Would moving `groupId` under `targetId` create a loop? Also blocks
// dropping a group onto itself.
export function wouldNest(groups, groupId, targetId) {
  if (!targetId) return false;          // moving to top level is always safe
  if (groupId === targetId) return true;
  const byId = indexGroups(groups);
  // Walk UP from the target: if we reach the group being moved, the target
  // is one of its descendants and the move would close a loop.
  const seen = new Set();
  let current = byId[targetId];
  let depth = 0;
  while (current && depth < MAX_GROUP_DEPTH) {
    if (current.id === groupId) return true;
    const pid = resolvedParentId(current, byId);
    if (!pid || seen.has(pid)) break;
    seen.add(pid);
    current = byId[pid];
    depth += 1;
  }
  return false;
}

// Every group as a depth-tagged flat list, parents immediately followed by
// their children. This is what the searchable pickers consume (house rule:
// hierarchies get a nesting-aware picker, never a bare select).
export function flattenGroupTree(groups, { sort = true } = {}) {
  const out = [];
  const visited = new Set();
  const cmp = sort === "order" ? byGroupOrder : (a, b) => (a.name || "").localeCompare(b.name || "");
  const order = (list) => (sort ? [...list].sort(cmp) : list);

  const walk = (list, depth) => {
    if (depth > MAX_GROUP_DEPTH) return;
    for (const g of order(list)) {
      if (visited.has(g.id)) continue;   // cycle guard
      visited.add(g.id);
      out.push({ ...g, _depth: depth });
      walk(childGroups(groups, g.id), depth + 1);
    }
  };
  walk(rootGroups(groups), 0);

  // Anything a cycle kept out still gets listed, flat, so it stays editable.
  for (const g of order(groups || [])) {
    if (!visited.has(g.id)) out.push({ ...g, _depth: 0, _orphaned: true });
  }
  return out;
}

// Groups whose stored parent doesn't work: it points at a group that no
// longer exists, or it's part of a loop. rootGroups already surfaces them at
// the top level so they can't go missing — this is what lets the UI SAY so,
// rather than silently relocating them and leaving the user confused about
// where their group went.
export function strandedGroups(groups) {
  const byId = indexGroups(groups);
  return (groups || []).filter((g) => {
    const stored = normalizeParent(g);
    if (!stored) return false;                 // deliberately top-level
    if (!byId[stored]) return true;            // parent was deleted
    return isInCycle(g, byId);                 // loop
  });
}

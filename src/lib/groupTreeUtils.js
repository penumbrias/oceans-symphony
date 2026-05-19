// Group tree helpers — defensive walkers that survive cycles, orphans
// (parent pointing to a missing/deleted group), and self-parents.
//
// Designed in response to the bug where a user accidentally nested
// root groups into other folders and couldn't find them anymore.
// Activity categories already have categoryTreeUtils.js with the
// same shape — these helpers mirror that pattern for Group entities.
//
// Conventions:
//   - A group is "at root" when its `parent` is empty / null / "" /
//     the literal string "root".
//   - `findRootGroups` includes orphans + cycle members as roots so
//     they remain reachable in the UI.

const ROOT_VALUES = new Set([null, undefined, "", "root"]);

export function isRootParent(value) {
  return ROOT_VALUES.has(value);
}

function buildIndex(allGroups) {
  const map = {};
  for (const g of allGroups || []) {
    if (g && g.id) map[g.id] = g;
  }
  return map;
}

/**
 * Walks parents until it either lands on root, hits a cycle, or
 * runs into a missing parent. Returns true only when it reaches
 * a genuine root via a finite ancestor chain.
 */
export function isReachableFromRoot(group, allById, seen = new Set()) {
  if (!group || !group.id) return false;
  if (seen.has(group.id)) return false; // cycle
  seen.add(group.id);
  if (isRootParent(group.parent)) return true;
  if (group.parent === group.id) return false; // self-parent
  const parent = allById[group.parent];
  if (!parent) return false; // orphan — parent id points nowhere
  return isReachableFromRoot(parent, allById, seen);
}

/**
 * Returns every group that should render at the top level: real
 * roots PLUS orphans (broken parent chain), self-parented, and any
 * cycle members. Anything whose parent chain doesn't terminate
 * cleanly at root is surfaced here so the user can always find it.
 * Ordering: by `order` then `name`.
 */
export function findRootGroups(allGroups) {
  const byId = buildIndex(allGroups);
  return (allGroups || [])
    .filter((g) => isRootParent(g.parent) || !isReachableFromRoot(g, byId))
    .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.name || "").localeCompare(b.name || ""));
}

/**
 * Children of a given group — direct descendants only. Skips
 * self-references so a self-parented group doesn't appear as its
 * own child.
 */
export function getChildGroups(parentId, allGroups) {
  if (!parentId) return [];
  return (allGroups || []).filter((g) => g.parent === parentId && g.id !== parentId);
}

/**
 * True iff `candidateChildId` already sits somewhere in the ancestor
 * chain of `targetParentId` (or equals it). Used to refuse drops
 * that would create a cycle — e.g. dragging "System groups" into
 * one of its own descendants.
 */
export function wouldCreateCycle(targetParentId, candidateChildId, allGroups) {
  if (!targetParentId || !candidateChildId) return false;
  if (targetParentId === candidateChildId) return true;
  const byId = buildIndex(allGroups);
  const seen = new Set();
  let cursor = byId[targetParentId];
  while (cursor) {
    if (seen.has(cursor.id)) return true; // existing cycle — refuse
    seen.add(cursor.id);
    if (cursor.id === candidateChildId) return true;
    if (isRootParent(cursor.parent)) return false;
    cursor = byId[cursor.parent];
  }
  return false;
}

/**
 * Returns groups that are not reachable from root via their parent
 * chain — they got buried under a since-deleted folder, ended up in
 * a cycle, or self-parented. The Groups manager surfaces these in
 * a recovery panel so they can be moved back to root.
 */
export function findOrphanGroups(allGroups) {
  const byId = buildIndex(allGroups);
  return (allGroups || []).filter((g) =>
    !isRootParent(g.parent) && !isReachableFromRoot(g, byId)
  );
}

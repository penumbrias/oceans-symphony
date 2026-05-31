// Subsystem helpers — an alter can "own" a Group, making that group their
// subsystem (the alter is the parent, the group's members are children).
// Children can themselves own subsystems, so the structure is a tree that
// can nest arbitrarily deep.
//
// THE LOAD-BEARING RULE: every traversal here is cycle-guarded and
// depth-clamped. A single bad ownership/membership loop (alter A owns a
// group containing B, B owns a group containing A) would otherwise make
// recursive rendering or descendant-walks spin forever and brick the
// page with no way back in to fix the data — the exact failure mode the
// ActivityCategory tree taught us (see CLAUDE.md cycle-guard rule).
//
// Group shape (relevant fields):
//   { id, name, color, parent, member_sp_ids: [...], owner_alter_id }
// Alter shape: { id, sp_id, name, ... }

export const MAX_SUBSYSTEM_DEPTH = 12;

// Is this group a subsystem (owned by an alter)?
export function isSubsystem(group) {
  return !!group?.owner_alter_id;
}

// Groups owned by a given alter (their subsystems). Usually 0 or 1, but
// nothing stops an alter owning several.
export function getSubsystemsOwnedBy(groups, alterId) {
  if (!alterId) return [];
  return (groups || []).filter((g) => g.owner_alter_id === alterId);
}

// The alters that are MEMBERS of a group. Matches the two membership
// shapes the app uses: the group's member_sp_ids and the alter's own
// groups array. The owner is NOT a member (they're the parent), so they
// are excluded even if a stale membership record includes them.
export function getMemberAlters(group, alters) {
  if (!group) return [];
  const memberSpIds = new Set(group.member_sp_ids || []);
  const groupId = group.id;
  return (alters || []).filter((a) => {
    if (a.id === group.owner_alter_id) return false; // owner is parent, not child
    const inGroupMembers = a.sp_id && memberSpIds.has(a.sp_id);
    // Guard the sp_id comparison: local groups have no sp_id, so an
    // unguarded `g.sp_id === group.sp_id` is `undefined === undefined`
    // === true, which matched every alter that's in ANY sp_id-less
    // group — that's why a brand-new subsystem listed the whole system.
    const inAlterGroups = (a.groups || []).some(
      (g) => g.id === groupId || (!!group.sp_id && g.sp_id === group.sp_id)
    );
    return inGroupMembers || inAlterGroups;
  });
}

// Would assigning `ownerAlterId` as the owner of `groupId` create an
// ownership cycle? I.e. is the candidate owner already a descendant
// (member, or member-of-a-subsystem-owned-by-a-member, …) of this group?
// If so, making them the owner would close a loop. Cycle-guarded with a
// visited set and depth clamp so the check itself can't hang on
// pre-existing bad data.
export function wouldCreateOwnershipCycle(groups, alters, groupId, ownerAlterId) {
  if (!groupId || !ownerAlterId) return false;
  const group = (groups || []).find((g) => g.id === groupId);
  if (!group) return false;

  const visited = new Set();
  // Walk down from `group`: collect every alter reachable as a
  // descendant. If ownerAlterId appears, assigning them as owner loops.
  const stack = [{ g: group, depth: 0 }];
  while (stack.length) {
    const { g, depth } = stack.pop();
    if (!g || visited.has(g.id) || depth > MAX_SUBSYSTEM_DEPTH) continue;
    visited.add(g.id);
    const members = getMemberAlters(g, alters);
    for (const m of members) {
      if (m.id === ownerAlterId) return true; // candidate owner is a descendant → cycle
      // Descend into any subsystems those members own.
      for (const owned of getSubsystemsOwnedBy(groups, m.id)) {
        if (!visited.has(owned.id)) stack.push({ g: owned, depth: depth + 1 });
      }
    }
  }
  return false;
}

// Build the subsystem tree rooted at an alter, for recursive rendering.
// Returns { alter, subsystems: [{ group, children: [node...] }] } with a
// hard depth clamp and a visited-alter set so a cycle (should one slip
// past the assignment guard) renders as a truncated branch instead of
// hanging. `visitedAlters` is threaded through so the same alter never
// expands twice down a single branch.
export function buildSubsystemTree(alter, groups, alters, depth = 0, visitedAlters = new Set()) {
  if (!alter || depth > MAX_SUBSYSTEM_DEPTH || visitedAlters.has(alter.id)) {
    return { alter, subsystems: [], truncated: !!alter && (depth > MAX_SUBSYSTEM_DEPTH || visitedAlters.has(alter.id)) };
  }
  const nextVisited = new Set(visitedAlters);
  nextVisited.add(alter.id);

  const subsystems = getSubsystemsOwnedBy(groups, alter.id).map((group) => {
    const members = getMemberAlters(group, alters);
    const children = members.map((m) => buildSubsystemTree(m, groups, alters, depth + 1, nextVisited));
    return { group, children };
  });
  return { alter, subsystems, truncated: false };
}

// True if an alter owns at least one subsystem (for the "has subsystems"
// expand indicator).
export function alterHasSubsystem(groups, alterId) {
  return getSubsystemsOwnedBy(groups, alterId).length > 0;
}

// Set of alter ids that are members of SOME subsystem (a group with an
// owner). Used on the alters page to collapse those alters under their
// owner instead of listing them flat at the top level.
export function getAltersInsideSubsystems(groups, alters) {
  const ids = new Set();
  for (const g of groups || []) {
    if (!g.owner_alter_id) continue;
    for (const m of getMemberAlters(g, alters)) ids.add(m.id);
  }
  return ids;
}

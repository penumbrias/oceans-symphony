// A group's own record, written one way (new house, Groups room): rename,
// recolour, move (nest / bring to the top), reorder a level, reorder its
// members, and delete. Both houses call these — the old Manage groups page
// (GroupsManager.jsx) and the new house's Groups room — so the rules live
// in one place:
//
//   - nesting rules are groupTree.js's (wouldNest refuses a loop);
//   - membership is groupMembership.js's (this file never writes
//     Group.alter_ids or Alter.groups);
//   - deleting re-homes the nested groups to the top level FIRST, then
//     trashes each group with deleteGroupCascade, all in one trash batch,
//     so a restore brings the whole selection back.
//
// Every function throws on failure; the caller shows the words.

import { base44 } from "@/api/base44Client";
import { withTrashBatch } from "@/lib/localDb";
import { childGroups, wouldNest } from "@/lib/groupTree";
import { deleteGroupCascade } from "@/lib/groupMembership";

export class GroupNestError extends Error {
  constructor() {
    super("That would put a group inside itself");
    this.name = "GroupNestError";
  }
}

/** Rename one group. A blank or unchanged name does nothing. */
export async function renameGroup(group, name) {
  const next = String(name || "").trim();
  if (!group?.id || !next || next === group.name) return false;
  await base44.entities.Group.update(group.id, { name: next });
  return true;
}

/** Give one or more groups a colour. */
export async function setGroupsColour(ids, color) {
  await Promise.all((ids || []).map((id) => base44.entities.Group.update(id, { color })));
}

/**
 * Move groups inside `targetId` ("" or null = the top level). Refuses the
 * whole move (GroupNestError) if any of them would end up inside itself.
 */
export async function moveGroups(groups, ids, targetId) {
  const list = ids || [];
  if (list.some((id) => wouldNest(groups, id, targetId || ""))) throw new GroupNestError();
  await Promise.all(list.map((id) => base44.entities.Group.update(id, { parent: targetId || "" })));
}

/**
 * Swap one group with its neighbour among `siblings` (already in display
 * order) and renumber the whole level (order 10, 20, 30…), so the arrows
 * always work even when every group still has order 0.
 */
export async function reorderGroupLevel(siblings, groupId, dir) {
  const list = [...(siblings || [])];
  const i = list.findIndex((g) => g.id === groupId);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((g, idx) => (
    (g.order || 0) === (idx + 1) * 10 ? null : base44.entities.Group.update(g.id, { order: (idx + 1) * 10 })
  )).filter(Boolean));
  return true;
}

/** Swap one member with its neighbour in the group's member order. */
export async function reorderGroupMembers(group, memberIds, alterId, dir) {
  const ids = [...(memberIds || [])];
  const i = ids.indexOf(alterId);
  const j = i + dir;
  if (!group?.id || i === -1 || j < 0 || j >= ids.length) return false;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await base44.entities.Group.update(group.id, { member_order: ids });
  return true;
}

/**
 * Delete groups (to the trash, one batch). Nested groups that aren't being
 * deleted too move to the top level first, so a failure can't strand them
 * under a group that's gone. No alters are deleted.
 */
export async function deleteGroups(groups, ids) {
  const list = ids || [];
  const byId = Object.fromEntries((groups || []).map((g) => [g.id, g]));
  await withTrashBatch(async () => {
    for (const id of list) {
      for (const kid of childGroups(groups, id)) {
        if (!list.includes(kid.id)) await base44.entities.Group.update(kid.id, { parent: "" });
      }
      await deleteGroupCascade(byId[id] || { id });
    }
  });
}

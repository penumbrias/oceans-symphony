// Group membership — ONE read shape, ONE write path.
//
// Membership is stored twice, for historical reasons that can't be undone
// without touching user data:
//
//   • Group.member_sp_ids — ids of the members (Simply Plural `sp_id` when
//     the alter came from an import, the local id otherwise).
//   • Alter.groups        — [{ id, name, color }] on the alter itself.
//
// Both exist in real users' databases, and both are read by different parts
// of the app (analytics, the alters grid, exports), so neither can simply be
// dropped. What went wrong is that each editor wrote a DIFFERENT subset:
//
//   CreateGroupModal   → member_sp_ids only
//   GroupMembersModal  → alter.groups only, keyed by group.id
//   ManageMembersModal → both, but keyed by (group.sp_id || group.id)
//
// So removing someone in one editor left them a member through the other
// representation and they came back; and adding an alter to an imported
// group under the wrong key made them invisible to getMemberAlters. That is
// the "changes don't stick" class of bug.
//
// Everything that changes membership now goes through setGroupMembers,
// which writes BOTH representations under BOTH keys and removes stale
// entries under either key. Read through getMemberAlters (subsystemUtils),
// which already unions the two.

import { base44 } from "@/api/base44Client";
import { getMemberAlters } from "@/lib/subsystemUtils";

// Every key a membership entry for this group could legitimately carry.
// An alter counts as a member if ANY of these matches, and a removal has to
// clear ALL of them or the member reappears on the next read.
export function groupKeys(group) {
  return [group?.id, group?.sp_id].filter(Boolean);
}

// The member id stored in Group.member_sp_ids for a given alter: sp_id when
// the alter came from an import (that's what imported groups reference),
// otherwise the local id.
export function memberIdFor(alter) {
  return alter?.sp_id || alter?.id;
}

export function isMemberOf(group, alter) {
  if (!group || !alter) return false;
  const keys = new Set(groupKeys(group));
  const memberIds = new Set(group.member_sp_ids || []);
  if (memberIds.has(alter.sp_id) || memberIds.has(alter.id)) return true;
  return (alter.groups || []).some((g) => keys.has(g?.id) || keys.has(g?.sp_id));
}

// Current members as alter ids, using the same union the rest of the app
// reads through — so the editor always opens showing what's really stored.
export function currentMemberIds(group, alters) {
  return getMemberAlters(group, alters).map((a) => a.id);
}

/**
 * Set a group's members to exactly `alterIds`.
 *
 * Writes both representations so every reader agrees, and only touches the
 * alters whose membership actually changed (a full rewrite of every alter
 * on every save would churn `updated_date` across the whole system).
 *
 * Never deletes anything else on the alter — it rewrites only `groups`.
 */
export async function setGroupMembers({ group, alterIds, alters }) {
  if (!group) return { added: 0, removed: 0 };
  const wanted = new Set(alterIds || []);
  const keys = new Set(groupKeys(group));

  // Group side: the canonical member id for everyone who should be in.
  const memberSpIds = (alters || [])
    .filter((a) => wanted.has(a.id))
    .map(memberIdFor)
    .filter(Boolean);
  await base44.entities.Group.update(group.id, { member_sp_ids: memberSpIds });

  // Alter side: add/remove the entry, clearing stale duplicates under any key.
  let added = 0;
  let removed = 0;
  for (const alter of alters || []) {
    const shouldBeIn = wanted.has(alter.id);
    const entries = alter.groups || [];
    const withoutThis = entries.filter((g) => !keys.has(g?.id) && !keys.has(g?.sp_id));
    const matches = entries.length - withoutThis.length;
    const wasIn = matches > 0;
    // Stored exactly once, under the canonical id → already correct.
    const canonical = matches === 1 && entries.some((g) => g?.id === group.id);

    if (shouldBeIn) {
      if (canonical) continue;
      const next = [...withoutThis, {
        id: group.id,
        ...(group.sp_id ? { sp_id: group.sp_id } : {}),
        name: group.name,
        color: group.color || "",
      }];
      await base44.entities.Alter.update(alter.id, { groups: next });
      if (!wasIn) added += 1;
    } else {
      if (!wasIn) continue;
      await base44.entities.Alter.update(alter.id, { groups: withoutThis });
      removed += 1;
    }
  }
  return { added, removed };
}

// Convenience wrappers for single-member toggles, so callers don't have to
// rebuild the whole list themselves.
export async function addGroupMember({ group, alterId, alters }) {
  const next = new Set(currentMemberIds(group, alters));
  next.add(alterId);
  return setGroupMembers({ group, alterIds: [...next], alters });
}

export async function removeGroupMember({ group, alterId, alters }) {
  const next = new Set(currentMemberIds(group, alters));
  next.delete(alterId);
  return setGroupMembers({ group, alterIds: [...next], alters });
}

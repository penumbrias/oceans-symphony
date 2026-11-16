// Who a friend may see in your front status — ONE rule, used by every push
// (v0.371.14). Before this, four places built the list by hand: the always-on
// sync hook, setFront, and two pushes on the Friends page. Only the hook
// honoured groups marked "hide from friends", so opening the Friends page or
// changing a friend's visibility re-shared those members until the next switch.
//
// An alter is shared in the front status only when ALL of these hold:
//   - they exist and aren't archived,
//   - "Show when fronting" (Alter.friends_visible) isn't off — new alters
//     start with it off since v0.310.0 (privacy first),
//   - they aren't in a group flagged hide_from_friends.
// Per-friend hides and privacy overrides are applied later, in pushFrontStatus.
// Pure (no storage), so scripts/test-friend-fronters.mjs can run it; the
// fresh-read push is pushCurrentFront in friendsApi.js.
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";
import { sharedPreferences } from "@/lib/alterPreferences";

// Why an alter is kept out of the front status, or null when they're shared.
// "off" = their own "Show when fronting" switch; "group" = a hide-from-friends group.
export function frontShareBlock(alter, hiddenByGroup) {
  if (!alter || alter.is_archived) return "archived";
  if (hiddenByGroup?.has(alter.id)) return "group";
  if (alter.friends_visible === false) return "off";
  return null;
}

// Active sessions → [{ alterId, isPrimary }], one per alter. Handles both the
// per-alter rows and the legacy grouped shape (primary_alter_id + co_fronter_ids).
export function collectFronting(activeSessions = []) {
  const collected = [];
  const seen = new Set();
  let seenPrimary = false;
  const add = (alterId, isPrimary) => {
    if (!alterId || seen.has(alterId)) return;
    seen.add(alterId);
    collected.push({ alterId, isPrimary });
    if (isPrimary) seenPrimary = true;
  };
  for (const s of activeSessions || []) {
    if (s.alter_id) add(s.alter_id, !!s.is_primary);
    else if (s.primary_alter_id) {
      add(s.primary_alter_id, true);
      for (const coId of s.co_fronter_ids || []) add(coId, false);
    }
  }
  // No row flagged primary: lead with the first so the friend has a name.
  if (!seenPrimary && collected.length > 0) collected[0].isPrimary = true;
  return collected;
}

// The fronters payload for pushFrontStatus. `id` is the local alter id, kept
// so pushFrontStatus can apply per-friend hides; it strips it before sending.
export function buildFriendFronters({ activeSessions = [], alters = [], groups = [] }) {
  const altersById = new Map(alters.map((a) => [a.id, a]));
  const hiddenByGroup = getAlterIdsByGroupFlag(groups, alters, "hide_from_friends");
  const collected = collectFronting(activeSessions);
  const primaryId = collected.find((c) => c.isPrimary)?.alterId || null;
  return collected
    .map((c) => altersById.get(c.alterId))
    .filter((alter) => alter && !frontShareBlock(alter, hiddenByGroup))
    .map((alter) => ({
      id: alter.id,
      name: alter.name,
      initial: alter.name?.[0] || "?",
      color: alter.color || null,
      isPrimary: alter.id === primaryId,
      isCofronter: alter.id !== primaryId,
      // pushFrontStatus keeps or strips these per the share mode.
      pronouns: alter.pronouns || "",
      preferences: sharedPreferences(alter),
    }));
}

export const friendTerms = (terms = {}) => ({
  fronting: terms.fronting,
  front: terms.front,
  alter: terms.alter,
  system: terms.system,
});

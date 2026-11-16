// Who a friend may see in your front status — ONE rule, used by every push
// (v0.371.14; levels added in v0.372.2). Before v0.371.14 four places built the
// list by hand and only one honoured groups marked "hide from friends".
//
// Never shared with anyone: archived alters and alters in a group flagged
// hide_from_friends.
//
// Then, per friend (applied in pushFrontStatus through friendFrontersFor):
//   - a friend you've granted sharing levels (or revealed someone to) sees
//     EXACTLY the alters those levels show them — like Simply Plural buckets —
//     with only the fields the levels expose (no name → "?", no colour → none);
//   - any other friend sees alters whose "Show when fronting" switch
//     (Alter.friends_visible) isn't off. New alters start with it off.
//   - per-friend hides and the Hidden / Count only override still apply.
// Pure (no storage), so scripts/test-friend-fronters.mjs can run it; the
// fresh-read push is pushCurrentFront in friendsApi.js.
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";
import { sharedPreferences } from "@/lib/alterPreferences";
import { resolveAlterShare } from "@/lib/privacyLevels";

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

// Every fronter that COULD reach some friend, for pushFrontStatus. `id`,
// `friendsVisible` and `levelIds` are local bookkeeping, stripped before sending.
export function buildFriendFronters({ activeSessions = [], alters = [], groups = [] }) {
  const altersById = new Map(alters.map((a) => [a.id, a]));
  const hiddenByGroup = getAlterIdsByGroupFlag(groups, alters, "hide_from_friends");
  const collected = collectFronting(activeSessions);
  const primaryId = collected.find((c) => c.isPrimary)?.alterId || null;
  return collected
    .map((c) => altersById.get(c.alterId))
    .filter((alter) => {
      const why = frontShareBlock(alter, hiddenByGroup);
      return why === null || why === "off"; // "off" may still reach a friend through levels
    })
    .map((alter) => ({
      id: alter.id,
      // Local only — friendFrontersFor reads these, pushFrontStatus strips them.
      friendsVisible: alter.friends_visible !== false,
      levelIds: Array.isArray(alter.privacy_levels) ? alter.privacy_levels : [],
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

// Does this friend's visibility grant any levels or reveals? Then levels decide.
export function friendUsesLevels(vis) {
  return !!(vis && ((vis.allowedLevelIds || []).length || (vis.shownAlterIds || []).length));
}

const LOCAL_KEYS = ["id", "friendsVisible", "levelIds"];
export const stripLocal = (f) => {
  const out = { ...f };
  for (const k of LOCAL_KEYS) delete out[k];
  return out;
};

// The fronters one friend may see, before the Hidden / Count only override.
// `fronters` are buildFriendFronters' output (after the share-mode pass);
// `vis` is that friend's perFriendVisibility entry (or undefined).
export function friendFrontersFor(fronters, vis, levels = []) {
  const hidden = new Set(vis?.hiddenAlterIds || []);
  if (!friendUsesLevels(vis)) {
    return fronters.filter((f) => f.friendsVisible !== false && !hidden.has(f.id)).map(stripLocal);
  }
  const out = [];
  for (const f of fronters) {
    const fields = resolveAlterShare({
      alter: { id: f.id, privacy_levels: f.levelIds || [] },
      levels,
      allowedLevelIds: vis.allowedLevelIds || [],
      shownAlterIds: vis.shownAlterIds || [],
      hiddenAlterIds: vis.hiddenAlterIds || [],
    });
    if (!fields) continue;
    const g = stripLocal(f);
    if (!fields.has("name")) { g.name = "?"; g.initial = "?"; }
    if (!fields.has("color")) g.color = null;
    if (!fields.has("pronouns")) { delete g.pronouns; delete g.preferences; }
    out.push(g);
  }
  return out;
}

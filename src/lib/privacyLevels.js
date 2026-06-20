// Privacy levels — the data model + pure resolver for the friends alter-sharing
// feature (Phase 2). LOCAL only here; the live encrypted share (Phase 4) consumes
// `resolveVisibleAlters` to decide what each friend gets.
//
// Model:
//   • Levels catalogue lives on SystemSettings.privacy_levels (array). Each level
//     is { id, number, name, fields } where `fields` is a per-field exposure map
//     (which fields a viewer who can see this level gets). Empty catalogue by
//     default — sharing is opt-in.
//   • Each alter is assigned to ZERO OR MORE levels via alter.privacy_levels
//     (array of level ids). Default [] = "Private / shared with no one".
//   • A friend is granted a SET of level ids they may see (allowedLevelIds),
//     plus per-friend overrides: shownAlterIds (force-reveal) and hiddenAlterIds
//     (force-hide). Stored on FriendIdentity.perFriendVisibility[friendId].
//
// Resolution for a viewer:
//   • hiddenAlterIds wins → alter invisible.
//   • shownAlterIds → alter visible with ALL fields (explicit reveal).
//   • else visible iff the alter shares at least one level the viewer is granted;
//     fields = union of the matching levels' profiles (most permissive).

export const SHARE_FIELDS = ["name", "pronouns", "role", "age", "color", "avatar", "bio", "customFields", "groups"];

export const SHARE_FIELD_LABELS = {
  name: "Name",
  pronouns: "Pronouns",
  role: "Role",
  age: "Age",
  color: "Colour",
  avatar: "Avatar",
  bio: "Bio",
  customFields: "Custom fields",
  groups: "Groups",
};

export function getPrivacyLevels(settings) {
  const raw = settings?.privacy_levels;
  return Array.isArray(raw) ? raw : [];
}

// Shared styling for the selectable level / field pills. A faint tint
// (bg-primary/10) wasn't obviously "on" — selected is now a solid fill so
// on vs off is unmistakable. Callers add a leading ✓ to the label when on.
export function selectablePillClass(on) {
  return on
    ? "border-primary bg-primary text-primary-foreground font-semibold shadow-sm"
    : "border-border/50 text-muted-foreground/80 bg-transparent hover:bg-muted/40";
}

// Sensible starting exposure for a brand-new level: identity basics, no avatar
// or long-form fields. The user tunes it per level.
export function defaultFieldProfile() {
  return { name: true, pronouns: true, role: true, age: false, color: true, avatar: false, bio: false, customFields: false, groups: false };
}

function newId() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return `lvl-${crypto.randomUUID()}`; } catch { /* fall through */ }
  return `lvl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function makeLevel({ number, name } = {}) {
  return { id: newId(), number: Number.isFinite(number) ? number : 0, name: name || `Level ${number ?? 0}`, fields: defaultFieldProfile() };
}

// Levels sorted by their number (then name) — the order shown in pickers and
// the order the threshold slider walks.
export function sortedLevels(levels) {
  return [...(levels || [])].sort((a, b) => (a.number - b.number) || String(a.name).localeCompare(String(b.name)));
}

// Threshold grant → the level ids with number <= threshold. Powers the simple
// "show this friend levels 0–N" slider; advanced mode stores an arbitrary set.
export function levelIdsUpToThreshold(levels, threshold) {
  return sortedLevels(levels).filter((l) => l.number <= threshold).map((l) => l.id);
}

// Fields an alter exposes to a viewer, or null if the alter isn't visible.
export function resolveAlterShare({ alter, levels, allowedLevelIds = [], shownAlterIds = [], hiddenAlterIds = [] }) {
  if (!alter) return null;
  if (hiddenAlterIds.includes(alter.id)) return null;
  if (shownAlterIds.includes(alter.id)) return new Set(SHARE_FIELDS); // explicit reveal → everything
  const alterLevels = Array.isArray(alter.privacy_levels) ? alter.privacy_levels : [];
  if (!alterLevels.length) return null;
  const allowed = new Set(allowedLevelIds);
  const matching = (levels || []).filter((l) => allowed.has(l.id) && alterLevels.includes(l.id));
  if (!matching.length) return null;
  const fields = new Set();
  for (const l of matching) for (const f of SHARE_FIELDS) if (l.fields?.[f]) fields.add(f);
  return fields;
}

// The list a given friend's visibility config would expose: [{ alter, fields:Set }].
export function resolveVisibleAlters({ alters = [], levels = [], visibility = {} }) {
  const { allowedLevelIds = [], shownAlterIds = [], hiddenAlterIds = [] } = visibility || {};
  const out = [];
  for (const a of alters) {
    if (a.is_archived) continue;
    const fields = resolveAlterShare({ alter: a, levels, allowedLevelIds, shownAlterIds, hiddenAlterIds });
    if (fields) out.push({ alter: a, fields });
  }
  return out;
}

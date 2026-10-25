// Who a check-in's emotions belong to by default.
//
// Stored on SystemSettings as `emotion_attribution_default`:
//   "all"      — every fronter in the check-in (the original behaviour)
//   <levelId>  — only fronters at that front level
// An unknown level id (the level was deleted) reads as "all". Per-emotion
// overrides (press-and-hold an emotion) always win over this default.

export const EMOTION_ATTRIBUTION_ALL = "all";

export function emotionAttributionDefault(settingsRow, levelCfg) {
  const raw = settingsRow?.emotion_attribution_default;
  if (!raw || raw === EMOTION_ATTRIBUTION_ALL) return EMOTION_ATTRIBUTION_ALL;
  return (levelCfg?.levels || []).some((l) => l.id === raw) ? raw : EMOTION_ATTRIBUTION_ALL;
}

// fronterIds: the check-in's fronters. levelOf(id) → that fronter's level id.
// Falls back to every fronter when nobody is at the chosen level, so an
// emotion is never silently attributed to no one.
export function defaultEmotionAlterIds({ fronterIds = [], setting = EMOTION_ATTRIBUTION_ALL, levelOf }) {
  if (setting === EMOTION_ATTRIBUTION_ALL) return fronterIds;
  const atLevel = fronterIds.filter((id) => levelOf?.(id) === setting);
  return atLevel.length > 0 ? atLevel : fronterIds;
}

// ── Who an entry belongs to when nobody says (v0.279.3) ───────────────
// Stored on SystemSettings as `attribution_default`:
//   { mode: "all" }                         — everyone in front, every level
//                                             (owner decision, the default)
//   { mode: "exclude", exclude_levels: [] } — everyone in front except
//                                             those at these levels
//   { mode: "none" }                        — nobody; entries are saved
//                                             without anyone
// It applies wherever an entry is saved without a picker (widgets, quick
// actions, reminders, ~commands, locations, diary cards) and seeds the
// check-in's emotion default. An explicit choice always wins. Excluding
// is honest: when everyone in front is at an excluded level, the entry is
// saved without anyone rather than falling back to them.
//
// Returned as a stable string so it can sit in hook dependency lists:
// "all", "none" or "exclude:<id>,<id>". Level ids that no longer exist
// are dropped, and excluding nothing reads as "all".
export const ATTRIBUTION_ALL = "all";
export const ATTRIBUTION_NONE = "none";

export function attributionPolicy(settingsRow, levelCfg) {
  const raw = settingsRow?.attribution_default;
  if (!raw || typeof raw !== "object") return ATTRIBUTION_ALL;
  if (raw.mode === ATTRIBUTION_NONE) return ATTRIBUTION_NONE;
  if (raw.mode !== "exclude") return ATTRIBUTION_ALL;
  const known = new Set((levelCfg?.levels || []).map((l) => l.id));
  const ids = [...new Set((Array.isArray(raw.exclude_levels) ? raw.exclude_levels : []).filter((id) => known.has(id)))].sort();
  return ids.length ? `exclude:${ids.join(",")}` : ATTRIBUTION_ALL;
}

export function policyExcludedLevels(policy) {
  return typeof policy === "string" && policy.startsWith("exclude:")
    ? new Set(policy.slice("exclude:".length).split(",").filter(Boolean))
    : new Set();
}

// fronterIds + levelOf(id) → who the entry belongs to under the policy.
export function applyAttributionPolicy({ fronterIds = [], policy = ATTRIBUTION_ALL, levelOf }) {
  if (policy === ATTRIBUTION_NONE) return [];
  const excluded = policyExcludedLevels(policy);
  if (!excluded.size) return fronterIds;
  return fronterIds.filter((id) => !excluded.has(levelOf?.(id)));
}

// The check-in's emotion default: the general policy once the person has
// set one, else the older emotions-only setting above.
export function checkInEmotionDefault(settingsRow, levelCfg) {
  if (settingsRow?.attribution_default && typeof settingsRow.attribution_default === "object") {
    return { kind: "policy", value: attributionPolicy(settingsRow, levelCfg) };
  }
  return { kind: "legacy", value: emotionAttributionDefault(settingsRow, levelCfg) };
}

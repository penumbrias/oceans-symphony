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

// Group config (formerly "member visibility") — per-group boolean flags that
// hide a group's members from various surfaces. Each flag is enforced where
// the corresponding alters are surfaced, via
// `getAlterIdsByGroupFlag(groups, alters, flag)` in subsystemUtils.js.
//
// The first six are the redesigned "Group config" toggles. `hide_from_lists`
// is the older "hide from the alters directory" behaviour, kept so existing
// users don't silently lose it.
export const GROUP_CONFIG_FLAG_KEYS = [
  "hide_from_set_front",
  "hide_from_friends",
  "hide_from_mentions",
  "hide_from_authorship",
  "hide_from_system_maps",
  "hide_from_analytics",
  "hide_from_lists",
];

// Extract just the group-config booleans from a form/group object, coerced to
// real booleans, so create/update payloads stay clean.
export function pickGroupConfig(obj) {
  const out = {};
  for (const k of GROUP_CONFIG_FLAG_KEYS) out[k] = !!obj?.[k];
  return out;
}

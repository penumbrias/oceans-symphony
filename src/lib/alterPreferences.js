// Per-alter preferences & boundaries — a pronouns.cc-style structured list
// of labels with a comfort level, stored on `Alter.preferences` as an array:
//   [{ id, label, category, level }]
//
//   category: "pronouns" | "name" | "term" | "custom"
//   level:    1..5 → hate / dislike / neutral / like / love
//
// Rides on the Alter entity, so backup/restore coverage is automatic — no
// ENTITY_NAMES / EXPORT_CATEGORIES change needed.
//
// Sharing: fronter payloads to the Friends server can carry a filtered
// copy (see useFriendsFrontSync + pushFrontStatus's share-mode gate).
// Only level >= 2 entries are shared by default — a "hate" (1) entry is
// a boundary the user may want visible, so hated terms ARE included:
// the whole point of sharing boundaries is that friends learn what NOT
// to use. Everything is opt-in via the share mode anyway.

export const PREF_LEVELS = {
  1: { emoji: "💔", label: "Hate", color: "#DC2626" },
  2: { emoji: "👎", label: "Dislike", color: "#F97316" },
  3: { emoji: "😐", label: "Neutral", color: "#6B7280" },
  4: { emoji: "👍", label: "Like", color: "#22C55E" },
  5: { emoji: "❤️", label: "Love", color: "#EC4899" },
};

export const PREF_CATEGORIES = [
  { id: "pronouns", label: "Pronouns", hint: "she/her, they/them, xe/xem…" },
  { id: "name", label: "Names & nicknames", hint: "Names, nicknames, honorifics…" },
  { id: "term", label: "Terms & compliments", hint: "pretty, handsome, dude, bro…" },
  { id: "custom", label: "Other", hint: "Anything else with a comfort level" },
];

export function categoryMeta(id) {
  return PREF_CATEGORIES.find((c) => c.id === id) || PREF_CATEGORIES[3];
}

// Parse an alter's preferences defensively — the field may be missing
// (pre-feature alters), or malformed after a partial import.
export function parsePreferences(alter) {
  const raw = alter?.preferences;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p) => p && typeof p === "object" && typeof p.label === "string" && p.label.trim()
  ).map((p) => ({
    id: p.id || `${p.category || "custom"}-${p.label}`,
    label: p.label.trim(),
    category: PREF_CATEGORIES.some((c) => c.id === p.category) ? p.category : "custom",
    level: Number.isInteger(p.level) && p.level >= 1 && p.level <= 5 ? p.level : 3,
  }));
}

// Compose a display pronouns string from advanced pronouns entries —
// the loved/liked sets joined in level order (love first). Used as a
// fallback display and for the "share pronouns instead of name" mode.
export function composePronounsString(prefs) {
  const pronounSets = prefs
    .filter((p) => p.category === "pronouns" && p.level >= 4)
    .sort((a, b) => b.level - a.level)
    .map((p) => p.label);
  return pronounSets.join(" · ");
}

// The filtered copy of preferences included in a shared fronter payload.
// Strips ids (local-only) and drops nothing else — boundaries (hate)
// are exactly what friends most need to see.
export function sharedPreferences(alter) {
  return parsePreferences(alter).map(({ label, category, level }) => ({ label, category, level }));
}

// How the Friends pages word a friend (shared by the old page,
// src/pages/Friends.jsx, and the house's Friends room, src/house/friends/).
// Pure: no storage, no network, so scripts/test-house-friends.mjs runs it.
//
// A friend's terms and shared member payloads arrive from THEIR device
// (possibly another app version): every reader here normalises the shape
// before iterating, so an odd payload never takes a page down.

export function buildTermsFromFriend(friendTerms = {}) {
  const t = { ...(friendTerms || {}) };
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const ger = (s) => {
    if (!s) return s;
    if (s.endsWith('e') && !s.endsWith('ee')) return s.slice(0, -1) + 'ing';
    return s + 'ing';
  };
  const plu = (s) => {
    if (!s) return s;
    if (s.endsWith('s')) return s;
    if (s.endsWith('y')) return s.slice(0, -1) + 'ies';
    return s + 's';
  };
  const fr = t.front || 'front';
  return {
    system: t.system || 'system',
    System: cap(t.system || 'system'),
    alter: t.alter || 'alter',
    Alter: cap(t.alter || 'alter'),
    alters: t.alters || plu(t.alter || 'alter'),
    fronting: t.fronting || ger(fr),
    Fronting: cap(t.fronting || ger(fr)),
    fronter: fr + 'er',
    Fronter: cap(fr + 'er'),
    fronters: plu(fr + 'er'),
  };
}

// A shared member's groups and custom fields, whatever shape arrived:
//   groups:       ["Name"] | [{ name }] | "Name" | null
//   customFields: [["k","v"]] | [{ k, v }] | { k: v } | null
export function sharedGroupLabels(m) {
  const g = m?.groups;
  const list = Array.isArray(g) ? g : (g ? [g] : []);
  return list.map((x) => (typeof x === "string" ? x : x?.name || x?.label || "")).filter(Boolean);
}
export function sharedCustomFieldPairs(m) {
  const cf = m?.customFields;
  if (!cf) return [];
  const toStr = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  if (Array.isArray(cf)) {
    return cf.map((row) => {
      if (Array.isArray(row)) return [toStr(row[0]), toStr(row[1])];
      if (row && typeof row === "object") {
        const k = row.k ?? row.key ?? row.name ?? row.label ?? "";
        const v = row.v ?? row.value ?? "";
        return [toStr(k), toStr(v)];
      }
      return [toStr(row), ""];
    }).filter(([k]) => k);
  }
  if (typeof cf === "object") return Object.entries(cf).map(([k, v]) => [toStr(k), toStr(v)]).filter(([k]) => k);
  return [];
}

// One line on who's in front for a friend, in the friend's own words.
export function friendFrontSummary(friend) {
  const ft = buildTermsFromFriend(friend?.front?.terms);
  const fronters = friend?.front?.fronters || [];
  const privacyLevel = friend?.front?.privacyLevel || 'names';
  if (privacyLevel === 'hidden') return `${ft.Fronting} hidden`;
  if (fronters.length === 0) return `No one ${ft.fronting}`;
  if (privacyLevel === 'count_only') return `${fronters.length} ${fronters.length === 1 ? ft.fronter : ft.fronters}`;
  return fronters.map(f => f.name).join(', ');
}

// The three front-visibility levels (the profile's default and a friend's
// override) and the three share modes, in the words the old page uses.
export const FRONT_LEVELS = [
  { id: "hidden", label: "Hidden", hint: "no front info" },
  { id: "count_only", label: "Count only", hint: "how many, no names" },
  { id: "names", label: "Names and colours", hint: "who, with their colours" },
];
export const SHARE_MODES = [
  { id: "name", label: "Name only" },
  { id: "name_prefs", label: "Name + pronouns and preferences" },
  { id: "prefs_only", label: "Pronouns and preferences only (no name)" },
];
export const frontLevelLabel = (id) => (FRONT_LEVELS.find((l) => l.id === id) || FRONT_LEVELS[2]).label;
export const shareModeLabel = (id) => (SHARE_MODES.find((m) => m.id === id) || SHARE_MODES[0]).label;

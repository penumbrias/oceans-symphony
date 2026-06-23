// Pure helpers for the New Presences page: spot reoccurring presences and
// suggest which known alters a presence might be, from simple text/colour
// overlap with alter profiles + "get to know me" data. Heuristic only — these
// are HINTS surfaced to the user, never automatic links.

const norm = (s) => (s || "").toString().trim().toLowerCase();

// How many OTHER presences each presence resembles (shared normalized label,
// colour, emoji, or vibe). Returns a Map of presence.id -> count.
export function computeRecurrence(presences = []) {
  const out = new Map();
  for (const p of presences) {
    let count = 0;
    for (const q of presences) {
      if (q.id === p.id) continue;
      const sameLabel = norm(p.label) && norm(p.label) === norm(q.label);
      const sameColor = p.color && p.color === q.color;
      const sameEmoji = p.emoji && p.emoji === q.emoji;
      const sameVibe = norm(p.vibe) && norm(p.vibe) === norm(q.vibe);
      if (sameLabel || sameColor || sameEmoji || sameVibe) count++;
    }
    out.set(p.id, count);
  }
  return out;
}

// Searchable text blob for an alter, from profile + custom ("get to know me")
// fields, so a presence's words can be matched against it.
function alterText(alter) {
  const parts = [alter.name, alter.alias, alter.role, alter.pronouns, alter.bio];
  const cf = alter.alter_custom_fields;
  if (cf && typeof cf === "object") {
    for (const v of Object.values(cf)) parts.push(typeof v === "string" ? v : JSON.stringify(v));
  }
  return norm(parts.filter(Boolean).join(" "));
}

function hexClose(a, b) {
  if (!a || !b) return false;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  try {
    const to = (h) => {
      const c = h.replace("#", "");
      return [0, 2, 4].map((i) => parseInt(c.substr(i, 2), 16));
    };
    const [r1, g1, b1] = to(a);
    const [r2, g2, b2] = to(b);
    return Math.abs(r1 - r2) < 28 && Math.abs(g1 - g2) < 28 && Math.abs(b1 - b2) < 28;
  } catch {
    return false;
  }
}

// Suggest alters a presence might be. label/vibe word appearing in the alter's
// text scores +2; an exact name/alias match +2; a close colour +2. Returns up
// to `limit` alters with score > 0, best first, excluding already-linked /
// already-resolved alters.
export function suggestAlters(presence, alters = [], limit = 3) {
  const already = new Set(
    [...(presence.associated_alter_ids || []), presence.resolved_alter_id].filter(Boolean)
  );
  const words = [norm(presence.label), norm(presence.vibe)].filter((w) => w.length >= 2);
  const scored = [];
  for (const a of alters) {
    if (a.is_archived || already.has(a.id)) continue;
    let score = 0;
    const at = alterText(a);
    for (const w of words) {
      if (at.includes(w)) score += 2;
      if (norm(a.name) === w || norm(a.alias) === w) score += 2;
    }
    if (presence.color && a.color && hexClose(presence.color, a.color)) score += 2;
    if (score > 0) scored.push({ alter: a, score });
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, limit).map((s) => s.alter);
}

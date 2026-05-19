// "Help me unblend" — scoring engine.
//
// The page keeps a live-updating "Likely fronters" list at the bottom.
// Each entry's score is the sum of:
//   1. A time-of-day baseline — alters that have historically fronted
//      around this hour get a boost. Built from FrontingSession history.
//   2. Per-answer deltas — when the user picks a question option, each
//      alter's score changes by that option's `deltas` map.
//
// Scoring is deliberately additive + bounded so a user who never
// answered a question still sees a baseline ranking, and one wildly
// wrong answer doesn't completely wipe out other signal. The page
// owns the final ranking display.

// Score weight constants. Kept small so the page's display range
// stays readable and so we never claim more confidence than the
// signal warrants.
export const BASELINE_MAX = 10;     // max time-of-day bonus per alter
export const ANSWER_DELTA = 4;      // standard "yes, this matches" bonus
export const ANSWER_PENALTY = -2;   // standard "no, this doesn't match" penalty

/**
 * Baseline from time-of-day fronting history. Alters that fronted
 * during the same hour-of-day in past sessions get a positive bonus
 * proportional to how often they showed up. Returns a `{ [alterId]:
 * score }` map.
 */
export function timeOfDayBaseline(frontingSessions, alters, atDate = new Date()) {
  const targetHour = atDate.getHours();
  const counts = {};
  let totalRelevant = 0;
  for (const s of frontingSessions || []) {
    const start = s.start_time ? new Date(s.start_time) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    // Count any session that overlaps (or starts at) the target hour
    // — a 2-hour session at 8am should contribute to the 8 and 9
    // buckets. Cheap approximation: include sessions whose start
    // hour is within 1 of the target.
    const diff = Math.abs(start.getHours() - targetHour);
    if (diff > 1) continue;
    const id = s.alter_id || s.primary_alter_id;
    if (!id) continue;
    counts[id] = (counts[id] || 0) + 1;
    totalRelevant++;
    for (const co of s.co_fronter_ids || []) {
      counts[co] = (counts[co] || 0) + 0.5; // co-fronters count half
      totalRelevant += 0.5;
    }
  }
  const out = {};
  if (totalRelevant === 0) {
    for (const a of alters || []) out[a.id] = 0;
    return out;
  }
  for (const a of alters || []) {
    const share = (counts[a.id] || 0) / totalRelevant;
    out[a.id] = share * BASELINE_MAX;
  }
  return out;
}

/**
 * Apply an answer's `deltas` (a `{ alterId: number }` map or, more
 * commonly, the question's `score(alter, answer)` function output)
 * to the running totals. Returns a new map.
 */
export function applyAnswer(currentScores, deltas) {
  const out = { ...currentScores };
  for (const [id, delta] of Object.entries(deltas || {})) {
    out[id] = (out[id] || 0) + delta;
  }
  return out;
}

/**
 * Returns alters sorted by score, descending. Empty / missing scores
 * sort last. Archived alters are filtered out unless includeArchived
 * is true.
 */
export function rankAlters(scores, alters, { includeArchived = false } = {}) {
  return (alters || [])
    .filter((a) => includeArchived || !a.is_archived)
    .map((a) => ({ alter: a, score: scores[a.id] || 0 }))
    .sort((a, b) => b.score - a.score);
}

// Quick RGB-distance helper for the color question. Lower = closer.
// Falls back to a large number when either color is not parseable.
export function colorDistance(hexA, hexB) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return 9999;
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function parseHex(hex) {
  if (typeof hex !== "string") return null;
  const m = hex.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

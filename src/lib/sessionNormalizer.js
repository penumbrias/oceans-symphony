// Shared session-normalisation layer for every analytics surface.
//
// Why this exists:
//   - FrontingSession has two coexisting shapes: the legacy
//     `primary_alter_id` + `co_fronter_ids` group model, and the
//     newer per-alter `alter_id` + `is_primary` individual model.
//     Code that handled only one of them silently dropped data
//     (see /pages/CoFrontingAnalytics.jsx pre-rework).
//   - Sessions without `end_time` historically defaulted to
//     `Date.now()` when computing duration. A session opened
//     months ago and never closed leaks its whole "now minus
//     start" duration into every date-range view — which is why
//     a 30-day window could show "5085h fronting".
//   - Range filters frequently checked `start_time in range`
//     without clamping the computed duration to the range, so a
//     session that spans the range boundary contributed its
//     entire length instead of just the portion inside the range.
//
// This module solves all three by exposing one place to:
//   1. Normalise a raw FrontingSession into a uniform shape with
//      an explicit `alter_ids` array, primary flag, and explicit
//      open / closed status.
//   2. Compute a session's effective start/end inside a date
//      range — clamping at both ends, and treating open sessions
//      as ending at the smaller of "now" and "range end".
//   3. Treat sessions that have been open longer than a threshold
//      as stale (a sign the user forgot to close them), so the
//      analytics surface can warn instead of silently inflating.
//
// Every analytics surface should use these helpers; raw
// `?? Date.now()` patterns in analytics code are a bug.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Open sessions older than this are flagged via `isStale` so the
// UI can surface them for review. We do NOT silently truncate
// their duration any more — the user's data is the user's to
// interpret, the app's job is to ask "is this right?" rather
// than rewriting their numbers in the background.
export const STALE_OPEN_SESSION_HOURS = 48;

function toMs(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Normalise a raw FrontingSession row into a stable analytics
 * shape. Returns null if the row is unusable (missing start_time
 * or missing every form of alter reference).
 *
 * Shape:
 *   {
 *     id, raw,
 *     startMs, endMs,           // endMs is null when the session is still open
 *     isOpen,                   // true if no end_time
 *     isStale,                  // open longer than STALE_OPEN_SESSION_HOURS — not counted in totals
 *     alterIds,                 // every alter referenced (primary + co-fronters), de-duped
 *     primaryAlterId,           // resolved from is_primary / primary_alter_id, falls back to alterIds[0]
 *     coFronterIds,             // alterIds minus the primary
 *     isLegacyGroupModel,       // true when the row uses primary_alter_id + co_fronter_ids
 *   }
 */
export function normalizeSession(raw, now = Date.now()) {
  if (!raw) return null;
  const startMs = toMs(raw.start_time);
  if (startMs == null) return null;
  const endMs = toMs(raw.end_time);
  const isOpen = endMs == null;
  // Some alters legitimately stay fronting for days. The user
  // can mark a row as `confirmed_long_session: true` from the
  // stale-sessions modal so we don't cap it at 48h. Stays
  // "stale" for warning-list purposes only if the flag is off.
  const confirmedLong = !!raw.confirmed_long_session;
  const isStale = isOpen && !confirmedLong && (now - startMs) > STALE_OPEN_SESSION_HOURS * HOUR_MS;

  // Two source-of-truth paths. The individual model writes
  // `alter_id` per row with `is_primary` on the primary's row.
  // The legacy group model writes a single row with `primary_alter_id`
  // and `co_fronter_ids`.
  let alterIds = [];
  let primaryAlterId = null;
  let isLegacyGroupModel = false;
  if (raw.alter_id) {
    alterIds = [raw.alter_id];
    primaryAlterId = raw.is_primary ? raw.alter_id : null;
  } else if (raw.primary_alter_id || (raw.co_fronter_ids || []).length > 0) {
    isLegacyGroupModel = true;
    const seen = new Set();
    if (raw.primary_alter_id) { seen.add(raw.primary_alter_id); alterIds.push(raw.primary_alter_id); }
    for (const id of (raw.co_fronter_ids || [])) {
      if (id && !seen.has(id)) { seen.add(id); alterIds.push(id); }
    }
    primaryAlterId = raw.primary_alter_id || alterIds[0] || null;
  }
  if (alterIds.length === 0) return null;

  const primarySet = primaryAlterId ? new Set([primaryAlterId]) : new Set();
  const coFronterIds = alterIds.filter((id) => !primarySet.has(id));

  return {
    id: raw.id,
    raw,
    startMs,
    endMs,
    isOpen,
    isStale,
    confirmedLong,
    alterIds,
    primaryAlterId,
    coFronterIds,
    isLegacyGroupModel,
  };
}

export function normalizeSessions(rawList = [], now = Date.now()) {
  const out = [];
  for (const raw of rawList) {
    const n = normalizeSession(raw, now);
    if (n) out.push(n);
  }
  return out;
}

/**
 * Effective end of a session inside a [fromMs, toMs] window.
 * Open sessions extend to min(now, toMs) — we don't truncate
 * stale (>48h) ones any more, only flag them via `isStale` so
 * the UI can show a "looks forgotten — review?" banner. The
 * user is the one who decides whether the long duration is
 * accurate; the app no longer silently rewrites it.
 *
 * Returns null when the session doesn't intersect the window at all.
 */
export function effectiveEnd(session, fromMs, toMs, now = Date.now()) {
  if (!session) return null;
  if (session.endMs != null) return Math.min(session.endMs, toMs);
  return Math.min(now, toMs);
}

/**
 * Effective duration of a session within [fromMs, toMs] in
 * milliseconds. Sessions that don't overlap the window return 0.
 * Sessions that span past the window are clipped at both ends.
 */
export function effectiveDurationMs(session, fromMs, toMs, now = Date.now()) {
  if (!session) return 0;
  const start = Math.max(session.startMs, fromMs);
  const end = effectiveEnd(session, fromMs, toMs, now);
  if (end == null) return 0;
  return Math.max(0, end - start);
}

/**
 * Return only the sessions that intersect [fromMs, toMs] at all.
 * Pre-normalised input.
 */
export function sessionsInRange(sessions, fromMs, toMs, now = Date.now()) {
  const out = [];
  for (const s of sessions) {
    if (s.startMs > toMs) continue;
    const end = effectiveEnd(s, fromMs, toMs, now);
    if (end == null || end < fromMs) continue;
    out.push(s);
  }
  return out;
}

/**
 * Quick helper: list of stale-open sessions so a surface can show
 * a "looks like you forgot to close N sessions" hint.
 */
export function staleOpenSessions(sessions) {
  return sessions.filter((s) => s.isStale);
}

/**
 * For every pair of sessions that overlap inside [fromMs, toMs],
 * returns the overlap as a pair of alter-id sets so callers can
 * compute co-fronting time without re-walking the list O(n²) in
 * UI code.
 *
 * Returns an array of:
 *   { aliveAlterIds: Set<string>, startMs, endMs }
 * representing each interval where the set of "active" alters is
 * constant. Useful when you want to attribute time correctly:
 *   - if |aliveAlterIds| === 1 → solo time for that alter
 *   - if |aliveAlterIds| > 1   → co-fronting time, split evenly
 */
export function sliceByOverlap(sessions, fromMs, toMs, now = Date.now()) {
  // Sweep-line over [fromMs, toMs]: collect every start/end event
  // for sessions that intersect, sort by time, walk through and
  // maintain a multiset of alters active in each segment.
  const events = [];
  for (const s of sessions) {
    if (s.startMs > toMs) continue;
    const end = effectiveEnd(s, fromMs, toMs, now);
    if (end == null || end <= fromMs) continue;
    const start = Math.max(s.startMs, fromMs);
    if (end <= start) continue;
    events.push({ t: start, type: "open", session: s });
    events.push({ t: end, type: "close", session: s });
  }
  events.sort((a, b) => a.t - b.t || (a.type === "close" ? -1 : 1));

  const aliveCount = new Map(); // alterId → ref count
  const slices = [];
  let cursor = fromMs;
  for (const ev of events) {
    if (ev.t > cursor) {
      const aliveAlterIds = new Set();
      for (const [id, count] of aliveCount.entries()) {
        if (count > 0) aliveAlterIds.add(id);
      }
      if (aliveAlterIds.size > 0) {
        slices.push({ aliveAlterIds, startMs: cursor, endMs: ev.t });
      }
      cursor = ev.t;
    }
    const delta = ev.type === "open" ? 1 : -1;
    for (const id of ev.session.alterIds) {
      aliveCount.set(id, (aliveCount.get(id) || 0) + delta);
    }
  }
  return slices;
}

export const __test__ = { HOUR_MS, DAY_MS };

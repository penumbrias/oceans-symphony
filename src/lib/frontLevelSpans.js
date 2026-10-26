// A fronting session's level over time.
//
// A session's `front_level` is the level it is at NOW (or ended at). When
// the level changes while the session is running, the session is updated
// in place (so "fronting since" survives) — and the change is recorded in
// `level_changes`: [{ timestamp, from, to }], oldest first. Without that
// record, moving someone from "co-conscious" to "fronting" at 3pm repainted
// their whole morning at the new level on the timeline.
//
// `level_changes` is a log: entries are only ever appended, and sync keeps
// both devices' entries (LOG_FIELDS in syncMerge.js). Rows from before
// v0.282.2 have none and read as one level for their whole length.
//
// Pure helpers; no storage access.

const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);

// The recorded changes, cleaned and oldest first. Tolerates junk.
export function levelChangesOf(session) {
  const raw = session?.level_changes;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c === "object" && Number.isFinite(ms(c.timestamp)))
    .sort((a, b) => ms(a.timestamp) - ms(b.timestamp));
}

// The entry to append when a running session moves from `from` to `to`.
// Returns null when nothing actually changes.
export function levelChangeEntry({ from, to, at }) {
  if (!to || from === to) return null;
  return { timestamp: at, from: from || null, to };
}

// The session's level at a moment (ms). Before the first change it's that
// change's `from`; after a change, its `to`; with no changes, front_level.
export function levelAt(session, atMs) {
  const changes = levelChangesOf(session);
  if (!changes.length) return session?.front_level || null;
  let level = changes[0].from ?? null;
  for (const c of changes) {
    if (ms(c.timestamp) <= atMs) level = c.to;
    else break;
  }
  return level;
}

// [{ startMs, endMs, level }] covering startMs..endMs of the session, one
// span per level it was at. `level` null means "no level recorded" — the
// caller maps it the way it maps a session without front_level.
export function levelSpans(session, startMs, endMs) {
  const changes = levelChangesOf(session)
    .filter((c) => ms(c.timestamp) > startMs && ms(c.timestamp) < endMs);
  if (!changes.length) return [{ startMs, endMs, level: levelAt(session, startMs) }];
  const out = [];
  let from = startMs;
  let level = levelAt(session, startMs);
  for (const c of changes) {
    const t = ms(c.timestamp);
    if (t > from) out.push({ startMs: from, endMs: t, level });
    from = t;
    level = c.to;
  }
  out.push({ startMs: from, endMs, level });
  // Neighbours at the same level (a change there and back, or a no-op
  // entry from another device) read as one span.
  return out.reduce((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.level === s.level) last.endMs = s.endMs;
    else acc.push({ ...s });
    return acc;
  }, []);
}

// Splitting a session at `atMs`: the changes that belong to the part after
// the split, re-anchored so that part starts at `startLevel`.
export function changesAfter(session, atMs, startLevel) {
  const after = levelChangesOf(session).filter((c) => ms(c.timestamp) > atMs);
  if (!after.length) return [];
  return after.map((c, i) => (i === 0 ? { ...c, from: startLevel ?? c.from } : c));
}

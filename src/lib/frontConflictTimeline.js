// The advanced front-conflict review: both devices' front history side by
// side, day by day (owner, Oct 2026: "okay for this span of days, use this
// device, and then on this day specifically let me adjust the specific
// times").
//
// The person answers in three layers; the narrower one wins:
//   1. spans  — "from day A to day B, use device X" (or both)
//   2. days   — the same choice for one day
//   3. edits  — one session: new start/end, removed, or put back
// A day/span choice removes the sessions the LOSING device recorded that
// started that day. Sessions whose device isn't known (recorded before
// devices were told apart) are only ever changed by an edit.
//
// "Removed" is a soft mark (`removed_at`), never a delete: sync never
// applies deletions, so a deleted session would come straight back from the
// other device. The mark travels by field time like any edit, the entity
// proxy hides marked sessions from every screen, and the record itself
// stays in the database and in backups, so it can be put back here.
//
// Pure, no app imports — tested by scripts/test-sync-merge.mjs.

export const BOTH = "both";

const pad = (n) => String(n).padStart(2, "0");
// Calendar day in local time, "YYYY-MM-DD".
export function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function dayStart(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
export function shiftDay(key, by) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + by).toISOString());
}

const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);
export const isPlaceholder = (s) => !!s && (!!s.sync_demoted || (!!s.end_time && s.end_time === s.start_time));

// Which device recorded a session, or null when that isn't known.
//   origins:  { sessionId: deviceId } — sessions sync brought here
//   flagged:  { sessionId: deviceId } — the live fronts the other device sent
export function originOf(s, { thisDevice, origins = {}, flagged = {} }) {
  if (s.origin_device) return s.origin_device;
  if (origins[s.id]) return origins[s.id];
  if (flagged[s.id]) return flagged[s.id];
  // Live here and not a placeholder: this device's (the simple review card
  // makes the same call).
  if (s.is_active === true && !isPlaceholder(s)) return thisDevice;
  return null;
}

// The span a session covers, for drawing and for overlap. Placeholders
// cover from their start until now: on their own device they're live.
export function sessionSpan(s, now, flaggedIds = new Set()) {
  const start = ms(s.start_time);
  const live = s.is_active === true || (flaggedIds.has(s.id) && isPlaceholder(s));
  const end = live || !s.end_time ? ms(now) : ms(s.end_time);
  return { start, end: Math.max(start, end) };
}

// Days worth reviewing: the person's devices recorded fronts that overlap
// in time, or a flagged live front started then. Newest `lookbackDays`.
export function conflictDays({ sessions, now, lookbackDays = 45, origin, flaggedIds = new Set() }) {
  const days = new Set();
  const from = ms(now) - lookbackDays * 864e5;
  const known = sessions
    .filter((s) => !s.removed_at && s.start_time && ms(s.start_time) >= from)
    .map((s) => ({ s, o: origin(s), ...sessionSpan(s, now, flaggedIds) }))
    .filter((x) => x.o);
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      const a = known[i], b = known[j];
      if (a.o === b.o) continue;
      if (a.start < b.end && b.start < a.end) {
        days.add(dayKey(new Date(Math.max(a.start, b.start)).toISOString()));
      }
    }
  }
  for (const s of sessions) if (flaggedIds.has(s.id) && s.start_time) days.add(dayKey(s.start_time));
  if (flaggedIds.size) days.add(dayKey(now));
  return [...days].filter(Boolean).sort();
}

export function choiceForDay(day, { spans = [], days = {} }) {
  if (days[day]) return days[day];
  // The latest span added wins where spans overlap.
  for (let i = spans.length - 1; i >= 0; i--) {
    const sp = spans[i];
    if (sp.from <= day && day <= sp.to) return sp.keep;
  }
  return BOTH;
}

export class FrontReviewError extends Error {}

// The writes the answers make, as [{ id, patch }], plus `result`: each
// touched session as it will look (for the preview).
//   sessions:  every FrontingSession on this device, removed ones included
//   flagged:   { sessionId: { device, wasPrimary } } — the other device's
//              live fronts waiting on an answer
export function planAdvancedResolution({
  sessions, thisDevice, origins = {}, flagged = {}, spans = [], days = {}, edits = {}, now,
}) {
  const flaggedDevice = Object.fromEntries(Object.entries(flagged).map(([id, f]) => [id, f.device]));
  const origin = (s) => originOf(s, { thisDevice, origins, flagged: flaggedDevice });
  const anyFlagged = Object.keys(flagged).length > 0;
  const writes = [];
  const result = {};
  const liveAfter = [];

  for (const s of sessions) {
    if (!s?.id || !s.start_time) continue;
    const e = edits[s.id] || {};
    const isFlagged = !!flagged[s.id] && isPlaceholder(s);
    const o = origin(s);
    const choice = choiceForDay(dayKey(s.start_time), { spans, days });
    const remove = e.removed !== undefined
      ? !!e.removed
      : (s.removed_at ? true : (choice !== BOTH && !!o && o !== choice));
    const patch = {};

    if (remove) {
      if (!s.removed_at) patch.removed_at = now;
      // A removed front is never live — on either device.
      if (s.is_active === true) { patch.is_active = false; patch.end_time = s.end_time || now; }
    } else {
      if (s.removed_at) patch.removed_at = null;
      const start = e.start_time || s.start_time;
      if (e.start_time && e.start_time !== s.start_time) patch.start_time = e.start_time;
      const endEdited = e.end_time !== undefined && e.end_time !== s.end_time;
      if (endEdited && e.end_time) {
        if (ms(e.end_time) <= ms(start)) throw new FrontReviewError("A session can't end before it starts.");
        patch.is_active = false;
        patch.end_time = e.end_time;
      }
      if (ms(start) > ms(now)) throw new FrontReviewError("A session can't start in the future.");
      if (isFlagged) {
        // The other device's live front, kept. With a new end it becomes a
        // real finished session; otherwise it's live again on both devices.
        patch.sync_demoted = null;
        patch.is_primary = !!flagged[s.id].wasPrimary;
        if (!(endEdited && e.end_time)) {
          Object.assign(patch, { is_active: true, end_time: null, revived_at: now });
        }
      } else if (s.sync_demoted && (patch.start_time || patch.end_time)) {
        // An old placeholder given real times is a real session now.
        patch.sync_demoted = null;
      } else if (anyFlagged && s.is_active === true && !(endEdited && e.end_time)) {
        // This device's live front, kept: bring the other device's
        // placeholder copy of it back to life too.
        patch.revived_at = now;
      }
    }

    const after = { ...s, ...patch };
    if (after.is_active === true && !after.removed_at) liveAfter.push({ s, after, theirs: isFlagged, patch });
    if (Object.keys(patch).length) writes.push({ id: s.id, patch });
    result[s.id] = { ...after, _removed: !!after.removed_at, _origin: o, _changed: Object.keys(patch).length > 0 };
  }

  // One primary. The other device's leads (dropping OUR flag is a real
  // change that travels; theirs already reads false here — see
  // frontConflictPlan "both").
  const primaries = liveAfter.filter((x) => x.after.is_primary);
  if (primaries.length > 1) {
    const keep = primaries.find((x) => x.theirs) || primaries[0];
    for (const x of primaries) {
      if (x === keep) continue;
      if (x.theirs) { x.patch.is_primary = false; }
      else {
        let w = writes.find((w) => w.id === x.s.id);
        if (!w) { w = { id: x.s.id, patch: x.patch }; writes.push(w); }
        w.patch.is_primary = false;
      }
      result[x.s.id] = { ...result[x.s.id], is_primary: false, _changed: true };
    }
  }
  return { writes, result };
}

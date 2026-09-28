// Field-level merge rules for sync / backup import (stage 1 of the sync
// audit, docs/audit-2026-09-25/sync-merge-audit.md). Pure functions — no
// imports — so scripts/test-sync-merge.mjs can run them under plain node.
//
// ── Per-field times ────────────────────────────────────────────────────
// Every record written by this build carries `_ft`: when each field last
// changed. `_ft.__base` is the time of every field NOT listed (the create
// time for new records; the last known edit time for a record that
// predates field times). A record without `_ft` at all is "legacy": each
// of its fields is as old as its updated_date.
//
// Merging two versions of one record then decides FIELD BY FIELD — the
// newer change to that field wins. So an edit to an alter's pronouns on
// one device no longer drags that device's stale copy of every other
// field along with it, and a field the user deliberately cleared stays
// cleared (the clear is a newer change) instead of being refilled from
// the other device.
//
// Legacy compatibility (records written before this build):
//   - an EMPTY incoming value from a legacy record never blanks a local
//     value (the old rule — a legacy empty can't be told from "never set");
//   - a local field that is empty and has no recorded time of its own is
//     still filled from the other side (the old repair rule).

export const FIELD_TIMES = "_ft";
const META = new Set(["id", "created_date", "updated_date", "created_by", FIELD_TIMES]);

export function isEmptyValue(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

const ms = (iso) => Date.parse(iso || "") || 0;
const maxIso = (a, b) => (ms(a) >= ms(b) ? a : b) || a || b;

// When did this record's `field` last change?
export function fieldTime(rec, field) {
  const ft = rec?.[FIELD_TIMES];
  if (ft && typeof ft === "object") return ft[field] || ft.__base || rec.created_date || rec.updated_date || "";
  return rec?.updated_date || rec?.created_date || "";
}

// Field times for a brand-new record.
export function stampCreate(now) {
  return { __base: now };
}

// Field times after an update that wrote `patch` at `now`. Only fields
// whose value actually changed are re-stamped — rewriting a field with the
// same value must not make a stale copy look newer.
export function stampUpdate(before, patch, now) {
  const prev = before?.[FIELD_TIMES];
  const ft = prev && typeof prev === "object"
    ? { ...prev }
    : { __base: before?.updated_date || before?.created_date || now };
  for (const [k, v] of Object.entries(patch || {})) {
    if (META.has(k)) continue;
    if (JSON.stringify(before?.[k]) === JSON.stringify(v)) continue;
    ft[k] = now;
  }
  return ft;
}

// Field times after an in-place rewrite (reference rewrites etc.):
// re-stamp every field that differs between before and after.
export function stampDiff(before, after, now) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const patch = {};
  for (const k of keys) {
    if (META.has(k)) continue;
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) patch[k] = after?.[k];
  }
  return stampUpdate(before, patch, now);
}

// Merge `incoming` into the same-id `local` record, field by field.
// newerWins=false keeps the old "only fill empty local fields" behaviour.
export function mergeRecordFields(local, incoming, { newerWins = true } = {}) {
  if (!incoming || typeof incoming !== "object") return local;
  if (!local || typeof local !== "object") return incoming;
  const incomingHasTimes = !!(incoming[FIELD_TIMES] && typeof incoming[FIELD_TIMES] === "object");
  const localHasTimes = !!(local[FIELD_TIMES] && typeof local[FIELD_TIMES] === "object");
  const out = { ...local };
  // Start from local's times; a legacy local gets a base equal to its own
  // edit time, so every field it keeps still reads as exactly as old as it
  // was before.
  const ft = localHasTimes ? { ...local[FIELD_TIMES] } : { __base: local.updated_date || local.created_date || "" };
  let changed = false;
  let timesChanged = false;

  for (const [field, value] of Object.entries(incoming)) {
    if (META.has(field)) continue;
    const it = fieldTime(incoming, field);
    if (!(field in local)) {
      if (isEmptyValue(value) && !incomingHasTimes) continue;
      out[field] = value; ft[field] = it; changed = true; timesChanged = true;
      continue;
    }
    const lt = fieldTime(local, field);
    const same = JSON.stringify(out[field]) === JSON.stringify(value);
    if (newerWins && ms(it) > ms(lt)) {
      if (isEmptyValue(value) && !incomingHasTimes) continue;
      if (!same) { out[field] = value; changed = true; }
      ft[field] = it; timesChanged = true;
      continue;
    }
    // Local is the newer (or equal) change — keep it, except the legacy
    // repair: an empty local field with no time of its own takes a value.
    const localFieldTimed = localHasTimes && !!local[FIELD_TIMES][field];
    if (isEmptyValue(out[field]) && !isEmptyValue(value) && !localFieldTimed) {
      out[field] = value; ft[field] = it; changed = true; timesChanged = true;
    }
  }

  if (!changed && !timesChanged) return local;
  if (timesChanged || localHasTimes) out[FIELD_TIMES] = ft;
  if (changed) out.updated_date = maxIso(local.updated_date, incoming.updated_date);
  return out;
}

// ── Task completions (DailyProgress) ──────────────────────────────────
// A period's record holds a SET of ticked task ids. Two devices ticking
// different tasks in the same period must both keep their ticks, so the
// set merges per task: a task is ticked if its latest tick is newer than
// its latest untick (`cleared_times`, written by the shared writer). A
// tick with no time of its own (older builds) counts as happening at the
// record's completed_task_ids time.

export function dailyProgressPeriod(rec) {
  const f = rec?.frequency || "daily";
  const key = rec?.period_key || rec?.date || "";
  return key ? `${f}::${key}` : null;
}

function tickTimeOf(rec, id) {
  const t = rec?.completion_times?.[id];
  if (t) return t;
  if ((rec?.completed_task_ids || []).includes(id)) return fieldTime(rec, "completed_task_ids") || "1970-01-01T00:00:00.000Z";
  return null;
}

// Merge two records for the same period (same id, or duplicates).
// pointsFor(id) → the template's points, for the XP total.
export function mergeDailyProgress(a, b, { pointsFor = null, now = new Date().toISOString() } = {}) {
  // Everything but the tick set merges like any record.
  const base = mergeRecordFields(a, b);
  const ids = new Set([
    ...(a.completed_task_ids || []), ...(b.completed_task_ids || []),
    ...Object.keys(a.completion_times || {}), ...Object.keys(b.completion_times || {}),
    ...Object.keys(a.cleared_times || {}), ...Object.keys(b.cleared_times || {}),
  ]);
  const completed = [];
  const times = {};
  const cleared = {};
  for (const id of ids) {
    const ta = tickTimeOf(a, id), tb = tickTimeOf(b, id);
    const tick = ta && tb ? maxIso(ta, tb) : (ta || tb);
    const ca = a.cleared_times?.[id], cb = b.cleared_times?.[id];
    const clear = ca && cb ? maxIso(ca, cb) : (ca || cb);
    if (clear) cleared[id] = clear;
    if (tick && (!clear || ms(tick) > ms(clear))) {
      completed.push(id);
      // Only REAL tick times are kept — never fabricate one from a
      // legacy fallback (the review/timeline show "untimed" honestly).
      const real = [a.completion_times?.[id], b.completion_times?.[id]].filter(Boolean);
      if (real.length) times[id] = real.reduce((x, y) => maxIso(x, y));
    }
  }
  // Stable order: the keeper's order first, then new ids.
  const order = [...(a.completed_task_ids || []), ...(b.completed_task_ids || [])];
  completed.sort((x, y) => {
    const ix = order.indexOf(x), iy = order.indexOf(y);
    return (ix === -1 ? 1e9 : ix) - (iy === -1 ? 1e9 : iy);
  });

  const out = { ...base, id: a.id, created_date: a.created_date, completed_task_ids: completed, completion_times: times };
  if (Object.keys(cleared).length) out.cleared_times = cleared;
  else delete out.cleared_times;
  if (pointsFor) out.xp_earned = completed.reduce((s, id) => s + (pointsFor(id) || 0), 0);

  const differs = JSON.stringify(completed) !== JSON.stringify(a.completed_task_ids || [])
    || JSON.stringify(times) !== JSON.stringify(a.completion_times || {})
    || JSON.stringify(cleared) !== JSON.stringify(a.cleared_times || {})
    || base !== a;
  if (!differs) return a;
  const ft = { ...(base[FIELD_TIMES] || { __base: a.updated_date || a.created_date || now }) };
  const tickFieldTime = maxIso(fieldTime(a, "completed_task_ids"), fieldTime(b, "completed_task_ids"));
  for (const f of ["completed_task_ids", "completion_times", "cleared_times", "xp_earned"]) ft[f] = tickFieldTime;
  out[FIELD_TIMES] = ft;
  out.updated_date = maxIso(a.updated_date, b.updated_date);
  return out;
}

// Pick the record that survives when several share one period: the
// earliest created, then the smallest id — the same choice on every
// device, so they converge on one record.
export function pickDailyProgressKeeper(records) {
  return [...records].sort((x, y) =>
    (ms(x.created_date) - ms(y.created_date)) || String(x.id).localeCompare(String(y.id)))[0];
}

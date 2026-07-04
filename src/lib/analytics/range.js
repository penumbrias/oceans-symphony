// Canonical date-range + day-bucketing for EVERY analytics surface.
//
// This is the single place that decides what "a day" and "a window" mean.
// The old analytics stack had five parallel implementations of range
// clamping (analyticsAggregator, analyticsEngine, diaryAnalytics,
// planAnalytics, reportSections) which drifted — the therapy report could
// show different numbers than the Analytics page for the same range.
// Every new-analytics consumer goes through here instead.
//
// Conventions:
//   - Day keys are LOCAL-date "YYYY-MM-DD" strings (same convention as
//     getTodayString in dailyTaskSystem.js) so a check-in at 23:30 lands
//     on the day the user experienced it.
//   - A range is inclusive of both endpoint days: [startOfDay(from),
//     endOfDay(to)].
//   - Nothing here fabricates data for unlogged days — bucketing returns
//     only days that have items; callers decide (per the honesty rules in
//     baselines.js) whether an absent day means 0 or "unknown".

import { startOfDay, endOfDay } from "date-fns";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function toMs(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

// Local-date day key for a timestamp (ms or parseable date value).
export function dayKey(v) {
  const ms = toMs(v);
  if (ms == null) return null;
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Build the canonical range object used by rollups/baselines/insights.
//   { fromMs, toMs, now, days, dayKeys }
// `to` is clamped to `now` so future days never count as "unlogged".
export function buildRange(from, to, now = Date.now()) {
  const fromMs = startOfDay(from instanceof Date ? from : new Date(from)).getTime();
  let toMs = endOfDay(to instanceof Date ? to : new Date(to)).getTime();
  if (toMs > now) toMs = now;
  const keys = eachDayKey(fromMs, toMs);
  return { fromMs, toMs, now, days: keys.length, dayKeys: keys };
}

// Convenience: the trailing N-day window ending "today" (inclusive).
export function lastNDays(n, now = Date.now()) {
  return buildRange(new Date(now - (n - 1) * DAY_MS), new Date(now), now);
}

// The window of equal length immediately BEFORE a range — used for
// "recent vs prior" trend comparisons.
export function priorRange(range) {
  const lengthMs = range.toMs - range.fromMs;
  const toMs = range.fromMs - 1;
  return buildRange(new Date(toMs - lengthMs), new Date(toMs), range.now);
}

// Every local-date day key from fromMs..toMs inclusive. Walks by local
// noon to be DST-safe (a 23h/25h day never skips or doubles a key).
export function eachDayKey(fromMs, toMs) {
  const keys = [];
  let cursor = new Date(fromMs);
  cursor.setHours(12, 0, 0, 0);
  const end = new Date(toMs).getTime();
  while (startOfDay(cursor).getTime() <= end) {
    keys.push(dayKey(cursor.getTime()));
    cursor = new Date(cursor.getTime() + DAY_MS);
    cursor.setHours(12, 0, 0, 0);
  }
  return keys;
}

export function inRange(ms, range) {
  return ms != null && ms >= range.fromMs && ms <= range.toMs;
}

// Bucket items by local day key. Only days that HAVE items appear in the
// map — no zero-fill here (see file header).
//   getMs: (item) => ms | null
export function bucketByDay(items, getMs, range = null) {
  const map = new Map();
  for (const item of items || []) {
    const ms = getMs(item);
    if (ms == null) continue;
    if (range && !inRange(ms, range)) continue;
    const key = dayKey(ms);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

// 0=Sunday..6=Saturday for a day key (local).
export function weekdayOf(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}

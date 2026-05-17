// Plan completion analytics helpers — pure, deterministic, memoisable.
//
// Inputs are Activity records (real ones, not synthetic to-do shells) plus
// the activityCategories list. Every helper accepts an optional
// `{ from, to }` window — both Date objects or ISO strings — and filters
// records by `timestamp`.
//
// A "plan" for the purposes of this module is any record whose effective
// status (via statusFor) is one of:
//   scheduled | done | partial | skipped | cancelled
//
// Pure logged activities (status === "logged") are ignored — they were
// never scheduled, so they don't contribute to completion analytics.
//
// "Resolved" means status ∈ { done, partial, skipped, cancelled }. A
// scheduled-but-past-time plan is considered UNRESOLVED in the
// breakdowns; the top-line summary surfaces unresolved separately.

import { startOfWeek, addDays, addWeeks, format } from "date-fns";
import {
  statusFor,
  isResolved,
  ACTIVITY_STATUSES,
} from "@/lib/activityStatus";

const PLAN_STATUSES = new Set([
  ACTIVITY_STATUSES.SCHEDULED,
  ACTIVITY_STATUSES.DONE,
  ACTIVITY_STATUSES.PARTIAL,
  ACTIVITY_STATUSES.SKIPPED,
  ACTIVITY_STATUSES.CANCELLED,
]);

function inWindow(activity, from, to) {
  if (!activity?.timestamp) return false;
  const ms = new Date(activity.timestamp).getTime();
  if (Number.isNaN(ms)) return false;
  if (from && ms < new Date(from).getTime()) return false;
  if (to && ms > new Date(to).getTime()) return false;
  return true;
}

function isPlan(activity) {
  return PLAN_STATUSES.has(statusFor(activity));
}

function isCompleted(status) {
  return status === ACTIVITY_STATUSES.DONE || status === ACTIVITY_STATUSES.PARTIAL;
}

function timeOfDayBucket(date) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

const DOW_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function emptyBucket() {
  return {
    total: 0,
    scheduled: 0,
    done: 0,
    partial: 0,
    skipped: 0,
    cancelled: 0,
    unresolvedPast: 0,
  };
}

function applyToBucket(bucket, status, isPast) {
  bucket.total += 1;
  bucket[status] = (bucket[status] || 0) + 1;
  if (status === ACTIVITY_STATUSES.SCHEDULED && isPast) {
    bucket.unresolvedPast += 1;
  }
}

function pct(numer, denom) {
  if (!denom) return 0;
  return Math.round((numer / denom) * 100);
}

function withRates(bucket) {
  const resolved =
    bucket.done + bucket.partial + bucket.skipped + bucket.cancelled;
  const completed = bucket.done + bucket.partial;
  return {
    ...bucket,
    resolved,
    completedPct: pct(completed, resolved),
    skippedPct: pct(bucket.skipped, resolved),
    cancelledPct: pct(bucket.cancelled, resolved),
    partialPct: pct(bucket.partial, resolved),
  };
}

// Top-line summary for a window. `scheduled` counts ALL plans in the
// window regardless of outcome (so it matches the user's mental model of
// "I planned N things this month"). `unresolvedPast` is the subset of
// still-`scheduled` records whose timestamp is already past — these are
// surfaced separately because they distort completion rates.
export function summarisePlans(activities = [], { from, to } = {}) {
  const nowMs = Date.now();
  const counts = emptyBucket();
  let totalReschedules = 0;
  let rescheduleSamples = 0;
  for (const a of activities) {
    if (!isPlan(a)) continue;
    if (!inWindow(a, from, to)) continue;
    const status = statusFor(a);
    const isPast = a.timestamp && new Date(a.timestamp).getTime() < nowMs;
    applyToBucket(counts, status, isPast);
    if (Array.isArray(a.reschedule_history) && a.reschedule_history.length > 0) {
      totalReschedules += a.reschedule_history.length;
      rescheduleSamples += 1;
    }
  }
  const resolved = counts.done + counts.partial + counts.skipped + counts.cancelled;
  const completed = counts.done + counts.partial;
  return {
    scheduled: counts.total,
    stillScheduledFuture: counts.scheduled - counts.unresolvedPast,
    unresolvedPast: counts.unresolvedPast,
    completed,
    done: counts.done,
    partial: counts.partial,
    skipped: counts.skipped,
    cancelled: counts.cancelled,
    resolved,
    completedPct: pct(completed, resolved),
    cancelledPct: pct(counts.cancelled, resolved),
    skippedPct: pct(counts.skipped, resolved),
    avgRescheduleCount: rescheduleSamples > 0
      ? Math.round((totalReschedules / rescheduleSamples) * 10) / 10
      : 0,
    rescheduleSamples,
  };
}

// Per-category breakdown. Activities can belong to multiple categories
// (activity_category_ids[]) — each plan is counted under every category
// it references. An "Uncategorised" pseudo-row collects plans with no
// category. Sorted by completion rate ascending so pain points come
// first; rows with no resolved plans sink to the end.
export function byCategory(activities = [], categories = [], { from, to } = {}) {
  const nowMs = Date.now();
  const byId = new Map();
  for (const c of categories) byId.set(c.id, c);
  const map = new Map(); // catId | "__uncategorised" -> bucket
  const labelFor = (catId) => {
    if (catId === "__uncategorised") return "Uncategorised";
    return byId.get(catId)?.name || "Unknown";
  };
  for (const a of activities) {
    if (!isPlan(a)) continue;
    if (!inWindow(a, from, to)) continue;
    const status = statusFor(a);
    const isPast = a.timestamp && new Date(a.timestamp).getTime() < nowMs;
    const catIds = Array.isArray(a.activity_category_ids) && a.activity_category_ids.length > 0
      ? a.activity_category_ids
      : ["__uncategorised"];
    for (const catId of catIds) {
      if (!map.has(catId)) map.set(catId, emptyBucket());
      applyToBucket(map.get(catId), status, isPast);
    }
  }
  const out = [];
  for (const [catId, bucket] of map.entries()) {
    const row = withRates(bucket);
    out.push({
      categoryId: catId === "__uncategorised" ? null : catId,
      label: labelFor(catId),
      color: catId === "__uncategorised" ? null : (byId.get(catId)?.color || null),
      ...row,
    });
  }
  // Sort: pain points first (lowest completion rate among rows that
  // actually have resolved plans), then rows with only-unresolved data
  // at the end.
  out.sort((a, b) => {
    if (a.resolved === 0 && b.resolved === 0) return b.total - a.total;
    if (a.resolved === 0) return 1;
    if (b.resolved === 0) return -1;
    if (a.completedPct !== b.completedPct) return a.completedPct - b.completedPct;
    return b.total - a.total;
  });
  return out;
}

export function byTimeOfDay(activities = [], { from, to } = {}) {
  const nowMs = Date.now();
  const buckets = {
    morning: emptyBucket(),
    afternoon: emptyBucket(),
    evening: emptyBucket(),
    night: emptyBucket(),
  };
  for (const a of activities) {
    if (!isPlan(a)) continue;
    if (!inWindow(a, from, to)) continue;
    const status = statusFor(a);
    const ts = new Date(a.timestamp);
    if (Number.isNaN(ts.getTime())) continue;
    const isPast = ts.getTime() < nowMs;
    const key = timeOfDayBucket(ts);
    applyToBucket(buckets[key], status, isPast);
  }
  const out = {};
  for (const k of Object.keys(buckets)) out[k] = withRates(buckets[k]);
  return out;
}

export function byDayOfWeek(activities = [], { from, to } = {}) {
  const nowMs = Date.now();
  const buckets = {};
  for (const k of DOW_KEYS) buckets[k] = emptyBucket();
  for (const a of activities) {
    if (!isPlan(a)) continue;
    if (!inWindow(a, from, to)) continue;
    const status = statusFor(a);
    const ts = new Date(a.timestamp);
    if (Number.isNaN(ts.getTime())) continue;
    const isPast = ts.getTime() < nowMs;
    const key = DOW_KEYS[ts.getDay()];
    applyToBucket(buckets[key], status, isPast);
  }
  const out = {};
  for (const k of DOW_KEYS) out[k] = withRates(buckets[k]);
  return out;
}

// 8-bucket (default) trend: weekly completion rate, oldest first.
// `weekStartsOn` is 0 (Sun) by default to match the rest of the app's
// default. The window's `from` arg is ignored — the trend always anchors
// to "now minus N weeks" so the graph reads consistently.
export function weeklyTrend(activities = [], { weeks = 8, weekStartsOn = 0 } = {}) {
  const now = new Date();
  const start = startOfWeek(addWeeks(now, -(weeks - 1)), { weekStartsOn });
  const slots = Array.from({ length: weeks }, (_, i) => {
    const ws = addWeeks(start, i);
    return {
      weekStart: ws,
      label: format(ws, "MMM d"),
      bucket: emptyBucket(),
    };
  });
  const slotEndMs = (ws) => addDays(ws, 7).getTime();
  for (const a of activities) {
    if (!isPlan(a)) continue;
    if (!a.timestamp) continue;
    const ms = new Date(a.timestamp).getTime();
    if (Number.isNaN(ms)) continue;
    const slot = slots.find((s) => ms >= s.weekStart.getTime() && ms < slotEndMs(s.weekStart));
    if (!slot) continue;
    const status = statusFor(a);
    const isPast = ms < Date.now();
    applyToBucket(slot.bucket, status, isPast);
  }
  return slots.map((s) => {
    const row = withRates(s.bucket);
    return {
      weekStart: s.weekStart.toISOString(),
      label: s.label,
      ...row,
    };
  });
}

// Identify the standout time-of-day or day-of-week contrast — used by
// the therapy report's plain-text insight. Returns null if there's not
// enough data to draw a meaningful contrast.
export function findContrastingPattern(activities, { from, to } = {}) {
  const tod = byTimeOfDay(activities, { from, to });
  const dow = byDayOfWeek(activities, { from, to });
  const todRows = Object.entries(tod).filter(([, v]) => v.resolved >= 2);
  const dowRows = Object.entries(dow).filter(([, v]) => v.resolved >= 2);
  let best = null;
  const candidates = [];
  if (todRows.length >= 2) {
    const sorted = [...todRows].sort((a, b) => a[1].completedPct - b[1].completedPct);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    candidates.push({
      kind: "timeOfDay",
      low: { key: low[0], ...low[1] },
      high: { key: high[0], ...high[1] },
      spread: high[1].completedPct - low[1].completedPct,
    });
  }
  if (dowRows.length >= 2) {
    const sorted = [...dowRows].sort((a, b) => a[1].completedPct - b[1].completedPct);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    candidates.push({
      kind: "dayOfWeek",
      low: { key: low[0], ...low[1] },
      high: { key: high[0], ...high[1] },
      spread: high[1].completedPct - low[1].completedPct,
    });
  }
  for (const c of candidates) {
    if (c.spread < 15) continue; // not interesting
    if (!best || c.spread > best.spread) best = c;
  }
  return best;
}

// Recurring-plan completion rates, grouped by recurrence_group_id. Used
// in therapy reports — therapists tend to care about regular
// commitments more than one-offs. Each row carries the most common
// title in the group as its label.
export function recurringPlanRollup(activities = [], { from, to } = {}) {
  const groups = new Map();
  for (const a of activities) {
    if (!a.recurrence_group_id) continue;
    if (!isPlan(a)) continue;
    if (!inWindow(a, from, to)) continue;
    const key = a.recurrence_group_id;
    if (!groups.has(key)) {
      groups.set(key, { bucket: emptyBucket(), names: new Map(), categoryIds: new Set() });
    }
    const g = groups.get(key);
    const status = statusFor(a);
    const isPast = a.timestamp && new Date(a.timestamp).getTime() < Date.now();
    applyToBucket(g.bucket, status, isPast);
    const name = a.activity_name || "Untitled plan";
    g.names.set(name, (g.names.get(name) || 0) + 1);
    (a.activity_category_ids || []).forEach((c) => g.categoryIds.add(c));
  }
  const out = [];
  for (const [groupId, g] of groups.entries()) {
    if (g.bucket.total < 2) continue; // need at least 2 instances to be useful
    let bestName = "Untitled plan";
    let bestCount = -1;
    for (const [n, c] of g.names.entries()) {
      if (c > bestCount) { bestCount = c; bestName = n; }
    }
    out.push({
      groupId,
      label: bestName,
      categoryIds: Array.from(g.categoryIds),
      ...withRates(g.bucket),
    });
  }
  // Most-instances first.
  out.sort((a, b) => b.total - a.total);
  return out;
}

export const TIME_OF_DAY_LABELS = Object.freeze({
  morning: "Morning (5am–12pm)",
  afternoon: "Afternoon (12pm–5pm)",
  evening: "Evening (5pm–9pm)",
  night: "Night (9pm–5am)",
});

export const DAY_OF_WEEK_LABELS = Object.freeze({
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
});

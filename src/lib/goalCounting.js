// How Goals counts the activities that happened — the one place the
// "drawing 3 times a week" points and the weekly-minutes points read from.
//
// Three things used to make a real drawing session count as "0 this week":
//  • the week started on Sunday here while the planner (and the person's
//    own "week starts on" setting) starts it on Monday, so anything from
//    Monday to Saturday vanished the moment Sunday came round;
//  • an entry saved with just a typed name ("Drawing") and no activity
//    picked carries no category id at all;
//  • a "some time that day" plan marked done has a day but no timestamp,
//    and older entries keep their activity in parent_category_id.
// Everything here is pure so scripts/test-goal-counts.mjs can check it.

import { startOfWeek, endOfWeek } from "date-fns";
import { statusFor, countableMinutes, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { indexById, getAncestorIds } from "@/lib/categoryTreeUtils";
import { getPlannerPrefs } from "@/lib/planner/displayPrefs";

export const HAPPENED = new Set([ACTIVITY_STATUSES.LOGGED, ACTIVITY_STATUSES.DONE, ACTIVITY_STATUSES.PARTIAL]);

// The person's "week starts on" (the planner's setting: Monday unless they
// chose Sunday).
export function goalWeekStartsOn() {
  try { return getPlannerPrefs().weekStartsOn; } catch { return 1; }
}

export function goalWeekWindow(now = new Date(), weekStartsOn = goalWeekStartsOn()) {
  const start = startOfWeek(now, { weekStartsOn });
  return { start, end: endOfWeek(start, { weekStartsOn }) };
}

// When an entry happened: its time, or (for a "some time that day" entry)
// midday on its day.
export function activityWhen(a) {
  if (a?.timestamp) {
    const d = new Date(a.timestamp);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof a?.planned_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.planned_date)) {
    const d = new Date(`${a.planned_date}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const nameKey = (s) => String(s || "").trim().toLowerCase();

// Activity names → ids, for entries that only carry a typed name.
export function categoryNameIndex(categories = []) {
  const out = new Map();
  for (const c of categories || []) {
    if (!c?.id || c.removed_at || c.trashed_at) continue;
    const k = nameKey(c.name);
    if (!k) continue;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(c.id);
  }
  return out;
}

// Which activities an entry is: the ones picked for it (and the older
// single field); when none were picked, the activity its typed name matches.
export function activityCategoryIds(a, nameIndex) {
  const ids = new Set(Array.isArray(a?.activity_category_ids) ? a.activity_category_ids.filter(Boolean) : []);
  if (a?.parent_category_id) ids.add(a.parent_category_id);
  if (ids.size === 0 && nameIndex) {
    for (const id of nameIndex.get(nameKey(a?.activity_name)) || []) ids.add(id);
  }
  return [...ids];
}

function matcher(categoryId, categories, { nested }) {
  const byId = indexById(categories || []);
  return (cid) => cid === categoryId || (nested && getAncestorIds(cid, byId).includes(categoryId));
}

// Times an activity (or anything nested under it) actually happened —
// since `from` (the point's creation), or this week.
export function countActivityTimes(step, { activities = [], categories = [], now = new Date(), weekStartsOn } = {}) {
  if (!step?.category_id) return 0;
  const from = step.count_period === "week"
    ? goalWeekWindow(now, weekStartsOn ?? goalWeekStartsOn()).start
    : (step.created_date ? new Date(step.created_date) : new Date(0));
  const names = categoryNameIndex(categories);
  const hits = matcher(step.category_id, categories, { nested: true });
  let n = 0;
  for (const a of activities || []) {
    if (!a || !HAPPENED.has(statusFor(a))) continue;
    const when = activityWhen(a);
    if (!when || when < from || when > now) continue;
    if (activityCategoryIds(a, names).some(hits)) n += 1;
  }
  return n;
}

// Minutes this week on one activity (a weekly-minutes point).
export function activityMinutesThisWeek(categoryId, { activities = [], categories = [], now = new Date(), weekStartsOn } = {}) {
  if (!categoryId) return 0;
  const { start, end } = goalWeekWindow(now, weekStartsOn ?? goalWeekStartsOn());
  const names = categoryNameIndex(categories);
  const hits = matcher(categoryId, categories, { nested: false });
  return (activities || []).reduce((sum, a) => {
    const when = activityWhen(a);
    if (!when || when < start || when > end) return sum;
    if (!activityCategoryIds(a, names).some(hits)) return sum;
    return sum + countableMinutes(a);
  }, 0);
}

// Every entry a counted point counts, with when it happened — since `from`.
export function countedEntries(step, { activities = [], categories = [], from = new Date(0), now = new Date() } = {}) {
  if (!step?.category_id) return [];
  const names = categoryNameIndex(categories);
  const hits = matcher(step.category_id, categories, { nested: true });
  const out = [];
  for (const a of activities || []) {
    if (!a || !HAPPENED.has(statusFor(a))) continue;
    const when = activityWhen(a);
    if (!when || when < from || when > now) continue;
    if (activityCategoryIds(a, names).some(hits)) out.push({ activity: a, when });
  }
  return out.sort((x, y) => x.when - y.when);
}

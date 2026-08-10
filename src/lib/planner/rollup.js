// Totals — what the week actually adds up to.
//
// Per activity, per category, per alter. This is the number the planner
// exists to produce: how long you spent drawing, how long on that game, and
// who was doing it.
//
// Counting rules:
//  • Only entries that HAPPENED count (logged / done / partial). A plan you
//    didn't do must never inflate a total.
//  • partial uses actual_duration_minutes when it has one, since that's the
//    point of partial.
//  • An entry with several alters counts its full length for EACH of them —
//    two people painting for an hour is an hour each, not half an hour each.
//    Per-alter totals therefore sum to more than the clock, which is correct.

import { getAncestorIds, indexById } from "@/lib/categoryTreeUtils";

const COUNTS = new Set(["logged", "done", "partial"]);

export function countsTowardTotals(activity) {
  const status = activity?.status;
  // Legacy rows have no status: a past timestamp means it happened.
  if (!status) return !!activity?.timestamp && new Date(activity.timestamp) <= new Date();
  return COUNTS.has(status);
}

export function minutesOf(activity) {
  const actual = Number(activity?.actual_duration_minutes);
  if (Number.isFinite(actual) && actual > 0) return actual;
  const planned = Number(activity?.duration_minutes);
  return Number.isFinite(planned) && planned > 0 ? planned : 0;
}

export function inRange(activity, from, to) {
  if (!activity?.timestamp) return false;
  const t = new Date(activity.timestamp).getTime();
  return t >= from.getTime() && t < to.getTime();
}

/**
 * Roll up a window.
 *
 * `categories` lets a child's time also count towards its parents, so
 * "Work" totals both its locations without double-counting inside itself.
 */
export function rollup({ activities = [], from, to, categories = [], alterIds = {} }) {
  const byId = indexById(categories);
  const byActivity = new Map();
  const byCategory = new Map();
  const byAlter = new Map();
  let total = 0;

  for (const a of activities) {
    if (!inRange(a, from, to) || !countsTowardTotals(a)) continue;
    const mins = minutesOf(a);
    if (!mins) continue;
    total += mins;

    const name = a.activity_name || "Untitled";
    byActivity.set(name, (byActivity.get(name) || 0) + mins);

    const cat = a.parent_category_id;
    if (cat) {
      // The category itself, then every ancestor — cycle-guarded by the
      // shared walker, so one bad parent pointer can't spin here.
      const chain = [cat, ...getAncestorIds(cat, byId)];
      for (const c of new Set(chain)) byCategory.set(c, (byCategory.get(c) || 0) + mins);
    }

    const who = Array.isArray(a.fronting_alter_ids) && a.fronting_alter_ids.length
      ? a.fronting_alter_ids
      : (a.alter_id ? [a.alter_id] : []);
    for (const id of new Set(who)) byAlter.set(id, (byAlter.get(id) || 0) + mins);
  }

  const sortDesc = (map, label) => [...map.entries()]
    .map(([key, minutes]) => ({ key, minutes, label: label ? label(key) : key }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    total,
    activities: sortDesc(byActivity),
    categories: sortDesc(byCategory, (id) => byId[id]?.name || "Category"),
    alters: sortDesc(byAlter, (id) => alterIds[id] || "?"),
  };
}

// Goal progress for the window, against ActivityGoal rows. Goals are weekly,
// so `from`/`to` should be a week.
export function goalProgress({ goals = [], rollupResult, categories = [] }) {
  const byId = indexById(categories);
  const catMinutes = new Map(rollupResult.categories.map((c) => [c.key, c.minutes]));
  return goals
    .map((g) => {
      const catId = g.category_id || g.parent_category_id;
      const target = Number(g.target_minutes) || Number(g.weekly_minutes) || (Number(g.target_hours) || 0) * 60;
      if (!catId || !target) return null;
      const done = catMinutes.get(catId) || 0;
      return {
        id: g.id,
        label: byId[catId]?.name || "Category",
        color: byId[catId]?.color || null,
        done,
        target,
        pct: Math.min(100, Math.round((done / target) * 100)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);
}

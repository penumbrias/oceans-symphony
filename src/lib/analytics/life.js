// Life-domain engine (Phase 4 of the analytics rebuild): activities, plans,
// goals, tasks, locations, and contact time. Presentation-free; every
// category walk is cycle-guarded via categoryTreeUtils (hard rule).

import { getAncestorIds } from "@/lib/categoryTreeUtils";
import { toMs, dayKey, inRange } from "./range";
import { dailySeries, trend } from "./baselines";

const COUNTED = new Set(["logged", "done", "partial"]);
const PLAN_STATUSES = new Set(["scheduled", "done", "partial", "skipped", "cancelled"]);

function activityMinutes(a) {
  const actual = Number(a.actual_duration_minutes);
  if (Number.isFinite(actual) && actual > 0) return actual;
  const planned = Number(a.duration_minutes);
  if (Number.isFinite(planned) && planned > 0) return planned;
  return 0;
}

function statusOf(a) {
  return (a.status || "logged").toLowerCase();
}

// ---- Activity summary -----------------------------------------------------
export function activitySummary({ activities, categories, range, priorRangeObj, maxCategories = 6 }) {
  const getMs = (a) => toMs(a.timestamp || a.created_date);
  const counted = (activities || []).filter((a) => COUNTED.has(statusOf(a)));

  const mkSeries = (rng) => dailySeries(counted, getMs, rng, {
    kind: "count",
    getValue: (items) => items.reduce((acc, a) => acc + activityMinutes(a), 0),
  });
  const minutesSeries = mkSeries(range);
  const inWin = counted.filter((a) => inRange(getMs(a), range));

  // Top ROOT categories by minutes (cycle-safe root resolution).
  const catById = {};
  for (const c of categories || []) catById[c.id] = c;
  const rootOf = (catId) => {
    if (!catId || !catById[catId]) return null;
    const ancestors = getAncestorIds(catId, categories || []);
    const rootId = ancestors.length ? ancestors[ancestors.length - 1] : catId;
    return catById[rootId] || catById[catId];
  };
  const perRoot = new Map(); // rootId -> { minutes, count }
  let uncategorizedMinutes = 0;
  for (const a of inWin) {
    const root = rootOf(a.parent_category_id);
    const mins = activityMinutes(a);
    if (!root) { uncategorizedMinutes += mins; continue; }
    if (!perRoot.has(root.id)) perRoot.set(root.id, { minutes: 0, count: 0 });
    const row = perRoot.get(root.id);
    row.minutes += mins;
    row.count += 1;
  }
  const topCategories = [...perRoot.entries()]
    .map(([id, r]) => ({ category: catById[id], minutes: r.minutes, count: r.count }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, maxCategories);

  return {
    minutesSeries,
    activitiesTotal: inWin.length,
    minutesTotal: inWin.reduce((acc, a) => acc + activityMinutes(a), 0),
    minutesTrend: priorRangeObj ? trend(minutesSeries, mkSeries(priorRangeObj)) : null,
    topCategories,
    uncategorizedMinutes,
  };
}

// ---- Plans lifecycle --------------------------------------------------------
export function plansLifecycle({ activities, range }) {
  const getMs = (a) => toMs(a.timestamp || a.created_date);
  const counts = { scheduled: 0, done: 0, partial: 0, skipped: 0, cancelled: 0 };
  for (const a of activities || []) {
    const s = statusOf(a);
    if (!PLAN_STATUSES.has(s)) continue;
    const ms = getMs(a);
    if (ms == null || !inRange(ms, range)) continue;
    counts[s]++;
  }
  const resolved = counts.done + counts.partial + counts.skipped + counts.cancelled;
  const followedThrough = counts.done + counts.partial;
  return {
    counts,
    resolved,
    followedThrough,
    completionRate: resolved > 0 ? followedThrough / resolved : null,
    plansTotal: resolved + counts.scheduled,
  };
}

// ---- Goals: current week ----------------------------------------------------
//
// ActivityGoal targets are weekly; this always reports the CURRENT week
// (Mon-based ISO week) regardless of the page range, matching the Goals
// panel. A goal's category includes its whole subtree (cycle-guarded).
function isoWeekStartMs(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Mon=0
  return d.getTime() - day * 86400000;
}

export function goalsThisWeek({ goals, activities, categories, now = Date.now() }) {
  const weekStart = isoWeekStartMs(now);
  const catList = categories || [];
  // childrenMap for subtree expansion (guarded by a visited set).
  const children = new Map();
  for (const c of catList) {
    const pid = c.parent_category_id;
    if (!pid) continue;
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid).push(c.id);
  }
  const subtreeOf = (rootId) => {
    const out = new Set();
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop();
      if (!id || out.has(id)) continue; // visited set doubles as cycle guard
      out.add(id);
      for (const kid of children.get(id) || []) stack.push(kid);
    }
    return out;
  };

  const rows = [];
  for (const g of goals || []) {
    if (g.active === false) continue;
    const catId = g.category_id || g.parent_category_id;
    if (!catId) continue;
    const subtree = subtreeOf(catId);
    let achieved = 0;
    for (const a of activities || []) {
      if (!COUNTED.has(statusOf(a))) continue;
      const ms = toMs(a.timestamp || a.created_date);
      if (ms == null || ms < weekStart || ms > now) continue;
      if (!subtree.has(a.parent_category_id)) continue;
      achieved += activityMinutes(a);
    }
    const targetMinutes = Number(g.target_minutes) > 0
      ? Number(g.target_minutes)
      : Number(g.target_hours) > 0 ? Number(g.target_hours) * 60
      : Number(g.weekly_minutes) > 0 ? Number(g.weekly_minutes) : null;
    if (!targetMinutes) continue;
    rows.push({ goal: g, categoryId: catId, achievedMinutes: achieved, targetMinutes, pct: Math.min(1, achieved / targetMinutes) });
  }
  rows.sort((a, b) => b.pct - a.pct);
  return rows;
}

// ---- Tasks ------------------------------------------------------------------
export function tasksSummary({ tasks, range }) {
  const created = (tasks || []).filter((t) => inRange(toMs(t.created_date), range));
  const completed = (tasks || []).filter((t) => t.completed_date && inRange(toMs(t.completed_date), range));
  const completedSeries = dailySeries(completed, (t) => toMs(t.completed_date), range, { kind: "count" });
  return { createdN: created.length, completedN: completed.length, completedSeries };
}

// ---- Locations ----------------------------------------------------------------
export function locationsTop({ locations, range, maxResults = 6 }) {
  const byName = new Map();
  const byCategory = new Map();
  let total = 0;
  for (const l of locations || []) {
    const ms = toMs(l.timestamp || l.created_date);
    if (ms == null || !inRange(ms, range)) continue;
    total++;
    const name = (l.name || "Unnamed").trim();
    byName.set(name, (byName.get(name) || 0) + 1);
    const cat = (l.category || "other").trim();
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
  }
  const top = [...byName.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, maxResults);
  const categoriesOut = [...byCategory.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
  return { total, top, categories: categoriesOut };
}

// ---- Contact time --------------------------------------------------------------
export function contactTime({ encounters, contacts, range, maxResults = 5 }) {
  const contactById = {};
  for (const c of contacts || []) contactById[c.id] = c;
  const perContact = new Map(); // id -> { minutes, count }
  let totalMinutes = 0, totalCount = 0;
  for (const e of encounters || []) {
    const start = toMs(e.start_time || e.timestamp || e.created_date);
    if (start == null || !inRange(start, range)) continue;
    const end = toMs(e.end_time);
    let minutes = Number(e.duration_minutes) > 0 ? Number(e.duration_minutes) : null;
    if (minutes == null && end != null && end > start) minutes = (end - start) / 60000;
    if (minutes == null) minutes = 0;
    totalCount++;
    totalMinutes += minutes;
    const id = e.contact_id || "unknown";
    if (!perContact.has(id)) perContact.set(id, { minutes: 0, count: 0 });
    const row = perContact.get(id);
    row.minutes += minutes;
    row.count++;
  }
  const top = [...perContact.entries()]
    .map(([id, r]) => ({ contact: contactById[id] || null, minutes: r.minutes, count: r.count }))
    .sort((a, b) => b.minutes - a.minutes || b.count - a.count)
    .slice(0, maxResults);
  return { totalMinutes, totalCount, top };
}

export const __internal = { activityMinutes, statusOf, isoWeekStartMs, dayKey };

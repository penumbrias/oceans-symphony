// Goals earn XP for the recurring-tasks level (Recurring tasks → level bar).
//
// Nothing is stored: like the auto-ticked tasks, goal XP is DERIVED from
// what the goals already record, so it can't drift, double up across two
// devices or survive an untick. DailyProgress.xp_earned stays exactly what
// the task ticks earned (sync recomputes it from the ticks, so goal XP
// could never live there anyway).
//
// What earns it, each on the day it happened:
//   • ticking a checklist point, to-do or plan on a goal page
//   • each time a tracked activity is done, up to the point's target
//     (per week for "each week" points), counted from when the point was added
//   • reaching a goal
// The person can turn it off: SystemSettings.goals_earn_xp === false.

import { format } from "date-fns";
import { countedEntries, goalWeekWindow } from "@/lib/goalCounting";
import { statusFor } from "@/lib/activityStatus";

export const GOAL_XP = Object.freeze({ tick: 2, activity: 2, reached: 10 });

export const goalsEarnXp = (settings) => settings?.goals_earn_xp !== false;

const day = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : format(x, "yyyy-MM-dd");
};

/**
 * [{ date: "yyyy-MM-dd", xp, kind, goalId, stepId? }] — one row per thing
 * that earned XP. Removed points and points on goals that are gone earn
 * nothing.
 */
export function goalXpEvents({ goals = [], steps = [], tasks = [], activities = [], categories = [], now = new Date(), weekStartsOn } = {}) {
  const out = [];
  const goalIds = new Set();
  for (const g of goals || []) {
    if (!g?.id || g.removed_at || g.trashed_at) continue;
    goalIds.add(g.id);
    if (g.status === "done") {
      const d = day(g.status_changed_at || g.updated_date || now);
      if (d) out.push({ date: d, xp: GOAL_XP.reached, kind: "reached", goalId: g.id });
    }
  }
  const taskById = new Map((tasks || []).filter(Boolean).map((t) => [t.id, t]));
  const actById = new Map((activities || []).filter(Boolean).map((a) => [a.id, a]));
  const taskDone = (t) => (t?.completed || t?.is_complete) ? day(t.completed_date || t.updated_date || now) : null;

  for (const s of steps || []) {
    if (!s || s.removed_at || !goalIds.has(s.goal_id)) continue;
    const kind = s.kind || "check";
    const push = (date, xp, k) => { if (date) out.push({ date, xp, kind: k, goalId: s.goal_id, stepId: s.id }); };

    if (kind === "check") push(s.done_at ? day(s.done_at) : null, GOAL_XP.tick, "tick");
    else if (kind === "todo") {
      const t = taskById.get(s.ref_id);
      push(t ? taskDone(t) : (s.done_at ? day(s.done_at) : null), GOAL_XP.tick, "tick");
    } else if (kind === "todos") {
      for (const id of s.ref_ids || []) push(taskDone(taskById.get(id)), GOAL_XP.tick, "tick");
    } else if (kind === "plan") {
      const a = actById.get(s.ref_id);
      const st = a ? statusFor(a) : null;
      if (a && (st === "done" || st === "partial")) push(day(a.timestamp || a.updated_date || now), GOAL_XP.tick, "tick");
      else if (!a && s.done_at) push(day(s.done_at), GOAL_XP.tick, "tick");
    } else if (kind === "activity_count") {
      const target = Math.max(1, Number(s.target_count) || 1);
      const from = s.created_date ? new Date(s.created_date) : new Date(0);
      const entries = countedEntries(s, { activities, categories, from, now });
      if (s.count_period === "week") {
        const perWeek = new Map();
        for (const e of entries) {
          const wk = goalWeekWindow(e.when, weekStartsOn).start.getTime();
          const n = perWeek.get(wk) || 0;
          if (n >= target) continue;
          perWeek.set(wk, n + 1);
          push(day(e.when), GOAL_XP.activity, "activity");
        }
      } else {
        for (const e of entries.slice(0, target)) push(day(e.when), GOAL_XP.activity, "activity");
      }
    }
  }
  return out;
}

export const sumXp = (events, { from = null, to = null } = {}) => (events || []).reduce((n, e) =>
  ((from && e.date < from) || (to && e.date > to)) ? n : n + (e.xp || 0), 0);

// Goals (System Needs, phase 5).
//
// A Goal is something long-term the system is working toward. Fields:
//   title, why / impact (authored text), status (GOAL_STATUSES),
//   status_changed_at, target_date ("yyyy-MM-dd", optional),
//   owner_alter_ids[] / for_everyone (who wants it), supporter_alter_ids[]
//   (who can help), struggler_alter_ids[] (who finds it hard),
//   author_alter_ids, wish_id (made from a wish), template_id,
//   from_weekly_goal ("category:<id>" | "habit:<id>" when it was carried
//   over from the old weekly goals).
//
// Its steps are separate GoalStep records (one record per step, so two
// devices editing different steps never clash):
//   goal_id, title, order, kind (STEP_KINDS), ref_id (the linked Task /
//   Activity / DailyTaskTemplate), done_at (a plain step's tick),
//   category_id / habit_id / weekly_minutes (a rhythm step),
//   nudge_dismissed_at, removed_at.
//
// Steps are never hard-deleted: removing one sets removed_at (a delete
// would come straight back from another device). Old weekly ActivityGoal
// records are never touched — carrying them over only adds goals.

import { differenceInCalendarDays } from "date-fns";
import { base44 } from "@/api/base44Client";
import { goalWeekWindow, countActivityTimes, activityMinutesThisWeek } from "@/lib/goalCounting";
import { isTemplateDoneNow } from "@/lib/dailyTaskSystem";
import { createTask } from "@/lib/taskCreate";
import { setTaskCompleted } from "@/lib/linkedCompletion";

export const GOALS_QUERY_KEY = ["goals"];
export const GOAL_STEPS_QUERY_KEY = ["goalSteps"];

export const GOAL_STATUSES = [
  { id: "active", label: "Working on it" },
  { id: "paused", label: "Paused" },
  { id: "done", label: "Reached" },
  { id: "let_go", label: "Let go" },
];
export const goalStatusLabel = (id) => GOAL_STATUSES.find((s) => s.id === id)?.label || "Working on it";
export const isOpenGoal = (g) => !["done", "let_go"].includes(g?.status || "active");

// check: a plain checklist point ticked here. todo / plan: the point IS
// that to-do or plan. todos: several to-dos (ref_ids), done when they all
// are. activity_count: an activity done target_count times — in total
// since the point was added, or each week (count_period "week").
// daily_task: an existing daily task that keeps going. rhythm: minutes
// each week on one activity (what the old weekly goals were).
export const STEP_KINDS = ["check", "todo", "todos", "activity_count", "plan", "daily_task", "rhythm"];

// Days an unfinished step sits untouched before it offers to get smaller.
export const NUDGE_AFTER_DAYS = 7;

export function stepsForGoal(steps = [], goalId) {
  return (steps || [])
    .filter((s) => s && s.goal_id === goalId && !s.removed_at)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)
      || String(a.created_date || "").localeCompare(String(b.created_date || "")));
}

// Minutes spent this week on a rhythm step's activity (or habit). The
// week follows the person's "week starts on" setting (goalCounting.js).
export function rhythmMinutes(step, { activities = [], categories = [], symptomSessions = [], now = new Date() } = {}) {
  if (step.habit_id) {
    const { start, end } = goalWeekWindow(now);
    return (symptomSessions || []).reduce((sum, s) => {
      if (s.symptom_id !== step.habit_id || !s.start_time) return sum;
      const st = new Date(s.start_time);
      if (st < start || st > end) return sum;
      const en = s.end_time ? new Date(s.end_time) : now;
      return sum + Math.max(0, Math.round((en - st) / 60000));
    }, 0);
  }
  return activityMinutesThisWeek(step.category_id, { activities, categories, now });
}

// Where a step stands right now. Linked steps read their twin, so ticking
// the to-do on the To-Do page (or doing the plan) ticks the step too.
//   { done, ongoing, missing, linked, current, target }

// Times an activity (or anything nested under it) actually happened —
// since the point was added, or this week.
export function activityCount(step, { activities = [], categories = [], now = new Date() } = {}) {
  return countActivityTimes(step, { activities, categories, now });
}

export function stepState(step, ctx = {}) {
  const { tasks = [], activities = [], templates = [], progress = [], now = new Date() } = ctx;
  const kind = step?.kind || "check";
  if (kind === "todos") {
    const linked = (step.ref_ids || []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
    const current = linked.filter((t) => t.completed).length;
    return { done: linked.length > 0 && current === linked.length, ongoing: false, linkedList: linked, current, target: linked.length };
  }
  if (kind === "activity_count") {
    const target = Math.max(1, Number(step.target_count) || 1);
    const current = activityCount(step, ctx);
    return { done: current >= target, ongoing: step.count_period === "week", current, target };
  }
  if (kind === "todo") {
    const task = tasks.find((t) => t.id === step.ref_id);
    if (!task) return { done: !!step.done_at, ongoing: false, missing: true };
    return { done: !!task.completed, ongoing: false, linked: task };
  }
  if (kind === "plan") {
    const act = activities.find((a) => a.id === step.ref_id);
    if (!act) return { done: !!step.done_at, ongoing: false, missing: true };
    return { done: act.status === "done" || act.status === "partial", ongoing: false, linked: act };
  }
  if (kind === "daily_task") {
    const tpl = templates.find((t) => t.id === step.ref_id);
    if (!tpl) return { done: false, ongoing: true, missing: true };
    return { done: isTemplateDoneNow(tpl, progress, now), ongoing: true, linked: tpl };
  }
  if (kind === "rhythm") {
    const target = Math.max(0, Number(step.weekly_minutes) || 0);
    const current = Math.round(rhythmMinutes(step, ctx));
    return { done: target > 0 && current >= target, ongoing: true, current, target };
  }
  return { done: !!step.done_at, ongoing: false };
}

// One-off steps done out of all one-off steps. Ongoing steps (rhythms,
// daily tasks) don't count — they never finish.
export function goalProgress(steps = [], ctx = {}) {
  let done = 0, total = 0;
  for (const s of steps) {
    const st = stepState(s, ctx);
    if (st.ongoing) continue;
    total += 1;
    if (st.done) done += 1;
  }
  return { done, total };
}

// An unfinished one-off step that's been sitting a week: offer to split
// off something smaller. Saying "it's fine" quiets it for good.
export function shouldNudge(step, state, now = new Date()) {
  if (!step || state?.done || state?.ongoing || step.nudge_dismissed_at) return false;
  const since = step.created_date ? new Date(step.created_date) : null;
  if (!since || isNaN(since)) return false;
  return differenceInCalendarDays(now, since) >= NUDGE_AFTER_DAYS;
}

// ── Writes ────────────────────────────────────────────────────────────

export function setGoalStatus(goal, status) {
  return base44.entities.Goal.update(goal.id, { status, status_changed_at: new Date().toISOString() });
}

export async function addStep(goalId, fields, existing = []) {
  const max = existing.reduce((m, s) => Math.max(m, Number(s.order) || 0), 0);
  return base44.entities.GoalStep.create({
    goal_id: goalId,
    kind: "check",
    order: max + 1,
    ...fields,
    title: String(fields.title || "").trim(),
  });
}

// A smaller step that goes right before `step`. Later steps move down.
export async function addSmallerStepBefore(step, title, steps = []) {
  const ordered = [...steps];
  const at = ordered.findIndex((s) => s.id === step.id);
  const created = await base44.entities.GoalStep.create({
    goal_id: step.goal_id, kind: "check", title: String(title || "").trim(),
    order: Number(step.order) || 0,
  });
  // Renumber from the split point so the new step sits above the big one.
  const tail = at < 0 ? [step] : ordered.slice(at);
  let n = (Number(step.order) || 0) + 1;
  for (const s of tail) {
    await base44.entities.GoalStep.update(s.id, { order: n });
    n += 1;
  }
  return created;
}

export function dismissNudge(step) {
  return base44.entities.GoalStep.update(step.id, { nudge_dismissed_at: new Date().toISOString() });
}

export function removeStep(step) {
  return base44.entities.GoalStep.update(step.id, { removed_at: new Date().toISOString() });
}

// Tick / untick a one-off step. A to-do step ticks its to-do (and that
// to-do's own plans, like the To-Do page does). A plan step is resolved
// as done through the planner's own resolve path.
export async function toggleStep(step, state) {
  const kind = step.kind || "check";
  if (kind === "todo" && state?.linked) {
    const completed = !state.linked.completed;
    await setTaskCompleted(state.linked.id, completed);
    return;
  }
  if (kind === "plan" && state?.linked) {
    if (state.done) return; // a done plan is history — undo it in the planner
    const { resolveOutcome } = await import("@/lib/planner/resolvePlan");
    await resolveOutcome(state.linked, "done");
    return;
  }
  await base44.entities.GoalStep.update(step.id, { done_at: state?.done ? null : new Date().toISOString() });
}

// Turn a plain step into a to-do on the To-Do list.
export async function stepToTodo(step) {
  const task = await createTask({ title: step.title, goal_id: step.goal_id, goal_step_id: step.id });
  await base44.entities.GoalStep.update(step.id, { kind: "todo", ref_id: task.id });
  return task;
}

// Turn a plain step into a plan in the planner.
export async function stepToPlan(step, when, goal = null) {
  const plan = await base44.entities.Activity.create({
    timestamp: when.toISOString(),
    activity_name: step.title,
    activity_category_ids: step.category_id ? [step.category_id] : [],
    fronting_alter_ids: goal && !goal.for_everyone ? (goal.owner_alter_ids || []) : [],
    is_planned: true,
    status: "scheduled",
    goal_id: step.goal_id,
    goal_step_id: step.id,
  });
  await base44.entities.GoalStep.update(step.id, { kind: "plan", ref_id: plan.id });
  return plan;
}

// ── Old weekly goals → rhythm steps ──────────────────────────────────

// One entry per thing the old weekly goals tracked (they were one record
// per week), with the most recent week's target.
export function weeklyGoalSources(activityGoals = []) {
  const byKey = new Map();
  for (const g of activityGoals || []) {
    const isHabit = g.source_type === "habit";
    const id = isHabit ? (g.source_id || g.habit_id) : (g.activity_category_id || g.source_id);
    if (!id) continue;
    const key = `${isHabit ? "habit" : "category"}:${id}`;
    const prev = byKey.get(key);
    if (!prev || String(g.week_start_date || "") > String(prev.week_start_date || "")) {
      byKey.set(key, {
        key, isHabit, id,
        name: g.category_name || "Weekly goal",
        weekly_minutes: Number(g.weekly_minutes) || 0,
        color: g.color || null,
        week_start_date: g.week_start_date,
      });
    }
  }
  return [...byKey.values()];
}

export function uncarriedWeeklyGoals(activityGoals = [], goals = []) {
  const carried = new Set((goals || []).map((g) => g.from_weekly_goal).filter(Boolean));
  return weeklyGoalSources(activityGoals).filter((s) => !carried.has(s.key));
}

// Adds a goal with a rhythm step for each weekly goal not carried over
// yet. The weekly goal records themselves stay exactly as they are.
export async function carryOverWeeklyGoals(activityGoals = [], goals = [], names = {}) {
  const todo = uncarriedWeeklyGoals(activityGoals, goals);
  const now = new Date().toISOString();
  for (const s of todo) {
    const title = names[s.key] || s.name;
    const goal = await base44.entities.Goal.create({
      title, status: "active", status_changed_at: now, for_everyone: true,
      owner_alter_ids: [], supporter_alter_ids: [], struggler_alter_ids: [],
      from_weekly_goal: s.key,
    });
    await base44.entities.GoalStep.create({
      goal_id: goal.id, kind: "rhythm", order: 1, title,
      ...(s.isHabit ? { habit_id: s.id } : { category_id: s.id }),
      weekly_minutes: s.weekly_minutes,
    });
  }
  return todo.length;
}

// ── Making goals ─────────────────────────────────────────────────────

export function createGoal(fields = {}) {
  return base44.entities.Goal.create({
    status: "active", status_changed_at: new Date().toISOString(),
    for_everyone: true, owner_alter_ids: [], supporter_alter_ids: [], struggler_alter_ids: [],
    ...fields,
    title: String(fields.title || "").trim(),
  });
}

// A goal-kind wish becomes a goal straight away: its title, what's driving
// it as the goal's note, and whose it is. The wish moves to "in progress".
export async function goalFromWish(wish) {
  const goal = await createGoal({
    title: wish.title, why: wish.driving || "", impact: wish.impact || "",
    for_everyone: !!wish.for_everyone, owner_alter_ids: wish.owner_alter_ids || [], wish_id: wish.id,
  });
  await base44.entities.Wish.update(wish.id, { status: "in_progress", status_changed_at: new Date().toISOString() })
    .catch(() => { /* the goal stands */ });
  return goal;
}

export const SMALLER_EXAMPLES = [
  "Only the first 5 minutes",
  "Just get it out and look at it",
  "Write down the very first move",
  "Ask for help with it",
];

// Daily task → timed activity (System Needs, step 1).
//
// A MANUAL daily task can name an activity category and a length. Tapping
// the task then asks "Open and begin <activity>?": yes opens its link (if
// any) AND starts the activity running. It does that by creating a
// scheduled PLAN for right now and starting it through the planner's own
// startPlanActive — so the end-of-plan check-in, the outcome sheet,
// pausing, rescheduling and the planner drawing all come for free, and
// every outcome (including a skip) is on the record.
//
// The plan carries daily_task_template_id; finishing it as done ticks the
// daily task (markDailyTaskDoneFor), so the two never disagree.

import { base44 } from "@/api/base44Client";
import { followTaskNavPath, isTemplateDoneNow, toggleTemplateDone } from "@/lib/dailyTaskSystem";

export const OPEN_DAILY_TASK_START_EVENT = "open-daily-task-start";

// How a task's activities are recorded when the task is tapped:
//   "timed"  — starts running for a set length; the end check-in asks how it went
//   "active" — starts running with no end; it runs until it's ended
//   "log"    — nothing runs; it's logged as done now, or for today with no time
export const TASK_ACTIVITY_MODES = ["timed", "active", "log"];

// The task's activity setup, or null when it has none. Reads the first
// build's single `activity_category_id` too (v0.255.0), and derives its
// mode from whether it had a length.
export function taskActivityConfig(template) {
  if (!template || template.mode === "AUTO") return null;
  const categoryIds = Array.isArray(template.activity_category_ids) && template.activity_category_ids.length
    ? template.activity_category_ids.filter(Boolean)
    : (template.activity_category_id ? [template.activity_category_id] : []);
  if (!categoryIds.length) return null;
  const minutes = Math.round(Number(template.activity_minutes) || 0);
  let mode = TASK_ACTIVITY_MODES.includes(template.activity_mode) ? template.activity_mode : (minutes > 0 ? "timed" : "active");
  if (mode === "timed" && minutes <= 0) mode = "active";
  return { categoryIds, categoryId: categoryIds[0], minutes: mode === "timed" ? minutes : 0, mode };
}

// Is there anything to do when the task is tapped?
export function isDailyTaskOpenable(template) {
  return !!template?.nav_path || !!taskActivityConfig(template);
}

// THE way to open a daily task (card, home widget, v2 widget). Tasks with
// an activity ask first (the prompt host is mounted once in AppLayout);
// the rest follow their link exactly as before.
export function openDailyTask(template, navigate) {
  if (taskActivityConfig(template)) {
    window.dispatchEvent(new CustomEvent(OPEN_DAILY_TASK_START_EVENT, { detail: { template } }));
    return;
  }
  followTaskNavPath(template?.nav_path, navigate);
}

const colorOf = (cfg, categories) =>
  cfg.categoryIds.map((id) => (categories || []).find((c) => c.id === id)?.color).find(Boolean) || null;

// Start the task's activities now ("timed" / "active"): a plan stamped at
// this moment (for the set length when timed), started straight away.
// Returns the plan record.
export async function beginDailyTaskActivity(template, { categories = [], alterIds = [] } = {}) {
  const cfg = taskActivityConfig(template);
  if (!cfg || cfg.mode === "log") return null;
  const cat = (categories || []).find((c) => c.id === cfg.categoryId);
  const color = colorOf(cfg, categories);
  const now = new Date();
  const plan = await base44.entities.Activity.create({
    timestamp: now.toISOString(),
    // The task's own name ("QiGong") reads better than its category
    // ("Stretching"); the categories still file it.
    activity_name: template.title || cat?.name || "Activity",
    activity_category_ids: cfg.categoryIds,
    ...(color ? { color } : {}),
    ...(cfg.minutes ? { duration_minutes: cfg.minutes } : {}),
    fronting_alter_ids: alterIds,
    notes: null,
    is_planned: true,
    status: "scheduled",
    daily_task_template_id: template.id,
  });
  const { startPlanActive } = await import("@/lib/planner/resolvePlan");
  await startPlanActive(plan, { startedAt: now, categories });
  return plan;
}

// "log" mode: record that it was done — at this moment (`when: "now"`, no
// length), or for today with no time (`when: "day"`, the planner's
// untimed-day entry). Ticks the daily task too. Returns the record.
export async function logDailyTaskActivity(template, { when = "now", categories = [], alterIds = [] } = {}) {
  const cfg = taskActivityConfig(template);
  if (!cfg) return null;
  const cat = (categories || []).find((c) => c.id === cfg.categoryId);
  const color = colorOf(cfg, categories);
  const now = new Date();
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const record = await base44.entities.Activity.create({
    ...(when === "day" ? { planned_date: day.toISOString() } : { timestamp: now.toISOString() }),
    activity_name: template.title || cat?.name || "Activity",
    activity_category_ids: cfg.categoryIds,
    ...(color ? { color } : {}),
    fronting_alter_ids: alterIds,
    notes: null,
    is_planned: false,
    status: "logged",
    daily_task_template_id: template.id,
  });
  await markDailyTaskDoneFor(record);
  return record;
}

// A plan that came from a daily task finished as done → tick that task
// for its own period (never untick: it may already be ticked by hand).
export async function markDailyTaskDoneFor(plan) {
  const templateId = plan?.daily_task_template_id;
  if (!templateId) return;
  try {
    const templates = await base44.entities.DailyTaskTemplate.list();
    const template = (templates || []).find((t) => t.id === templateId);
    if (!template) return;
    const progress = await base44.entities.DailyProgress.list().catch(() => []);
    if (isTemplateDoneNow(template, progress)) return;
    await toggleTemplateDone(template, { templates, allProgress: progress });
  } catch { /* the activity outcome stands even if the tick fails */ }
}

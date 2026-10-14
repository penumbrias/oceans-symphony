// Recurring tasks that are done more than once a period, or in steps.
//
// A MANUAL recurring task (any frequency) picks how it's completed:
//   "once"   — one tick, as always (the default; nothing changes for old tasks)
//   "target" — needs doing N times this period ("water: 3 / 8 today")
//   "tally"  — just counts how many times; done once it's happened at all
//   "steps"  — a short checklist; done when every step is ticked
//
// Each tap is its own TaskTick record ({ template_id, step_id?, timestamp,
// period_key, frequency }). Taking one back sets `removed_at` instead of
// deleting it — device sync never deletes, so a deleted tick would just
// come back from the other device. The count for a period is the live
// ticks inside that task's current window (its own reset rule).
//
// The task's done state still lives in DailyProgress (XP, streaks, the
// history grid, the Timeline all read it). These helpers keep the two in
// step: reaching the target / ticking the last step ticks the task, going
// back below it unticks it. Only a change caused by THIS tap moves it, so
// a task ticked by hand is never unticked behind someone's back.

import { base44 } from "@/api/base44Client";
import {
  getPeriodKey, customWindowStart, isTemplateDoneNow, toggleTemplateDone, markDailyTaskCompletedToday,
} from "@/lib/dailyTaskSystem";

export const TASK_COUNT_MODES = ["once", "target", "tally", "steps"];
export const TASK_TICKS_QUERY_KEY = ["taskTicks"];

const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30, yearly: 365 };

// { mode, target, steps } — mode "once" for anything that isn't set up
// (AUTO tasks, a target under 2, a steps task with no steps).
export function taskCountConfig(template) {
  const once = { mode: "once", target: 1, steps: [] };
  if (!template || template.mode === "AUTO") return once;
  const mode = TASK_COUNT_MODES.includes(template.count_mode) ? template.count_mode : "once";
  if (mode === "target") {
    const target = Math.round(Number(template.target_count) || 0);
    return target >= 2 ? { mode, target, steps: [] } : once;
  }
  if (mode === "steps") {
    const steps = (Array.isArray(template.steps) ? template.steps : [])
      .filter((s) => s && s.id && String(s.text || "").trim());
    return steps.length ? { mode, target: steps.length, steps } : once;
  }
  if (mode === "tally") return { mode, target: 0, steps: [] };
  return once;
}

export const isCountedTask = (template) => taskCountConfig(template).mode !== "once";

// Where this task's current period starts. Calendar tasks (including a
// weekly task that resets on another weekday) use their own window; a
// rolling task counts the last N days.
export function countWindowStart(template, now = new Date()) {
  if (template?.reset_mode === "rolling") {
    const days = PERIOD_DAYS[template.frequency || "daily"] || 1;
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d;
  }
  return customWindowStart(template || {}, now);
}

// Live ticks for this task in its current window.
export function currentTicks(template, ticks = [], now = new Date()) {
  if (!template) return [];
  const start = countWindowStart(template, now).getTime();
  return (ticks || []).filter((k) =>
    k && k.template_id === template.id && !k.removed_at &&
    new Date(k.timestamp).getTime() >= start);
}

// { mode, count, target, steps, doneStepIds, complete }
export function taskCountState(template, ticks = [], now = new Date()) {
  const cfg = taskCountConfig(template);
  const live = currentTicks(template, ticks, now);
  if (cfg.mode === "steps") {
    const ids = new Set(cfg.steps.map((s) => s.id));
    const doneStepIds = new Set(live.map((k) => k.step_id).filter((id) => ids.has(id)));
    return { ...cfg, count: doneStepIds.size, doneStepIds, complete: doneStepIds.size >= cfg.steps.length };
  }
  const count = live.filter((k) => !k.step_id).length;
  const complete = cfg.mode === "target" ? count >= cfg.target : count >= 1;
  return { ...cfg, count, doneStepIds: new Set(), complete };
}

const freshTicks = () => base44.entities.TaskTick.list().catch(() => []);

// Tick or untick the task itself when this tap crossed the line.
async function syncDone(template, before, after, templates) {
  if (before.complete === after.complete) return null;
  const progress = await base44.entities.DailyProgress.list().catch(() => []);
  const done = isTemplateDoneNow(template, progress);
  if (after.complete === done) return null;
  const all = templates?.length ? templates : await base44.entities.DailyTaskTemplate.list().catch(() => []);
  await toggleTemplateDone(template, { templates: all, allProgress: progress });
  // Same meta trigger a hand tick sets (never for the task that tracks it).
  const triggers = Array.isArray(template.auto_triggers) ? template.auto_triggers : [template.auto_trigger];
  if (after.complete && (template.frequency || "daily") === "daily" && !triggers.includes("daily_task_completed")) {
    markDailyTaskCompletedToday();
  }
  return after.complete;
}

// Returns { state, becameDone } — becameDone is true/false when the task's
// own tick moved, null when it didn't.
export async function addTaskCount(template, { templates = [], stepId = null } = {}) {
  const ticks = await freshTicks();
  const before = taskCountState(template, ticks);
  const f = template.frequency || "daily";
  const now = new Date();
  const tick = await base44.entities.TaskTick.create({
    template_id: template.id,
    ...(stepId ? { step_id: stepId } : {}),
    timestamp: now.toISOString(),
    frequency: f,
    period_key: getPeriodKey(f, now),
  });
  const after = taskCountState(template, [...ticks, tick]);
  const becameDone = await syncDone(template, before, after, templates);
  return { state: after, becameDone };
}

// Take back the latest count (or one step's tick).
export async function removeTaskCount(template, { templates = [], stepId = null } = {}) {
  const ticks = await freshTicks();
  const before = taskCountState(template, ticks);
  const mine = currentTicks(template, ticks)
    .filter((k) => (stepId ? k.step_id === stepId : !k.step_id))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  if (!mine.length) return { state: before, becameDone: null };
  // A step can only be ticked once, but two devices may each have ticked
  // it — unticking clears every copy.
  const gone = stepId ? mine : [mine[0]];
  const removedAt = new Date().toISOString();
  for (const k of gone) await base44.entities.TaskTick.update(k.id, { removed_at: removedAt });
  const goneIds = new Set(gone.map((k) => k.id));
  const after = taskCountState(template, ticks.map((k) => (goneIds.has(k.id) ? { ...k, removed_at: removedAt } : k)));
  const becameDone = await syncDone(template, before, after, templates);
  return { state: after, becameDone };
}

export async function toggleTaskStep(template, stepId, { templates = [] } = {}) {
  const ticks = await freshTicks();
  const on = taskCountState(template, ticks).doneStepIds.has(stepId);
  return on
    ? removeTaskCount(template, { templates, stepId })
    : addTaskCount(template, { templates, stepId });
}

// "3 / 8", "5", "2 / 4 steps" — short progress text for a counted task.
export function countLabel(state) {
  if (!state || state.mode === "once") return "";
  if (state.mode === "tally") return String(state.count);
  return `${state.count} / ${state.target}`;
}

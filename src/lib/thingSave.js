// ONE thing to do, with an optional time (consolidation Phase 6).
//
// A to-do and a plan stopped being two features here. There is one thing:
// something you intend to do. Give it a time and it also becomes a plan —
// it shows up on the tracker, the timeline and the day views, and it can be
// resolved done/partial/skipped like any plan. Leave the time off and it's
// simply a to-do.
//
// Under the hood that's still a Task plus (when timed) a linked Activity —
// no migration, nothing rewritten, every existing record keeps working.
// What changed is that ONE call maintains the pair, so the two halves can't
// disagree about what the thing is. Completion already syncs both ways
// (Phase 1), so ticking either side finishes the thing.
//
// `when` shapes:
//   null / {}                              → no time; a plain to-do
//   { dueDate: "YYYY-MM-DD" }              → a deadline, no scheduled slot
//   { date: "YYYY-MM-DD" }                 → scheduled that day, no set time
//   { date, time: "HH:mm", durationMinutes } → scheduled at a time

import { base44 } from "@/api/base44Client";
import { createTask } from "@/lib/taskCreate";
import { createPlan } from "@/lib/planCreate";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";

export function whenToTimestamp(when) {
  if (!when?.date) return null;
  const [y, m, d] = String(when.date).split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (when.time) {
    const [hh, mm] = String(when.time).split(":").map((n) => parseInt(n, 10));
    dt.setHours(hh || 0, mm || 0, 0, 0);
  } else {
    // A date without a time is an intention for that day — the app's
    // existing "quick plan" convention parks it at the end of the day so it
    // doesn't pretend to occupy a slot.
    dt.setHours(23, 59, 0, 0);
  }
  return dt;
}

// Create a thing. Returns { task, planned }.
export async function saveThing({
  title,
  when = null,
  priority = "medium",
  categoryIds = [],
  note = "",
  pinned = false,
  urgent = false,
  goalTarget = null,
  goalUnit = "",
  // plan-side extras, only used when the thing has a scheduled date
  alterIds = [],
  location = null,
  recurrence = { interval: "none", count: 1 },
  reminderOffset = null,
  // board post, as before
  companionBulletin = false,
  authorAlterIds = [],
  // Anything else the caller's form owns (subtasks' parent_task_id,
  // mentions, its own extra fields). Merged last so a fuller form never
  // loses a field by coming through here.
  taskFields = null,
} = {}) {
  const clean = (title || "").trim();
  const timestamp = whenToTimestamp(when);

  const task = await createTask({
    title: clean,
    priority,
    due_date: when?.dueDate || (when?.date || null),
    scheduled_at: timestamp && when?.time ? timestamp.toISOString() : null,
    activity_category_ids: categoryIds,
    description: (note || "").trim(),
    pinned_to_dashboard: pinned,
    is_urgent: urgent,
    goal_target: goalTarget ? parseInt(goalTarget, 10) : null,
    goal_unit: (goalUnit || "").trim(),
    ...(taskFields || {}),
  }, { companionBulletin, authorAlterIds });

  if (!timestamp) return { task, planned: false };

  // Timed → it's a plan too, linked to this task so completing either one
  // finishes both.
  await createPlan({
    records: [{ activity_name: clean, activity_category_ids: categoryIds }],
    timestamp,
    durationMinutes: when?.durationMinutes ?? null,
    alterIds,
    notes: (note || "").trim() || null,
    location,
    isQuickPlan: !when?.time,
    isCritical: !!urgent,
    reminderOffset,
    recurrence,
    linkedTask: task,
  });

  return { task, planned: true };
}

// Editing an existing thing: keep its plan side in step. Adding a time to
// something that had none creates the plan; removing the time retires it;
// moving it moves the plan with it. Without this, a thing edited in the
// To-Do List quietly disagreed with the tracker.
export async function updateThingSchedule(task, when, { title, note, categoryIds = [] } = {}) {
  if (!task?.id) return { planned: false };
  const timestamp = whenToTimestamp(when);
  let plans = [];
  try {
    plans = await base44.entities.Activity.filter({ task_id: task.id });
  } catch { /* treat as none */ }
  const live = plans.filter((p) => !p.status || p.status === ACTIVITY_STATUSES.SCHEDULED);

  if (!timestamp) {
    await unscheduleThing(task.id);
    return { planned: false };
  }

  const name = (title || task.title || "").trim();
  if (live.length === 0) {
    await createPlan({
      records: [{ activity_name: name, activity_category_ids: categoryIds }],
      timestamp,
      durationMinutes: when?.durationMinutes ?? null,
      notes: (note || "").trim() || null,
      isQuickPlan: !when?.time,
      recurrence: { interval: "none", count: 1 },
      linkedTask: task,
    });
    return { planned: true };
  }
  // Move what's already there rather than making a second plan for the
  // same thing. Only the next scheduled one — a series keeps its shape.
  const next = [...live].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
  try {
    await base44.entities.Activity.update(next.id, {
      timestamp: timestamp.toISOString(),
      activity_name: name,
      is_quick_plan: !when?.time,
      ...(when?.durationMinutes ? { duration_minutes: when.durationMinutes } : {}),
    });
  } catch { /* best effort */ }
  return { planned: true };
}

// Taking the time off a thing shouldn't destroy the plan record it made —
// it retires it, the same way resolving a plan as cancelled does, so the
// history stays honest and nothing nags.
export async function unscheduleThing(taskId) {
  if (!taskId) return 0;
  let plans = [];
  try {
    plans = await base44.entities.Activity.filter({ task_id: taskId });
  } catch { return 0; }
  let n = 0;
  for (const p of plans) {
    if (p.status && p.status !== ACTIVITY_STATUSES.SCHEDULED) continue;
    try {
      await base44.entities.Activity.update(p.id, { status: ACTIVITY_STATUSES.CANCELLED });
      n += 1;
    } catch { /* best effort */ }
  }
  return n;
}

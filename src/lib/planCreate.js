// THE plan-creation path (consolidation Phase 4).
//
// QuickPlanComposer and ActivityPlanModal each carried a full copy of this:
// recurrence expansion, the plan-vs-logged rule, the 19-field
// Activity.create, derived-to-do creation and linked-to-do due-date sync.
// Copies drift — they already had: the composer treated a quick plan dated
// today as a PLAN even if its time had passed, while the modal silently
// logged it. This module is now the only writer; both surfaces call it.
//
// Divergence resolution (kept the composer's rule): a QUICK plan whose DATE
// is today-or-later is a plan instance even if its time-of-day has passed —
// quick plans are date-intentions, not timestamps.
//
// Callers own their UI concerns (validation, toasts, resets, query
// invalidation); this owns exactly the writes.

import { addDays, addWeeks, addMonths, format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";

const todayLocalISODate = () => format(new Date(), "yyyy-MM-dd");

function advance(dt, n, interval) {
  if (interval === "daily") return addDays(dt, n);
  if (interval === "weekly") return addWeeks(dt, n);
  if (interval === "biweekly") return addWeeks(dt, n * 2);
  if (interval === "monthly") return addMonths(dt, n);
  return dt;
}

export async function createPlan({
  // One entry per activity in the plan: { activity_name, activity_category_ids, color? }
  records,
  timestamp,                    // Date of the first occurrence
  durationMinutes = null,
  alterIds = [],
  notes = null,
  location = null,
  isQuickPlan = false,
  isCritical = false,
  leadSteps = null,
  reminderOffset = null,
  recurrence = { interval: "none", count: 1 },
  linkedTask = null,            // existing Task object to link + date-sync
  createTodo = false,           // derive a new Task when none is linked
  todoTitle = "",
}) {
  // "Set this plan as a to-do" — build the Task up-front so its id can flow
  // into task_id on every Activity (including recurring ones).
  let derivedTask = null;
  if (createTodo && !linkedTask) {
    derivedTask = await base44.entities.Task.create({
      title: (todoTitle || records[0]?.activity_name || "").trim(),
      completed: false,
      priority: "medium",
      due_date: format(timestamp, "yyyy-MM-dd"),
      notes: (notes || "").trim() || null,
    });
  }
  const effectiveLinkedTask = linkedTask || derivedTask;

  const recurrenceGroupId = recurrence.interval !== "none"
    ? `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    : null;
  const occurrences = recurrenceGroupId
    ? Array.from(
        { length: Math.max(1, Math.min(52, recurrence.count || 1)) },
        (_, i) => advance(timestamp, i, recurrence.interval)
      )
    : [timestamp];

  for (const occ of occurrences) {
    // A recurring occurrence is always a PLAN instance to resolve later —
    // otherwise past/first occurrences silently auto-"log" and can't be
    // managed. Single plans keep the past→logged rule, except quick plans,
    // which are date-intentions (see header note).
    const isPlanInstance = !!recurrenceGroupId || (isQuickPlan
      ? format(occ, "yyyy-MM-dd") >= todayLocalISODate()
      : occ.getTime() > Date.now());
    for (const r of records) {
      await base44.entities.Activity.create({
        timestamp: occ.toISOString(),
        activity_name: r.activity_name,
        activity_category_ids: r.activity_category_ids || [],
        ...(r.color ? { color: r.color } : {}),
        task_id: effectiveLinkedTask?.id || null,
        duration_minutes: isQuickPlan ? null : (durationMinutes > 0 ? Number(durationMinutes) : null),
        fronting_alter_ids: alterIds,
        notes: (notes || "").trim() || null,
        location: (location || "").trim() || null,
        is_planned: isPlanInstance,
        is_quick_plan: isQuickPlan,
        is_critical: !!isCritical,
        critical_lead_steps: isCritical ? leadSteps : null,
        recurrence_group_id: recurrenceGroupId,
        recurrence_interval: recurrenceGroupId ? recurrence.interval : null,
        assigned_alter_ids: isPlanInstance ? alterIds : [],
        status: isPlanInstance ? ACTIVITY_STATUSES.SCHEDULED : ACTIVITY_STATUSES.LOGGED,
        actual_duration_minutes: null,
        reschedule_history: [],
        reminder_offset_minutes: reminderOffset,
      });
    }
  }

  // Keep a pre-existing linked to-do's due date in step with the plan.
  if (linkedTask) {
    try {
      const dueDateStr = format(timestamp, "yyyy-MM-dd");
      if (linkedTask.due_date !== dueDateStr) {
        await base44.entities.Task.update(linkedTask.id, { due_date: dueDateStr });
      }
    } catch { /* non-fatal */ }
  }

  return { occurrences, derivedTask, recurrenceGroupId };
}

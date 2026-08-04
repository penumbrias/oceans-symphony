// Completion sync across the Task ↔ Activity link (Activity.task_id).
//
// The link used to be one-way and inert: a plan pushed its date into the
// to-do and then the two never spoke again — ticking the to-do left the plan
// nagging in "Plans needing review" forever, and resolving the plan left the
// to-do open. These two helpers are the whole fix, called from every place
// that completes either side (consolidation proposal, Phase 1).
//
// Rules (owner-approved):
//   • Task completed → its scheduled plan(s) resolve as DONE.
//   • Plan resolved done/partial → its task completes (with completed_date,
//     which the daily-task trigger reads).
//   • Plan skipped/cancelled → the task is NOT touched: deciding not to do
//     the plan is not doing the to-do.
//   • Sync only ever SETS completion on the twin — it never deletes and
//     never un-completes anything automatically (user-data invariant).
//
// Both helpers are best-effort: a sync failure must never block the user's
// own action, so callers fire-and-await but errors are swallowed here.

import { base44 } from "@/api/base44Client";

// After a Task flips to completed: resolve its linked scheduled plans.
// (Un-completing a task deliberately does nothing to plans.)
export async function syncTaskCompleted(taskId) {
  try {
    if (!taskId) return;
    const plans = await base44.entities.Activity.filter({ task_id: taskId });
    const now = new Date().toISOString();
    for (const plan of plans) {
      if (plan.status !== "scheduled") continue; // only pending plans follow
      await base44.entities.Activity.update(plan.id, {
        status: "done",
        resolved_at: now,
      });
    }
  } catch { /* best-effort — the user's own completion already succeeded */ }
}

// After an Activity resolves: complete its linked task on done/partial.
export async function syncActivityResolved(activity, status) {
  try {
    const taskId = activity?.task_id;
    if (!taskId) return;
    if (status !== "done" && status !== "partial") return;
    const task = await base44.entities.Task.get(taskId).catch(() => null);
    if (!task || task.completed) return;
    await base44.entities.Task.update(taskId, {
      completed: true,
      completed_date: new Date().toISOString(),
    });
  } catch { /* best-effort */ }
}

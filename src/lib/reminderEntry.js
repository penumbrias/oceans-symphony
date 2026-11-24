// THE reminder editing write path (house step 0.6, "plumbing out of the
// walls"). The reminder editor, the Manage list and the onboarding seeds
// write Reminder rows through here. Firing, snoozing and acting on a
// reminder (ReminderInstance, last_fired_at) stay with the scheduler
// (remindersScheduler.js), which is already a lib path.
//
// Rules kept from the pages:
//   - An edit writes only what the person can change: the editor's form is
//     a SNAPSHOT of the reminder, and writing its stale `last_fired_at` back
//     made a fast reminder re-fire every time it was edited.
//   - A changed schedule restarts an interval's clock and retires the old
//     schedule's waiting popups (fired / pending / snoozed → dismissed).
//   - Deleting a reminder ends its instances (so no badge stays lit) and
//     sends the reminder to the trash.
//
// scripts/test-reminder-entry.mjs pins the behaviour.

import { base44 } from "@/api/base44Client";

const R = () => base44.entities.Reminder;
const RI = () => base44.entities.ReminderInstance;

const BOOKKEEPING = ["id", "created_date", "updated_date", "created_by", "last_fired_at"];

export function reminderEditPatch(existing, data) {
  const patch = { ...data };
  for (const k of BOOKKEEPING) delete patch[k];
  const scheduleChanged =
    JSON.stringify([existing.trigger_type, existing.trigger_config]) !==
    JSON.stringify([data.trigger_type, data.trigger_config]);
  if (scheduleChanged && data.trigger_type === "interval") patch.last_fired_at = new Date().toISOString();
  return { patch, scheduleChanged };
}

// Saves the editor's form: an edit of `existing`, or a new reminder.
export async function saveReminder(existing, data) {
  if (!existing?.id) return R().create(data);
  const { patch, scheduleChanged } = reminderEditPatch(existing, data);
  if (scheduleChanged) {
    try {
      const old = await RI().filter({ reminder_id: existing.id });
      await Promise.all(
        (old || [])
          .filter((i) => ["fired", "pending", "snoozed"].includes(i.status))
          .map((i) => RI().update(i.id, { status: "dismissed" })),
      );
    } catch { /* best-effort cleanup */ }
  }
  return R().update(existing.id, patch);
}

export async function createReminders(list) {
  if (!list?.length) return [];
  return R().bulkCreate(list);
}

export async function setReminderActive(id, active) {
  return R().update(id, { is_active: !!active });
}

export async function deleteReminder(id) {
  if (!id) return;
  try {
    const linked = await RI().filter({ reminder_id: id });
    for (const inst of linked || []) await RI().delete(inst.id);
  } catch { /* non-fatal */ }
  await R().delete(id);
}

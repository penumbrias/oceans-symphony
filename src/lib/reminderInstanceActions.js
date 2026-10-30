// One place a reminder instance is answered (v0.322.0). The Reminders
// inbox and the Reminders widget both call these, so "Done", "Snooze",
// "Dismiss" and "Unsnooze" mean the same thing wherever they're tapped.
// Each returns after the write; callers invalidate ["reminderInstances"].

import { base44 } from "@/api/base44Client";
import { snoozeUntilDate } from "@/components/reminders/snoozeHelpers";

export const REMINDER_INSTANCES_QUERY_KEY = ["reminderInstances"];

// An instance still waiting on the person: fired, pending, or snoozed.
export const isOpenReminderInstance = (i) => ["fired", "pending", "snoozed"].includes(i?.status);

export function markReminderDone(instance, actedAction = "done") {
  return base44.entities.ReminderInstance.update(instance.id, { status: "acted", acted_action: actedAction });
}

export function dismissReminder(instance) {
  return base44.entities.ReminderInstance.update(instance.id, { status: "dismissed" });
}

export function snoozeReminder(instance, option) {
  return base44.entities.ReminderInstance.update(instance.id, { status: "snoozed", snoozed_until: snoozeUntilDate(option) });
}

export function unsnoozeReminder(instance) {
  return base44.entities.ReminderInstance.update(instance.id, { status: "fired", snoozed_until: null });
}

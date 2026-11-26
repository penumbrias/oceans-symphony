// The snooze words and lengths live with the reminder form
// (src/lib/reminderForm.js), so both houses say the same thing.
export { DEFAULT_SNOOZE_OPTIONS, formatSnoozeLabel } from "@/lib/reminderForm";

export function snoozeUntilDate(opt) {
  if (opt === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  if (opt === "next_week") {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString();
  }
  return new Date(Date.now() + opt * 60 * 1000).toISOString();
}

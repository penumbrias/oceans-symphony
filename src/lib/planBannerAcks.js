// The "you have X planned soon" banner's shared brain.
//
// The classic full-bleed banner (AnnouncementBanner) and the v2 home
// notices both surface the same fact, so they share the same selector and
// the same acknowledgement store — dismissing the reminder in one UI
// dismisses it in the other, instead of the two keeping separate scores.

import { readPlanRemindersDefaultOffset } from "@/lib/planReminderScheduler";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";

const ACK_KEY = "symphony_upcoming_plan_acks";

export function getPlanAcks() {
  try { return JSON.parse(localStorage.getItem(ACK_KEY) || "{}"); } catch { return {}; }
}

export function ackPlan(id) {
  const m = getPlanAcks();
  m[id] = Date.now();
  try { localStorage.setItem(ACK_KEY, JSON.stringify(m)); } catch { /* storage off */ }
}

// The soonest upcoming plan whose reminder window is open and which the
// user hasn't acknowledged. Only genuinely SCHEDULED plans qualify — a
// plan already resolved (done / skipped / cancelled) must never nag.
export function duePlanReminder(activities, now = Date.now()) {
  const acks = getPlanAcks();
  const defaultOffset = readPlanRemindersDefaultOffset();
  return (activities || [])
    .filter((a) => {
      if (!a?.timestamp) return false;
      const ts = new Date(a.timestamp).getTime();
      if (isNaN(ts) || ts <= now) return false;
      if (statusFor(a) !== ACTIVITY_STATUSES.SCHEDULED) return false;
      const offsetMs = (a.reminder_offset_minutes ?? defaultOffset) * 60_000;
      return now >= ts - offsetMs && !acks[a.id];
    })
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0] || null;
}

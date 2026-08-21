// In-progress "activity sessions" (like start/end sleep), stored in
// localStorage so they survive app restarts and can be read by the dashboard
// "Active activities" section + the persistent notification. The Activity
// record is only CREATED when a session ends — so a running session never
// pollutes the logged grid/tally.
//
// MULTIPLE concurrent sessions are supported: the store is an ARRAY of
//   { id, categoryId, name, color, startTime (ISO), alterIds: [], contactIds: [], notes }
// (legacy sessions may carry a single `alterId` instead of `alterIds`, and
// sessions started before contactIds existed simply omit it).
//
// A session can optionally carry `planActivityId` — the id of an existing
// scheduled plan it was started from. When such a session ends, the plan is
// RESOLVED in place (status → "done") rather than logging a new record, so
// "starting" a plan and finishing it completes that very plan.

import { base44 } from "@/api/base44Client";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { isNative } from "@/lib/platform";
import { toast } from "sonner";

const KEY = "symphony_active_activities_v1";
// Pre-multi single-session key (one object). Migrated into the array on read.
const LEGACY_KEY = "symphony_active_activity_v1";
export const ACTIVE_ACTIVITY_EVENT = "active-activity-changed";

function genId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `act-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function writeArr(arr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr));
    window.dispatchEvent(new Event(ACTIVE_ACTIVITY_EVENT));
  } catch { /* storage off */ }
}

// All running sessions (newest first). Migrates a legacy single session in.
export function getActiveActivities() {
  let arr = [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) arr = parsed;
  } catch { arr = []; }
  // One-time migration of the old single-object session.
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      if (old && typeof old === "object") arr = [{ id: old.id || genId(), ...old }, ...arr];
      localStorage.removeItem(LEGACY_KEY);
      writeArr(arr);
    }
  } catch { /* ignore migration errors */ }
  // Guarantee every entry has an id.
  return arr.map((a) => (a && a.id ? a : { ...a, id: genId() }));
}

// ── End-of-plan check-in (owner spec) ──────────────────────────────
// A session started FROM a plan has a scheduled end (plan timestamp +
// duration). If it's still running when that moment passes, an optional
// reminder asks whether to wrap it up or let it run — the session keeps
// running either way (the planner keeps drawing it to the now line).
const END_REMINDER_KEY = "symphony_active_end_reminder_v1";
export function readActiveEndReminderEnabled() {
  try { return localStorage.getItem(END_REMINDER_KEY) !== "0"; } catch { return true; }
}
export function writeActiveEndReminderEnabled(on) {
  try { localStorage.setItem(END_REMINDER_KEY, on ? "1" : "0"); } catch { /* storage off */ }
}

// The scheduled end for a running session, from its linked plan. Null when
// there's no plan or no duration. Exported so the planner can draw the
// dashed "remaining" piece from the same definition.
export function plannedEndMsFor(session, plan) {
  if (!session?.planActivityId || !plan?.timestamp) return null;
  const dur = Number(plan.duration_minutes) || 0;
  if (!dur) return null;
  const ms = new Date(plan.timestamp).getTime() + dur * 60000;
  return Number.isFinite(ms) ? ms : null;
}

// Native ids live in [1.0e9, 1.4e9): disjoint from the user-reminder
// scheduler's [1, 1e9) AND the plan scheduler's [1.5e9, 2.1e9) — a
// collision would let one scheduler cancel another's notification.
function endNativeIdFor(sessionId) {
  const seed = `active-end|${sessionId}`;
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return 1_000_000_000 + (Math.abs(h) % 400_000_000);
}

const endWebTimers = new Map();

async function scheduleActiveEndReminder(session) {
  try {
    if (!readActiveEndReminderEnabled() || !session?.planActivityId) return;
    const rows = await base44.entities.Activity.filter({ id: session.planActivityId });
    const plan = rows?.[0];
    const endMs = plannedEndMsFor(session, plan);
    if (!endMs || endMs <= Date.now()) return;
    const name = plan?.activity_name || session.name || "Activity";
    const timeLabel = new Date(endMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const title = `${name} was scheduled to end at ${timeLabel}`;
    const body = "Still going? End it when you're done — it keeps running until you do.";
    if (isNative()) {
      const { isNativeNotificationsEnabled, ensureRemindersChannel, REMINDERS_CHANNEL_ID } = await import("@/lib/nativeNotifications");
      if (!(await isNativeNotificationsEnabled())) return;
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await ensureRemindersChannel();
      const nativeId = endNativeIdFor(session.id);
      await LocalNotifications.schedule({
        notifications: [{
          id: nativeId,
          title,
          body,
          channelId: REMINDERS_CHANNEL_ID,
          largeIcon: "ic_notif_large",
          schedule: { at: new Date(endMs), allowWhileIdle: true },
          extra: { kind: "active_end_checkin", sessionId: session.id, activityId: session.planActivityId },
        }],
      });
      updateActiveActivity(session.id, { endReminderNativeId: nativeId });
      return;
    }
    // Web: best-effort while the app is open — in-app toast, plus a
    // system notification when the user already granted permission.
    const delay = endMs - Date.now();
    endWebTimers.set(session.id, setTimeout(() => {
      endWebTimers.delete(session.id);
      if (!getActiveActivities().some((a) => a.id === session.id)) return; // already ended
      toast(title, { description: body, duration: 12000 });
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(title, { body });
        }
      } catch { /* blocked */ }
    }, delay));
  } catch { /* never block starting an activity on reminder plumbing */ }
}

async function cancelActiveEndReminder(session) {
  try {
    const t = endWebTimers.get(session?.id);
    if (t) { clearTimeout(t); endWebTimers.delete(session.id); }
    if (session?.endReminderNativeId && isNative()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.cancel({ notifications: [{ id: session.endReminderNativeId }] });
    }
  } catch { /* non-fatal */ }
}

// Start a new running session. Returns the stored item (with its id).
export function addActiveActivity(obj) {
  const item = { id: genId(), ...obj };
  writeArr([item, ...getActiveActivities()]);
  scheduleActiveEndReminder(item);
  return item;
}

export function removeActiveActivity(id) {
  const gone = getActiveActivities().find((a) => a.id === id);
  if (gone) cancelActiveEndReminder(gone);
  writeArr(getActiveActivities().filter((a) => a.id !== id));
}

export function updateActiveActivity(id, patch) {
  writeArr(getActiveActivities().map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

// End a specific running session: create the logged Activity record and remove
// it from the store. The record is shaped EXACTLY like a normally-logged
// activity (activity_category_ids + fronting_alter_ids + notes), so an activity
// started via the "Active" toggle is indistinguishable from one logged with
// explicit start/end times. Returns { record, minutes, name } or null.
// With no id and exactly one running session, ends that one.
export async function endAndLogActiveActivity(id, endTimeIso) {
  const arr = getActiveActivities();
  const active = id ? arr.find((a) => a.id === id) : (arr.length === 1 ? arr[0] : null);
  if (!active) return null;
  const start = new Date(active.startTime);
  // Custom end time lets you fix it up if you forgot to end at the real moment.
  const end = endTimeIso ? new Date(endTimeIso) : new Date();
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  const alterIds = active.alterIds || (active.alterId ? [active.alterId] : []);
  const contactIds = active.contactIds || [];
  const noteVal = (typeof active.notes === "string" && active.notes.trim()) ? active.notes.trim() : null;
  let record;
  if (active.planActivityId) {
    // Started from an existing PLAN — resolve that plan to "done" rather than
    // creating a duplicate record. Keep its categories/name; stamp the real
    // elapsed time + when it actually happened, and carry over the note +
    // fronting alters captured during the session. Time banked by earlier
    // PAUSES (progress_minutes) counts toward the total and is cleared.
    let banked = 0;
    try {
      const rows = await base44.entities.Activity.filter({ id: active.planActivityId });
      banked = Number(rows?.[0]?.progress_minutes) || 0;
    } catch { /* no banked time */ }
    const total = minutes + banked;
    record = await base44.entities.Activity.update(active.planActivityId, {
      status: ACTIVITY_STATUSES.DONE,
      timestamp: start.toISOString(),
      duration_minutes: total,
      actual_duration_minutes: total,
      progress_minutes: null,
      fronting_alter_ids: alterIds,
      contact_ids: contactIds,
      notes: noteVal,
    });
    // The plan happened — clear any pending pre-start OS reminder for it.
    try {
      const { cancelPlanReminder } = await import("@/lib/planReminderScheduler");
      await cancelPlanReminder(active.planActivityId);
    } catch { /* non-fatal */ }
  } else {
    record = await base44.entities.Activity.create({
      timestamp: start.toISOString(),
      activity_name: active.name || "Activity",
      activity_category_ids: active.categoryId ? [active.categoryId] : [],
      ...(active.color ? { color: active.color } : {}),
      duration_minutes: minutes,
      fronting_alter_ids: alterIds,
      contact_ids: contactIds,
      notes: noteVal,
      is_planned: false,
      status: ACTIVITY_STATUSES.LOGGED,
    });
  }
  removeActiveActivity(active.id);
  const total = Number(record?.actual_duration_minutes) || minutes;
  return { record, minutes: total, name: active.name || "Activity", resolvedPlan: !!active.planActivityId };
}

// PAUSE a running plan session (owner spec): "I'm not actively engaged in
// it any more — but it isn't done." The elapsed minutes are BANKED on the
// plan (progress_minutes accumulates across pauses; folded into the total
// when the plan finally resolves), the plan's status is untouched, and the
// session leaves the Active-now store. Plan-less sessions have nothing to
// keep un-done, so pausing one just ends and logs it.
export async function pauseActiveActivity(id) {
  const arr = getActiveActivities();
  const active = id ? arr.find((a) => a.id === id) : (arr.length === 1 ? arr[0] : null);
  if (!active) return null;
  if (!active.planActivityId) return endAndLogActiveActivity(active.id);
  const minutes = Math.max(1, Math.round((Date.now() - new Date(active.startTime).getTime()) / 60000));
  let banked = 0;
  try {
    const rows = await base44.entities.Activity.filter({ id: active.planActivityId });
    banked = Number(rows?.[0]?.progress_minutes) || 0;
  } catch { /* start from this session alone */ }
  await base44.entities.Activity.update(active.planActivityId, { progress_minutes: banked + minutes });
  removeActiveActivity(active.id);
  return { minutes, total: banked + minutes, name: active.name || "Activity", paused: true };
}

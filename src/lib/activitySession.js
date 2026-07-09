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

// Start a new running session. Returns the stored item (with its id).
export function addActiveActivity(obj) {
  const item = { id: genId(), ...obj };
  writeArr([item, ...getActiveActivities()]);
  return item;
}

export function removeActiveActivity(id) {
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
    // fronting alters captured during the session.
    record = await base44.entities.Activity.update(active.planActivityId, {
      status: ACTIVITY_STATUSES.DONE,
      timestamp: start.toISOString(),
      duration_minutes: minutes,
      actual_duration_minutes: minutes,
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
  return { record, minutes, name: active.name || "Activity", resolvedPlan: !!active.planActivityId };
}

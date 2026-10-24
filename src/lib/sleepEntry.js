// THE save paths for sleep (v0.279.1, roadmap step 2).
//
// Five doors start or end a night: the Sleep page, the sleep widget, the
// quick action, the log modal (a past night) and the end modal. The quick
// action's one-tap "wake up" used to set the wake time and nothing else,
// so that night never reached the planner, and every door started a new
// night even when one was already running.
//
//   • startSleep        — begins a night, or returns the one already running.
//   • endSleep          — sets the wake time (plus whatever the caller
//                         recorded) and mirrors the night into the planner.
//   • mirrorSleepActivity — the planner mirror: one logged "Sleep"
//                         activity per night, created once and then kept in
//                         step. Sleep is the source of truth; the activity
//                         carries `source_sleep_id` (see planner/linkedSleep.js
//                         for the other direction).

import { base44 } from "@/api/base44Client";

const pad = (n) => String(n).padStart(2, "0");
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The night still running (newest first), read fresh.
export async function findSleepInProgress() {
  const rows = await base44.entities.Sleep.list();
  return [...(rows || [])]
    .filter((s) => s.bedtime && !s.wake_time)
    .sort((a, b) => new Date(b.bedtime) - new Date(a.bedtime))[0] || null;
}

export async function startSleep({ bedtime } = {}) {
  const running = await findSleepInProgress();
  if (running) return { sleep: running, reused: true };
  const at = bedtime ? new Date(bedtime) : new Date();
  // `date` is how the Sleep page files a night under a day; a record
  // without it is invisible there.
  const sleep = await base44.entities.Sleep.create({ date: localDay(at), bedtime: at.toISOString() });
  return { sleep, reused: false };
}

async function sleepCategory() {
  const categories = await base44.entities.ActivityCategory.list();
  return categories.find((c) => c.name?.toLowerCase() === "sleep")
    || base44.entities.ActivityCategory.create({ name: "sleep", color: "#6366f1" });
}

// Best-effort: the Sleep record is already saved, a failed mirror only
// means the planner doesn't show the night yet.
export async function mirrorSleepActivity(sleep, { bedtime, wakeTime, notes } = {}) {
  if (!sleep?.id) return null;
  const bedtimeISO = new Date(bedtime || sleep.bedtime).toISOString();
  const wake = wakeTime || sleep.wake_time;
  const durationMinutes = wake ? Math.max(0, Math.round((new Date(wake) - new Date(bedtimeISO)) / 60000)) : null;
  const note = notes === undefined ? (sleep.notes ?? null) : (notes || null);
  try {
    if (sleep.linked_activity_id) {
      const existing = await base44.entities.Activity.get(sleep.linked_activity_id).catch(() => null);
      if (existing) {
        return base44.entities.Activity.update(existing.id, { timestamp: bedtimeISO, duration_minutes: durationMinutes, notes: note });
      }
    }
    const cat = await sleepCategory();
    const act = await base44.entities.Activity.create({
      timestamp: bedtimeISO,
      // Explicitly a LOG: a status derived from the timestamp read a
      // future bedtime as a scheduled plan (owner report).
      status: "logged",
      activity_name: "Sleep",
      duration_minutes: durationMinutes,
      activity_category_ids: [cat.id],
      color: cat.color || "#6366f1",
      notes: note,
      source_sleep_id: sleep.id,
    });
    await base44.entities.Sleep.update(sleep.id, { linked_activity_id: act.id });
    return act;
  } catch (e) {
    try { console.warn("[sleep] planner mirror skipped:", e); } catch { /* ignore */ }
    return null;
  }
}

// fields: anything else the person recorded on waking (quality, notes,
// dreams, interruptions…), written with the wake time.
export async function endSleep(sleep, { wakeTime, ...fields } = {}) {
  if (!sleep?.id) return null;
  const wakeISO = new Date(wakeTime || Date.now()).toISOString();
  const updated = await base44.entities.Sleep.update(sleep.id, { ...fields, wake_time: wakeISO });
  await mirrorSleepActivity({ ...sleep, ...updated }, { wakeTime: wakeISO });
  return updated;
}

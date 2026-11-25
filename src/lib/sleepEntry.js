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
// `create: false` only keeps an existing mirror in step (never makes one).
export async function mirrorSleepActivity(sleep, { bedtime, wakeTime, notes, create = true } = {}) {
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
    if (!create) return null;
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

// ── Editing and deleting a night (house 3.3) ──────────────────────────
// fields: date, bedtime, wake_time, quality, notes, author_alter_ids,
// interruptions, dreamed, had_nightmare… Read fresh, only changed fields
// written, the version before kept in Recent changes. A night with a wake
// time keeps its planner mirror in step: an existing mirror is updated;
// an older night without the link finds its "Sleep" activity by bedtime
// and links both ways. A night that never had a mirror doesn't get one
// here (the edit modal never created one). `journal_entry_id` (the dream
// journal link) is only ever changed when the caller passes it.
export class SleepEditError extends Error {}

async function legacyMirrorFor(sleep) {
  try {
    const candidates = await base44.entities.Activity.filter({ activity_name: "Sleep" });
    const match = (candidates || []).find((a) => a.timestamp === sleep.bedtime);
    if (!match) return null;
    await base44.entities.Sleep.update(sleep.id, { linked_activity_id: match.id });
    await base44.entities.Activity.update(match.id, { source_sleep_id: sleep.id });
    return match.id;
  } catch {
    return null;
  }
}

export async function editSleep(id, { baseline = null, ...fields } = {}) {
  const { readFresh, editRecord } = await import("@/lib/recordEdit");
  const fresh = await readFresh("Sleep", id);
  const bed = fields.bedtime ?? fresh.bedtime;
  const wake = fields.wake_time ?? fresh.wake_time;
  if (fields.bedtime !== undefined && (!bed || Number.isNaN(new Date(bed).getTime()))) throw new SleepEditError("Pick a bedtime");
  if (bed && wake && new Date(wake) <= new Date(bed)) throw new SleepEditError("Wake time has to be after bedtime");
  const saved = await editRecord("Sleep", id, fields, { baseline, fresh });
  if (saved.wake_time) {
    const activityId = saved.linked_activity_id || (await legacyMirrorFor(fresh));
    if (activityId) {
      await mirrorSleepActivity({ ...saved, linked_activity_id: activityId }, { create: false });
    }
  }
  return base44.entities.Sleep.get(id);
}

// A night and its planner "Sleep" activity go to the trash together. The
// dream journal entry stays in Journals (journals outlive the night).
// Returns { trashed, journalKept }.
export async function deleteSleep(id) {
  const { trashRecords } = await import("@/lib/recordEdit");
  const fresh = await base44.entities.Sleep.get(id).catch(() => null);
  if (!fresh) return { trashed: 0, journalKept: false };
  const items = [{ entity: "Sleep", id }];
  if (fresh.linked_activity_id) {
    const act = await base44.entities.Activity.get(fresh.linked_activity_id).catch(() => null);
    if (act) items.push({ entity: "Activity", id: act.id });
  }
  const trashed = await trashRecords(items);
  return { trashed, journalKept: !!fresh.journal_entry_id };
}

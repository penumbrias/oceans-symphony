// THE save path for a NEW activity entry from the shared editor
// (ActivityEditor). Every door that logs, starts or plans an activity —
// the planner, the quick actions bar, the board's tracker widgets, a
// to-do's "more options" — hands its draft here, so what "already
// happened", "still going" and "coming up" mean can't drift apart again
// (the audit of 2026-10-23 found five editors with five different rules).
//
// The person says which one it is; the clock never decides. That fixes the
// planner saving "9:00 this morning" as a plan to resolve later.
//
//   mode "done" → a LOGGED record (createPlan kind "log")
//   mode "now"  → a running session (addActiveActivity); logged on end
//   mode "plan" → SCHEDULED record(s) through createPlan (kind "plan"),
//                 or untimed day plans (planned_date, no timestamp) — the
//                 same shape the day list writes.
//
// Editing an existing entry stays in the editor (it writes field by field,
// the planner's model); only creation lives here.

import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { createPlan } from "@/lib/planCreate";
import { addActiveActivity } from "@/lib/activitySession";
import { prepareAuthoredText, recordAuthoredText } from "@/lib/authoredText";
import { syncActivityResolved } from "@/lib/linkedCompletion";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { normalizeHex } from "@/lib/planTagColor";

export const ENTRY_MODES = Object.freeze({ DONE: "done", NOW: "now", PLAN: "plan" });

// The mode a new entry starts in when the door didn't say: anything that
// starts later than now is coming up, everything else already happened.
export function defaultModeFor(start, now = new Date()) {
  return start && start.getTime() > now.getTime() + 60000 ? ENTRY_MODES.PLAN : ENTRY_MODES.DONE;
}

// Record the members' fronting for an entry's time. Never duplicates:
// someone already on front isn't opened again, and a member whose fronting
// already covers the time isn't given a second closed session.
export async function recordFrontingFor(alterIds, start, end, { stillFronting }) {
  if (!alterIds?.length) return;
  const all = await base44.entities.FrontingSession.list();
  const idsOf = (s) => [s.alter_id, s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
  const activeIds = new Set(all.filter((s) => s.is_active).flatMap(idsOf));
  for (const alterId of alterIds) {
    if (stillFronting) {
      if (activeIds.has(alterId)) continue;
      await base44.entities.FrontingSession.create({
        alter_id: alterId, is_primary: false, start_time: start.toISOString(), is_active: true,
      });
    } else {
      const covered = all.some((s) => idsOf(s).includes(alterId)
        && new Date(s.start_time) < end && (s.end_time ? new Date(s.end_time) : new Date()) > start);
      if (covered) continue;
      await base44.entities.FrontingSession.create({
        alter_id: alterId, is_primary: false, start_time: start.toISOString(),
        end_time: end.toISOString(), is_active: false,
      });
    }
  }
}

// Same clock time, another day.
function onDay(day, clock) {
  const d = new Date(day);
  d.setHours(clock.getHours(), clock.getMinutes(), 0, 0);
  return d;
}

/**
 * Save a new entry. Returns { mode, count, firstId } — or null when the
 * person backed out of the whisper warning. Throws the note pipeline's
 * LogCommandFormatError for a malformed ~command (the caller toasts it).
 *
 * draft: {
 *   mode, name, categoryIds, categories (for colour), start: Date,
 *   minutes (number | null = no length), untimed (plan only),
 *   extraDays: Date[] (plan only), alterIds, contactIds, notes (raw text),
 *   location, tagColor, taskId, recurrence, reminderOffset, isCritical,
 *   leadSteps, recordFronting, stillFronting,
 * }
 */
export async function createActivityEntry(draft, { alters = [], terms } = {}) {
  const mode = draft.mode || ENTRY_MODES.DONE;
  const categoryIds = draft.categoryIds || [];
  const cat = categoryIds.length ? (draft.categories || []).find((c) => c.id === categoryIds[0]) : null;
  const name = (draft.name || "").trim() || cat?.name || "Activity";
  const tag = normalizeHex(draft.tagColor || "") || null;
  const location = (draft.location || "").trim() || null;

  // Shared text pipeline: ~commands run once, "-name" signs the entry,
  // @mentions notify, whispers warn.
  let prepared = null;
  if ((draft.notes || "").trim()) {
    prepared = await prepareAuthoredText(draft.notes.trim(), {
      alters, terms, surfaceLabel: mode === ENTRY_MODES.PLAN ? "plan note" : "activity note",
    });
    if (prepared === null) return null;
  }
  const noteText = prepared ? prepared.content : "";
  // A real "-name" / "+name" signpost says who it was for.
  const signed = prepared?.authorIds?.length ? prepared.authorIds : null;
  const alterIds = signed || draft.alterIds || [];
  const minutes = Number(draft.minutes) > 0 ? Math.round(Number(draft.minutes)) : null;
  const start = draft.start instanceof Date ? draft.start : new Date(draft.start || Date.now());

  if (mode === ENTRY_MODES.NOW) {
    // A timer is something happening now: a start in the future becomes now.
    const startAt = start.getTime() > Date.now() ? new Date() : start;
    // Several activities started together each get their own timer, so each
    // shows as running, can be ended on its own and is logged as its own
    // entry (owner report, 2026-11-02: starting two only recorded one).
    const cats = categoryIds.map((id) => (draft.categories || []).find((c) => c.id === id) || { id });
    const typed = (draft.name || "").trim();
    const typedIsOwn = !!typed && !cats.some((c) => (c.name || "").toLowerCase() === typed.toLowerCase());
    const runs = cats.length > 1
      ? cats.map((c) => ({
        categoryIds: [c.id],
        color: c.color || null,
        name: typedIsOwn ? `${typed} · ${c.name || "Activity"}` : (c.name || typed || "Activity"),
      }))
      : [{ categoryIds, color: cat?.color || null, name }];
    let firstSession = null;
    for (const run of runs) {
      const item = addActiveActivity({
        categoryId: run.categoryIds[0] || null,
        name: run.name,
        color: run.color,
        startTime: startAt.toISOString(),
        alterIds,
        contactIds: draft.contactIds || [],
        notes: noteText,
        extra: {
          activity_category_ids: run.categoryIds,
          ...(location ? { location } : {}),
          ...(tag ? { tag_color: tag } : {}),
          // One to-do, one timer: it is done when the first of them ends.
          ...(draft.taskId && !firstSession ? { task_id: draft.taskId } : {}),
        },
      });
      if (!firstSession) firstSession = item;
    }
    if (draft.recordFronting && alterIds.length) {
      await recordFrontingFor(alterIds, startAt, new Date(), { stillFronting: true });
    }
    if (prepared) {
      await recordAuthoredText({ ...prepared, alters, sourceType: "activity", sourceId: "", sourceLabel: "Activity note", navigatePath: "/planner" });
    }
    return { mode, count: runs.length, firstId: null, sessionId: firstSession?.id || null };
  }

  const record = {
    activity_name: name,
    activity_category_ids: categoryIds,
    ...(cat?.color ? { color: cat.color } : {}),
    ...(tag ? { tag_color: tag } : {}),
    ...(draft.taskId ? { task_id: draft.taskId } : {}),
    contact_ids: draft.contactIds || [],
  };
  const days = mode === ENTRY_MODES.PLAN
    ? [start, ...(draft.extraDays || []).filter((d) => d.toDateString() !== start.toDateString())]
    : [start];

  let firstId = null;
  let count = 0;
  for (const day of days) {
    if (mode === ENTRY_MODES.PLAN && draft.untimed) {
      // "Some time that day" — the day list's shape: planned_date and no
      // timestamp, drawn in the day's untimed strip.
      const d = new Date(day); d.setHours(0, 0, 0, 0);
      const created = await base44.entities.Activity.create({
        ...record,
        planned_date: format(d, "yyyy-MM-dd"),
        ...(minutes ? { duration_minutes: minutes } : {}),
        fronting_alter_ids: alterIds,
        assigned_alter_ids: alterIds,
        notes: noteText || null,
        location,
        is_planned: true,
        status: ACTIVITY_STATUSES.SCHEDULED,
        ...(prepared?.authorIds?.length ? { author_alter_ids: prepared.authorIds } : {}),
      });
      if (!firstId) firstId = created?.id || null;
      count += 1;
      continue;
    }
    const { occurrences, createdIds } = await createPlan({
      kind: mode === ENTRY_MODES.PLAN ? "plan" : "log",
      records: [record],
      timestamp: onDay(day, start),
      durationMinutes: minutes,
      alterIds,
      notes: noteText || null,
      location,
      isCritical: mode === ENTRY_MODES.PLAN && !!draft.isCritical,
      leadSteps: mode === ENTRY_MODES.PLAN && draft.isCritical ? draft.leadSteps : null,
      reminderOffset: mode === ENTRY_MODES.PLAN ? (draft.reminderOffset ?? null) : null,
      recurrence: mode === ENTRY_MODES.PLAN && draft.recurrence ? draft.recurrence : { interval: "none", count: 1 },
      authorAlterIds: prepared?.authorIds || [],
    });
    if (!firstId && createdIds?.length) firstId = createdIds[0];
    count += occurrences.length;
  }

  if (mode === ENTRY_MODES.DONE) {
    // Logging something linked to a to-do means the to-do got done.
    if (draft.taskId && firstId) {
      await syncActivityResolved({ id: firstId, task_id: draft.taskId }, ACTIVITY_STATUSES.DONE);
    }
    if (draft.recordFronting && alterIds.length) {
      const end = new Date(start.getTime() + (minutes || 0) * 60000);
      await recordFrontingFor(alterIds, start, end, { stillFronting: !!draft.stillFronting });
    }
  }

  if (prepared) {
    const dayKey = format(start, "yyyy-MM-dd");
    await recordAuthoredText({
      ...prepared, alters, sourceType: "activity", sourceId: firstId || "",
      sourceLabel: mode === ENTRY_MODES.PLAN ? "Plan note" : "Activity note",
      navigatePath: `/planner?date=${dayKey}${firstId ? `&highlight=${firstId}` : ""}`,
    });
  }
  return { mode, count, firstId };
}

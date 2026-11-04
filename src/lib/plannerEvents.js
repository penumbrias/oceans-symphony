// Planner events — THE save path and the shared query (v0.348.0).
//
// An event is a date to remember (payday, a birthday, an anniversary): no
// time, no length, nothing to mark done, and it can repeat (owner ask,
// 2026-11-04). It is its own entity, `PlannerEvent`, so it never counts as
// activity time, never lands in "unresolved plans" and never skews
// follow-through stats. The date maths lives in plannerEventDates.js.
//
// Every surface that shows plans shows events too: the planner's calendars
// and plans list, the timeline, and the Coming up / Today widgets. They all
// read `usePlannerEvents()` (query key ["plannerEvents"]).
//
// Deletes go through the entity proxy, so they land in the trash.

import { useQuery } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import { prepareAuthoredText, recordAuthoredText } from "@/lib/authoredText";
import { normalizeHex } from "@/lib/planTagColor";
import { EVENT_REPEATS, parseDayKey, reminderDaysOf, reminderTimeOf } from "@/lib/plannerEventDates";

export const PLANNER_EVENTS_KEY = ["plannerEvents"];

export function usePlannerEvents({ enabled = true } = {}) {
  const { data = [] } = useQuery({
    queryKey: PLANNER_EVENTS_KEY,
    queryFn: () => localEntities.PlannerEvent.list(),
    enabled,
  });
  return data;
}

function cleanFields(draft) {
  const title = (draft.title || "").trim();
  if (!title) throw new Error("Give the event a name.");
  if (!parseDayKey(draft.date)) throw new Error("Pick a date for the event.");
  const repeat = EVENT_REPEATS.includes(draft.repeat) ? draft.repeat : "none";
  const until = repeat !== "none" && parseDayKey(draft.until) && draft.until >= draft.date ? draft.until : null;
  return {
    title,
    date: draft.date,
    repeat,
    until,
    tag_color: normalizeHex(draft.tagColor || "") || null,
    alter_ids: Array.isArray(draft.alterIds) ? draft.alterIds : [],
    reminders: reminderDaysOf({ reminders: draft.reminders }),
    reminder_time: reminderTimeOf({ reminder_time: draft.reminderTime }),
  };
}

// Notes speak the app's grammar (~commands, signposts, @mentions). Returns
// null when the person backed out of the whisper warning.
async function prepareNotes(text, { alters, terms }) {
  if (!(text || "").trim()) return { prepared: null, notes: null };
  const prepared = await prepareAuthoredText(text.trim(), { alters, terms, surfaceLabel: "event note" });
  if (prepared === null) return null;
  return { prepared, notes: (prepared.content || "").trim() || null };
}

async function recordNotes(prepared, record, alters) {
  if (!prepared) return;
  await recordAuthoredText({
    ...prepared, alters, sourceType: "planner_event", sourceId: record?.id || "",
    sourceLabel: "Event note", navigatePath: `/planner?date=${record?.date || ""}`,
  });
}

/**
 * Save an event, new (no `id`) or edited. Returns the record, or null when
 * the person backed out of the whisper warning. Throws a user-facing error
 * for a missing name/date, and the note pipeline's LogCommandFormatError
 * for a malformed ~command.
 *
 * draft: { id?, title, date: "YYYY-MM-DD", repeat, until, notes (raw),
 *          tagColor, alterIds }
 */
export async function savePlannerEvent(draft, { alters = [], terms } = {}) {
  const fields = cleanFields(draft);
  const note = await prepareNotes(draft.notes, { alters, terms });
  if (note === null) return null;
  const patch = {
    ...fields,
    notes: note.notes,
    ...(note.prepared?.authorIds?.length ? { author_alter_ids: note.prepared.authorIds } : {}),
  };
  let record;
  if (draft.id) {
    record = await localEntities.PlannerEvent.update(draft.id, patch);
  } else {
    record = await localEntities.PlannerEvent.create({ ...patch, skipped_dates: [] });
  }
  await recordNotes(note.prepared, record || { id: draft.id, date: fields.date }, alters);
  return record;
}

// Leave one date out of a repeating event (the rest keep going). Reads the
// record fresh so two quick skips don't undo each other.
export async function skipEventDate(eventId, key) {
  const fresh = await localEntities.PlannerEvent.get(eventId);
  if (!fresh) return null;
  const skipped = Array.isArray(fresh.skipped_dates) ? fresh.skipped_dates : [];
  if (skipped.includes(key)) return fresh;
  return localEntities.PlannerEvent.update(eventId, { skipped_dates: [...skipped, key] });
}

export function deletePlannerEvent(eventId) {
  return localEntities.PlannerEvent.delete(eventId);
}

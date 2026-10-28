// Lineage (SystemChangeEvent) as seen from one alter, and the one way to
// edit or delete an event (v0.304.0). System History, the Lineage tab and
// the Lineage widget share it. Recording a new event stays with
// RecordSystemChangeModal, which also creates split relationships.
//
// Only the safe metadata is editable — date, year-only, cause, notes. The
// type and who's involved aren't, because changing them would have to
// unwind side effects (a split made relationships or alters); to
// restructure, delete and re-record.

import { localEntities } from "@/api/base44Client";
import { prepareAuthoredText, recordAuthoredText } from "@/lib/authoredText";

export const LINEAGE_KEY = ["systemChangeEvents"];

export const LINEAGE_TYPE_LABELS = {
  fusion: "Fusion", split: "Split", dormancy: "Dormancy", return: "Return", emergence: "Emergence", reformation: "Reformation",
};

// Events that describe a real before → after change. Dormancy / return /
// reformation name one alter on both sides; emergence lists co-emerging
// alters on both sides (they appeared together, not from each other).
export const isLineageTransition = (e) =>
  e?.type !== "dormancy" && e?.type !== "return" && e?.type !== "emergence" && e?.type !== "reformation";

export function lineageOf(events, alterId) {
  const related = (events || [])
    .filter((e) => !e.hidden && ((e.source_alter_ids || []).includes(alterId) || (e.result_alter_ids || []).includes(alterId)))
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const from = new Set();
  const became = new Set();
  for (const e of related) {
    if (!isLineageTransition(e)) continue;
    if ((e.result_alter_ids || []).includes(alterId)) (e.source_alter_ids || []).forEach((id) => { if (id !== alterId) from.add(id); });
    if ((e.source_alter_ids || []).includes(alterId)) (e.result_alter_ids || []).forEach((id) => { if (id !== alterId) became.add(id); });
  }
  return { related, predecessorIds: [...from], successorIds: [...became] };
}

export function lineageDateLabel(event) {
  const d = new Date(event?.date);
  if (Number.isNaN(d.getTime())) return "";
  return event.year_only ? String(d.getFullYear()) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// `patch` = { date, year_only, cause, notes }. Returns false when the save
// was blocked (whisper warning backed out); throws on a broken ~command.
export async function editLineageEvent(eventId, patch, { alters = [], terms = {} } = {}) {
  const prepared = await prepareAuthoredText(patch.notes || "", { alters, terms, surfaceLabel: "lineage event note", chips: false });
  if (prepared === null) return false;
  await localEntities.SystemChangeEvent.update(eventId, { ...patch, notes: prepared.content || null, author_alter_ids: prepared.authorIds });
  await recordAuthoredText({ ...prepared, alters, sourceType: "lineage", sourceId: eventId, sourceLabel: "Lineage event note", navigatePath: "/system-history" });
  return true;
}

// Into the trash (restorable from Recent changes for the recovery window).
export const deleteLineageEvent = (eventId) => localEntities.SystemChangeEvent.delete(eventId);

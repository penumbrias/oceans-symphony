// Lineage (SystemChangeEvent) as seen from one alter, and the one way to
// record, edit, hide or delete an event (v0.304.0; recording moved here in
// house step 0.6). System History, the Lineage tab, the Lineage widget and
// RecordSystemChangeModal share it.
//
// Only the safe metadata is editable — date, year-only, cause, notes. The
// type and who's involved aren't, because changing them would have to
// unwind side effects (a split made relationships or alters); to
// restructure, delete and re-record.

import { localEntities, base44 } from "@/api/base44Client";
import { prepareAuthoredText, recordAuthoredText } from "@/lib/authoredText";
import { withNewAlterDefaults } from "@/lib/newAlterDefaults";

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

export async function setLineageEventHidden(eventId, hidden) {
  return localEntities.SystemChangeEvent.update(eventId, { hidden: !!hidden });
}

// Records a new event and everything that comes with it. The modal has run
// the grammar (`prepared` for the notes, `preparedChange` for a
// reformation's "what changed") and collected the choices:
//   type, sourceAlterIds, year, cause, fusionType, absorptionTarget,
//   newAlter ({ name, color } for a new formation), splitResults
//   ([{ type: "existing", id } | { type: "new", name, color }]),
//   reformation ({ trigger, rename, oldName, newName, applyRename }),
//   archiveAbsorbed, archiveSource, mergeSelections ({ field: [{ name, value }] }).
// It creates any new alters, the event, the authored trail, "Split from"
// relationships for a split, and the profile changes the person picked.
// Alters are never deleted: the ones that fused or split away are only
// archived, and only when the person chose that. Returns the event.
export async function recordLineageEvent({
  type, sourceAlterIds = [], year, cause = "", fusionType = null, absorptionTarget = null,
  newAlter = null, splitResults = [], reformation = null,
  archiveAbsorbed = false, archiveSource = false, mergeSelections = {},
  prepared, preparedChange = null, alters = [],
}) {
  const A = localEntities.Alter;
  let resultAlterIds;
  if (type === "fusion" && fusionType === "absorption") {
    resultAlterIds = [absorptionTarget];
  } else if (type === "fusion" && fusionType === "new_formation") {
    const created = await A.create(withNewAlterDefaults({
      name: newAlter.name.trim(), color: newAlter.color, pronouns: "", description: "", is_archived: false,
    }));
    resultAlterIds = [created.id];
  } else if (type === "split") {
    const existing = splitResults.filter((r) => r.type === "existing").map((r) => r.id);
    const created = await Promise.all(
      splitResults.filter((r) => r.type === "new").map((r) =>
        A.create(withNewAlterDefaults({ name: r.name, color: r.color || "#9333ea", is_archived: false }))),
    );
    resultAlterIds = [...existing, ...created.map((c) => c.id)];
  } else {
    // dormancy / return / reformation / emergence: the same alters.
    resultAlterIds = [...sourceAlterIds];
  }

  const rf = reformation || {};
  const reformRename = type === "reformation" && sourceAlterIds.length === 1 && !!rf.rename && !!(rf.newName || "").trim();
  const yearNum = parseInt(year, 10) || new Date().getFullYear();
  const event = await localEntities.SystemChangeEvent.create({
    type,
    date: new Date(yearNum, 0, 1).toISOString(),
    year_only: true,
    source_alter_ids: sourceAlterIds,
    result_alter_ids: resultAlterIds,
    fusion_type: type === "fusion" ? fusionType : null,
    absorbed_into_alter_id: (type === "fusion" && fusionType === "absorption") ? absorptionTarget : null,
    cause: type === "reformation" ? (rf.trigger ? rf.trigger.trim() : "") : (cause || "").trim(),
    notes: prepared.content,
    author_alter_ids: prepared.authorIds,
    ...(type === "reformation" ? {
      what_changed: preparedChange?.content || null,
      renamed: reformRename,
      previous_name: reformRename ? rf.oldName : null,
      new_name: reformRename ? rf.newName.trim() : null,
    } : {}),
  });
  await recordAuthoredText({ ...prepared, alters, sourceType: "lineage", sourceId: event.id, sourceLabel: "Lineage event note", navigatePath: "/system-history" });
  if (preparedChange) await recordAuthoredText({ ...preparedChange, alters, sourceType: "lineage", sourceId: event.id, sourceLabel: "Reformation change", navigatePath: "/system-history" });

  // Reformation: the alter stays the same person; only optionally the name.
  if (reformRename && rf.applyRename) await A.update(sourceAlterIds[0], { name: rf.newName.trim() });

  // A split links each new part to where it came from.
  if (type === "split") {
    for (const resultId of resultAlterIds) {
      for (const sourceId of sourceAlterIds) {
        if (resultId === sourceId) continue;
        await base44.entities.AlterRelationship.create({
          alter_id_a: resultId,
          alter_id_b: sourceId,
          relationship_type: "Split from",
          direction: "a_to_b",
          color: "#a855f7",
          notes: `Auto-created from split event (${yearNum})`,
          strength: 3,
        });
      }
    }
  }

  // The profile changes the person picked on the Apply step.
  if (type === "fusion" && fusionType === "absorption") {
    if (archiveAbsorbed) {
      for (const id of sourceAlterIds.filter((id) => id !== absorptionTarget)) await A.update(id, { is_archived: true });
    }
    if (Object.values(mergeSelections || {}).some((arr) => arr?.length > 0)) {
      // Fresh read, so text appended here never overwrites an edit made
      // since the modal opened.
      const persistent = (await A.get(absorptionTarget)) || alters.find((a) => a.id === absorptionTarget);
      const mergeData = {};
      for (const [key, selections] of Object.entries(mergeSelections)) {
        if (!Array.isArray(selections) || selections.length === 0) continue;
        const existingVal = persistent?.[key]?.trim() || "";
        const appended = selections.map((s) => `From ${s.name}: ${s.value}`).join("\n\n");
        mergeData[key] = existingVal ? `${existingVal}\n\n${appended}` : appended;
      }
      if (Object.keys(mergeData).length > 0) await A.update(absorptionTarget, mergeData);
    }
  }
  if (type === "fusion" && fusionType === "new_formation") {
    for (const id of sourceAlterIds) await A.update(id, { is_archived: true });
  }
  if (type === "split" && archiveSource) {
    for (const id of sourceAlterIds) await A.update(id, { is_archived: true });
  }
  return event;
}

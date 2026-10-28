// Relationships between alters are written one way (v0.304.0). The profile
// Relationships tab, the Relationships widget and the System Map panel all
// save and delete through here, and all edit through the one editor
// (CreateRelationshipModal, which also edits). Notes speak the full grammar
// as plain text (~commands become "icon label" tokens).

import { base44 } from "@/api/base44Client";
import { prepareAuthoredText, recordAuthoredText } from "@/lib/authoredText";

export const RELATIONSHIPS_KEY = ["alterRelationships"];

export const relationshipTypeLabel = (rel) =>
  rel?.relationship_type === "Custom" ? (rel.custom_label || "Custom") : (rel?.relationship_type || "Related");

// Direction as seen from `selfIsA`'s side, so it always reads "this one →
// the other one".
export function relativeArrow(direction, selfIsA) {
  if (direction === "bidirectional" || !direction) return "↔";
  if (selfIsA) return direction === "a_to_b" ? "→" : "←";
  return direction === "a_to_b" ? "←" : "→";
}

// Every relationship involving `alterId`, with the other alter attached
// (rows whose other alter is gone are left out).
export function relationshipsOf(relationships, alterId, alterMap) {
  return (relationships || [])
    .filter((r) => r.alter_id_a === alterId || r.alter_id_b === alterId)
    .map((r) => {
      const selfIsA = r.alter_id_a === alterId;
      const other = alterMap[selfIsA ? r.alter_id_b : r.alter_id_a];
      return { ...r, other, _selfIsA: selfIsA };
    })
    .filter((r) => r.other);
}

// Create (no `id`) or update one relationship. Returns null when the person
// backs out of the whisper warning; a broken ~command throws
// (isLogCommandError) so the editor stays open.
export async function saveRelationship({ id = null, data, alters = [], terms = {}, navigatePath }) {
  const prepared = await prepareAuthoredText(data.notes || "", { alters, terms, surfaceLabel: "relationship note", chips: false });
  if (prepared === null) return null;
  const fields = { ...data, notes: prepared.content, author_alter_ids: prepared.authorIds };
  const row = id
    ? await base44.entities.AlterRelationship.update(id, fields)
    : await base44.entities.AlterRelationship.create(fields);
  const rowId = id || row?.id;
  await recordAuthoredText({
    ...prepared, alters, sourceType: "relationship", sourceId: rowId, sourceLabel: "Relationship note",
    navigatePath: navigatePath || `/alter/${data.alter_id_a || row?.alter_id_a}?tab=relationships`,
  });
  return row;
}

// Into the trash (restorable from Recent changes for the recovery window).
export const deleteRelationship = (id) => base44.entities.AlterRelationship.delete(id);

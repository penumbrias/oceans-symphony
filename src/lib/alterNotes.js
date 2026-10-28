// An alter's notes (AlterNote) are written one way (v0.302.0): the Notes
// tab and the Notes widget both save through here, so both speak the full
// grammar (~commands, signposts, @mentions, /w whispers) and leave the same
// mention trail.

import { base44 } from "@/api/base44Client";
import { prepareAuthoredText, recordAuthoredText } from "@/lib/authoredText";

export const alterNotesKey = (alterId) => ["alterNotes", alterId];

const trail = (t, alterId) => ({
  sourceLabel: `${t.Alter} note`,
  navigatePath: `/alter/${alterId}?tab=notes`,
});

// Returns null when the person backs out of the whisper warning. A broken
// ~command throws (isLogCommandError) — the caller shows it and keeps the
// draft.
export async function saveAlterNote({ alterId, noteId = null, text, alters, terms }) {
  const prepared = await prepareAuthoredText(String(text || "").trim(), { alters, terms, surfaceLabel: `${terms.alter} note` });
  if (prepared === null) return null;
  const fields = { content: prepared.content, author_alter_ids: prepared.authorIds };
  const note = noteId
    ? await base44.entities.AlterNote.update(noteId, fields)
    : await base44.entities.AlterNote.create({ alter_id: alterId, ...fields });
  const id = noteId || note?.id;
  await recordAuthoredText({ ...prepared, alters, sourceType: "note", sourceId: id, ...trail(terms, alterId) });
  return note;
}

// Into the trash (restorable from Recent changes for the recovery window).
export function deleteAlterNote(noteId) {
  return base44.entities.AlterNote.delete(noteId);
}

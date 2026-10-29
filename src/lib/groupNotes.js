// A group's notes (GroupNote) are written one way (v0.307.0): the classic
// Notes tab and the group Notes widget both save through here, so both
// speak the full grammar (~commands, signposts, @mentions, /w whispers) and
// leave the same mention trail.

import { base44 } from "@/api/base44Client";
import { prepareAuthoredText, recordAuthoredText } from "@/lib/authoredText";

// The query key the classic tab already used.
export const groupNotesKey = (groupId) => ["groupNotes", groupId];

export async function listGroupNotes(groupId) {
  const all = await base44.entities.GroupNote.list("-created_date");
  return (all || []).filter((n) => n.group_id === groupId);
}

// Returns null when the person backs out of the whisper warning. A broken
// ~command throws (isLogCommandError) — the caller shows it and keeps the
// draft. `chips: false` for surfaces that show notes as plain text.
export async function saveGroupNote({ groupId, noteId = null, text, alters, terms, chips = true }) {
  const prepared = await prepareAuthoredText(String(text || "").trim(), { alters, terms, surfaceLabel: "group note", ...(chips ? {} : { chips: false }) });
  if (prepared === null) return null;
  const fields = { content: prepared.content, author_alter_ids: prepared.authorIds };
  const note = noteId
    ? await base44.entities.GroupNote.update(noteId, fields)
    : await base44.entities.GroupNote.create({ group_id: groupId, ...fields, created_date: new Date().toISOString() });
  const id = noteId || note?.id;
  await recordAuthoredText({ ...prepared, alters, sourceType: "group", sourceId: id, sourceLabel: "Group note", navigatePath: `/group/${groupId}?tab=notes` });
  return note;
}

// Into the trash (restorable from Recent changes for the recovery window).
export function deleteGroupNote(noteId) {
  return base44.entities.GroupNote.delete(noteId);
}

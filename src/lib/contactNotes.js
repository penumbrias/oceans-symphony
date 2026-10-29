// A contact's notes (ContactNote) are written one way (v0.308.0): the
// classic Notes tab and the contact Notes widget both save through here, so
// both speak the full grammar (~commands, signposts, @mentions, /w whispers)
// and leave the same mention trail. A contact note is dated by `timestamp`,
// which the classic tab lets the person change.

import { base44 } from "@/api/base44Client";
import { prepareAuthoredText, recordAuthoredText } from "@/lib/authoredText";

// The query key the classic tab already used.
export const contactNotesKey = (contactId) => ["contactNotes", contactId];

// Newest first, by the note's own time.
export async function listContactNotes(contactId) {
  const rows = (await base44.entities.ContactNote.filter({ contact_id: contactId })) || [];
  return [...rows].sort((a, b) => (b.timestamp || b.created_date || "").localeCompare(a.timestamp || a.created_date || ""));
}

// Returns null when the person backs out of the whisper warning. A broken
// ~command throws (isLogCommandError). `chips: false` for surfaces that show
// notes as plain text. `timestamp` only changes when it's passed.
export async function saveContactNote({ contactId, noteId = null, text, alters, terms, chips = true, timestamp }) {
  const prepared = await prepareAuthoredText(String(text || "").trim(), { alters, terms, surfaceLabel: "contact note", ...(chips ? {} : { chips: false }) });
  if (prepared === null) return null;
  const fields = { content: prepared.content, author_alter_ids: prepared.authorIds, ...(timestamp ? { timestamp } : {}) };
  const note = noteId
    ? await base44.entities.ContactNote.update(noteId, fields)
    : await base44.entities.ContactNote.create({ contact_id: contactId, timestamp: new Date().toISOString(), ...fields });
  const id = noteId || note?.id;
  await recordAuthoredText({ ...prepared, alters, sourceType: "contact", sourceId: id, sourceLabel: "Contact note", navigatePath: `/contacts/${contactId}?tab=notes` });
  return note;
}

// Into the trash (restorable from Recent changes for the recovery window).
export function deleteContactNote(noteId) {
  return base44.entities.ContactNote.delete(noteId);
}

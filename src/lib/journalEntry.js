// THE journal write path (house step 0.6, "plumbing out of the walls").
//
// Every JournalEntry the app writes on the person's behalf goes through
// here: the Journals editor, the switch journal, the journal widget, the
// ~journal command, long check-in notes, dream journals from sleep, the
// file import dialog, folder moves and renames, the locked-entry upgrade and
// delete. Imports from other apps (OpenPlural, PluralStar, Florality) build
// their own rows from a foreign shape and stay in their importers.
//
// Rules this file keeps (see CLAUDE.md):
//   - Authors: `author_alter_id` is the first author, `co_author_alter_ids`
//     the others. New journals never write the legacy `author_alter_ids`
//     (journalAuthors.js reads it for older rows only).
//   - A journal's day is `entry_date` when the person picked one; the
//     record's `created_date` is never written by hand except where the old
//     check-in path already did (kept for the same rows to look the same).
//   - Locked (`is_encrypted`) journals: this file never reads or rewrites
//     the ciphertext except to upgrade it, with the person's password, in
//     the reader (upgradeLockedJournal). Their bodies are never scanned for
//     tags or mentions.
//   - Delete is the entity proxy's soft trash, so Settings → Trash can put
//     it back. Linked records (a sleep's dream journal, a check-in's long
//     note) are never deleted from here.
//
// Record shapes are exactly what the pages wrote before this file existed;
// scripts/test-journal-entry.mjs pins them.

import { base44 } from "@/api/base44Client";
import { withTrashBatch } from "@/lib/localDb";

const J = () => base44.entities.JournalEntry;

// ── The raw writers ────────────────────────────────────────────────────

export async function createJournalEntry(fields) {
  return J().create(fields);
}

export async function updateJournalEntry(id, patch) {
  if (!id) throw new Error("updateJournalEntry needs an id");
  return J().update(id, patch);
}

// Moves the entry to the trash (restorable from Settings → Trash).
export async function trashJournalEntry(id) {
  if (!id) return;
  await J().delete(id);
}

// Several entries that belong together come back together.
export async function trashJournalEntries(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return;
  await withTrashBatch(async () => {
    for (const id of list) await J().delete(id);
  });
}

// ── Small shared rules ─────────────────────────────────────────────────

// The signing rule every "who's in front wrote it" journal uses: the first
// person is the author, the others co-authors.
export function journalAuthorFields(ids) {
  const who = (ids || []).filter(Boolean);
  return { author_alter_id: who[0] || null, co_author_alter_ids: who.slice(1) };
}

// Untitled entries read as the date and time they were written, the same
// wherever they were written.
export function journalTitleOrNow(title) {
  return (title || "").trim() || new Date().toLocaleString();
}

// ── The Journals editor ────────────────────────────────────────────────

// The editor has already run ~commands, encrypted a locked body and picked
// the authors; it hands over the final fields. `existing` edits in place.
export async function saveEditedJournal(existing, fields) {
  return existing?.id ? updateJournalEntry(existing.id, fields) : createJournalEntry(fields);
}

// @mentions in a journal notify through MentionLog. `previousText` (the
// entry's earlier plain text, on an edit) keeps old mentions from firing
// again. Best-effort: a failure never undoes the saved entry.
export async function notifyJournalMentions({ entry, text, alters, authorAlterId = null, label, previousText = "" }) {
  if (!entry?.id || !text || !alters?.length) return;
  const { saveMentions, extractMentionedIds } = await import("@/lib/mentionUtils");
  try {
    await saveMentions({
      content: text,
      alters,
      sourceType: "journal",
      sourceId: entry.id,
      sourceLabel: label || "Journal Entry",
      navigatePath: `/journals?id=${entry.id}`,
      authorAlterId: authorAlterId || null,
      excludeIds: previousText ? extractMentionedIds(previousText, alters) : [],
    });
  } catch { /* notifications are best-effort */ }
}

// A locked entry saved with the old weak scheme is re-encrypted with the
// strong one when it opens (same password, same text). Only the ciphertext
// changes.
export async function upgradeLockedJournal(id, upgradedCiphertext) {
  if (!id || !upgradedCiphertext) return null;
  return updateJournalEntry(id, { content: upgradedCiphertext });
}

// ── Check-in notes over 50 words ───────────────────────────────────────

export const CHECKIN_JOURNAL_FOLDER = "Check-In Journals";

// A long check-in note lives in a journal. Updates the linked entry's text
// when there is one; if that entry is gone, or there was none, makes a new
// one at the check-in's time. Returns the journal's id.
export async function saveCheckInJournal({ journalEntryId = null, content, title, at }) {
  if (journalEntryId) {
    try {
      await updateJournalEntry(journalEntryId, { content });
      return journalEntryId;
    } catch { /* the linked entry is gone: make a new one below */ }
  }
  const entry = await createJournalEntry({
    title,
    content,
    entry_type: "personal",
    tags: ["checkin"],
    folder: CHECKIN_JOURNAL_FOLDER,
    created_date: at,
    entry_date: at, // create() re-stamps created_date; this keeps the chosen time
  });
  return entry.id;
}

// ── Dream journals from sleep ──────────────────────────────────────────

export const DREAM_JOURNAL_FOLDER = "Dreams";

const dreamTags = (nightmare) => [nightmare ? "nightmare" : "dream"];

export async function createDreamJournal({ title, content, nightmare = false }) {
  return createJournalEntry({
    title,
    content,
    folder: DREAM_JOURNAL_FOLDER,
    tags: dreamTags(nightmare),
    entry_type: "dream",
  });
}

// Edits to a sleep's notes reach its dream journal. Never deletes it: the
// journal outlives the sleep record.
export async function updateDreamJournal(id, { title, content, nightmare = false }) {
  return updateJournalEntry(id, {
    title,
    content,
    folder: DREAM_JOURNAL_FOLDER,
    tags: dreamTags(nightmare),
  });
}

// ── Switch journal ─────────────────────────────────────────────────────

export async function createSwitchJournal({ title, content, authorIds = [], fallbackAuthorId = "", sessionId = "", switchData }) {
  const author = authorIds[0] || fallbackAuthorId || "";
  return createJournalEntry({
    title,
    content,
    entry_type: "switch_log",
    tags: ["switch"],
    author_alter_id: author,
    co_author_alter_ids: authorIds.filter((id) => id !== (authorIds[0] || fallbackAuthorId)),
    fronting_session_id: sessionId || "",
    allowed_alter_ids: [],
    switch_data: switchData,
  });
}

// ── Folders ────────────────────────────────────────────────────────────

const inside = (folder, path) => folder === path || (!!folder && folder.startsWith(`${path}/`));

// Where an entry goes when folder `path` is deleted: direct children to the
// parent (or no folder), deeper ones keep their sub-path under the parent.
export function folderAfterDelete(folder, path) {
  if (!inside(folder, path)) return folder;
  const parts = path.split("/");
  const parent = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
  if (folder.startsWith(`${path}/`)) {
    const remainder = folder.slice(path.length + 1);
    return parent ? `${parent}/${remainder}` : remainder;
  }
  return parent;
}

export function folderAfterRename(folder, oldPath, newPath) {
  if (folder === oldPath) return newPath;
  if (folder && folder.startsWith(`${oldPath}/`)) return newPath + folder.slice(oldPath.length);
  return folder;
}

// Moves the entries out of a deleted folder. Entries are never deleted.
export async function moveEntriesOutOfFolder(entries, path) {
  const affected = (entries || []).filter((e) => inside(e.folder, path));
  await Promise.all(affected.map((e) => updateJournalEntry(e.id, { folder: folderAfterDelete(e.folder, path) })));
  return affected.length;
}

export async function renameEntriesFolder(entries, oldPath, newPath) {
  const affected = (entries || []).filter((e) => inside(e.folder, oldPath));
  await Promise.all(affected.map((e) => updateJournalEntry(e.id, { folder: folderAfterRename(e.folder, oldPath, newPath) })));
  return affected.length;
}

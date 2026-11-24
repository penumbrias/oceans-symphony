#!/usr/bin/env node
// The journal write path (src/lib/journalEntry.js): create, edit, trash and
// restore through the real entity proxy, and the exact fields each old page
// wrote (copied from the page code before the move, v0.380.4).
//
//   node scripts/test-journal-entry.mjs

import assert from "node:assert/strict";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities();
const J = await import("../src/lib/journalEntry.js");
const { restoreFromTrash } = await import("../src/lib/trash.js");
const { journalAuthorIds } = await import("../src/lib/journalAuthors.js");
const { test, run } = runner();

test("editor: create then edit in place, authors in the two fields", async () => {
  const fields = {
    title: "Morning", content: "<p>hi</p>", tags: ["a"], is_encrypted: false, folder: null,
    author_alter_id: "a1", co_author_alter_ids: ["a2"],
  };
  const made = await J.saveEditedJournal(null, fields);
  assert.deepEqual(h.written(made), fields);
  assert.equal("author_alter_ids" in made, false, "never the legacy author field");
  assert.deepEqual(journalAuthorIds(made), ["a1", "a2"]);
  const edited = await J.saveEditedJournal(made, { ...fields, title: "Morning 2" });
  assert.equal(edited.id, made.id);
  assert.equal((await h.E.JournalEntry.list()).length, 1, "an edit never makes a second entry");
  assert.ok(edited._ft.title, "the changed field is stamped for sync");
  assert.equal(edited._ft.content, undefined, "an unchanged field keeps its time");
});

test("trash hides the entry; restore brings it back unchanged", async () => {
  h.reset();
  const e = await J.createJournalEntry({ title: "T", content: "x", author_alter_id: "a1", co_author_alter_ids: [] });
  await J.trashJournalEntry(e.id);
  assert.equal(await h.E.JournalEntry.get(e.id), null);
  assert.ok(h.raw("JournalEntry", e.id).trashed_at, "kept in the database, marked trashed");
  await restoreFromTrash([{ entity: "JournalEntry", id: e.id }]);
  const back = await h.E.JournalEntry.get(e.id);
  assert.equal(back.content, "x");
  assert.equal(back.trashed_at, null);
});

test("several entries trashed together share one batch", async () => {
  h.reset();
  const a = await J.createJournalEntry({ title: "a" });
  const b = await J.createJournalEntry({ title: "b" });
  await J.trashJournalEntries([a.id, b.id]);
  assert.equal(h.raw("JournalEntry", a.id).trash_batch, h.raw("JournalEntry", b.id).trash_batch);
});

test("locked journals: ciphertext is written as given and only upgraded on request", async () => {
  h.reset();
  const e = await J.saveEditedJournal(null, { title: "L", content: "CIPHER1", is_encrypted: true, tags: [] });
  assert.equal(e.content, "CIPHER1");
  await J.upgradeLockedJournal(e.id, "CIPHER2");
  const after = await h.E.JournalEntry.get(e.id);
  assert.equal(after.content, "CIPHER2");
  assert.equal(after.is_encrypted, true);
  assert.equal(await J.upgradeLockedJournal(e.id, ""), null, "an empty upgrade never blanks the body");
});

test("check-in journal: same fields as QuickCheckInModal / CheckInLog wrote", async () => {
  h.reset();
  const at = "2026-11-20T10:00:00.000Z";
  const id = await J.saveCheckInJournal({ content: "long note", title: "Check-in - 20/11/2026", at });
  const row = await h.E.JournalEntry.get(id);
  assert.deepEqual(h.written(row), {
    title: "Check-in - 20/11/2026", content: "long note", entry_type: "personal",
    tags: ["checkin"], folder: "Check-In Journals", entry_date: at,
  });
  // Editing the note updates the linked entry's text only.
  const same = await J.saveCheckInJournal({ journalEntryId: id, content: "longer note", title: "ignored", at });
  assert.equal(same, id);
  assert.equal((await h.E.JournalEntry.get(id)).content, "longer note");
  assert.equal((await h.E.JournalEntry.get(id)).title, "Check-in - 20/11/2026");
  // A link to an entry that's gone makes a new one.
  const fresh = await J.saveCheckInJournal({ journalEntryId: "missing", content: "n", title: "t", at });
  assert.notEqual(fresh, "missing");
  assert.equal((await h.E.JournalEntry.list()).length, 2);
});

test("dream journal: same fields as the sleep modals wrote", async () => {
  h.reset();
  const d = await J.createDreamJournal({ title: "Dream — November 20, 2026", content: "flying", nightmare: false });
  assert.deepEqual(h.written(d), { title: "Dream — November 20, 2026", content: "flying", folder: "Dreams", tags: ["dream"], entry_type: "dream" });
  await J.updateDreamJournal(d.id, { title: "Dream — x", content: "falling", nightmare: true });
  assert.deepEqual(h.written(await h.E.JournalEntry.get(d.id)), { title: "Dream — x", content: "falling", folder: "Dreams", tags: ["nightmare"], entry_type: "dream" });
});

test("switch journal: same fields as SwitchJournalModal wrote", async () => {
  h.reset();
  const sd = { trigger: "t", before: "b", after: "a", symptoms: { x: 1 } };
  const s = await J.createSwitchJournal({ title: "Switch", content: "c", authorIds: ["a2", "a3"], fallbackAuthorId: "a1", sessionId: "s1", switchData: sd });
  assert.deepEqual(h.written(s), {
    title: "Switch", content: "c", entry_type: "switch_log", tags: ["switch"],
    author_alter_id: "a2", co_author_alter_ids: ["a3"], fronting_session_id: "s1", allowed_alter_ids: [], switch_data: sd,
  });
  const unsigned = await J.createSwitchJournal({ title: "S", content: "c", authorIds: [], fallbackAuthorId: "a1", switchData: sd });
  assert.equal(unsigned.author_alter_id, "a1");
  assert.deepEqual(unsigned.co_author_alter_ids, []);
  assert.equal(unsigned.fronting_session_id, "");
  const nobody = await J.createSwitchJournal({ title: "S", content: "c", switchData: sd });
  assert.equal(nobody.author_alter_id, "");
});

test("signing rule and untitled entries", () => {
  assert.deepEqual(J.journalAuthorFields(["a", "b", "c"]), { author_alter_id: "a", co_author_alter_ids: ["b", "c"] });
  assert.deepEqual(J.journalAuthorFields([]), { author_alter_id: null, co_author_alter_ids: [] });
  assert.equal(J.journalTitleOrNow("  Hi "), "Hi");
  assert.ok(J.journalTitleOrNow("   ").length > 0);
});

test("folders: delete moves entries up, rename follows; nothing is deleted", async () => {
  h.reset();
  assert.equal(J.folderAfterDelete("A", "A"), null);
  assert.equal(J.folderAfterDelete("A/B", "A"), "B");
  assert.equal(J.folderAfterDelete("A/B/C", "A/B"), "A/C");
  assert.equal(J.folderAfterDelete("A/B", "A/B"), "A");
  assert.equal(J.folderAfterDelete("AB", "A"), "AB", "a folder that only starts with the name is untouched");
  assert.equal(J.folderAfterRename("A/B", "A", "Z"), "Z/B");
  assert.equal(J.folderAfterRename("A", "A", "Z"), "Z");
  assert.equal(J.folderAfterRename("AB", "A", "Z"), "AB");
  const rows = [];
  for (const folder of ["A", "A/B", "C", null]) rows.push(await J.createJournalEntry({ title: String(folder), folder }));
  assert.equal(await J.moveEntriesOutOfFolder(rows, "A"), 2);
  const after = await h.E.JournalEntry.list();
  assert.equal(after.length, 4);
  assert.deepEqual(after.map((r) => r.folder).sort(), [null, null, "B", "C"].sort());
  assert.equal(await J.renameEntriesFolder(after, "C", "D"), 1);
  assert.ok((await h.E.JournalEntry.list()).some((r) => r.folder === "D"));
});

test("mentions: body @mentions log once, earlier ones don't fire again", async () => {
  h.reset();
  const alters = [{ id: "a1", name: "Ash" }, { id: "a2", name: "Bea" }];
  const entry = await J.createJournalEntry({ title: "m" });
  await J.notifyJournalMentions({ entry, text: "hi @Ash and @Bea", alters, previousText: "hi @Ash", label: "" });
  const logs = await h.E.MentionLog.list();
  assert.deepEqual(logs.map((l) => l.mentioned_alter_id), ["a2"]);
  assert.equal(logs[0].source_type, "journal");
  assert.equal(logs[0].navigate_path, `/journals?id=${entry.id}`);
  assert.equal(logs[0].source_label, "Journal Entry");
  await J.notifyJournalMentions({ entry, text: "", alters }); // nothing to say: no rows, no throw
  assert.equal((await h.E.MentionLog.list()).length, 1);
});

await run();

#!/usr/bin/env node
// The bulletin board write path (src/lib/bulletinEntry.js): post (with and
// without a poll), edit, pins, reactions, legacy inline votes, read marks,
// comments, trash and restore, and the whisper privacy rule, through the
// real entity proxy. Field lists are copied from BulletinComposer,
// BulletinEditModal, BulletinCard and BulletinCommentThread before the move
// (v0.380.4).
//
//   node scripts/test-bulletin-entry.mjs

import assert from "node:assert/strict";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities();
const B = await import("../src/lib/bulletinEntry.js");
const { restoreFromTrash } = await import("../src/lib/trash.js");
const { WHISPER_PREVIEW } = await import("../src/lib/whisperRedact.js");
const { test, run } = runner();

const alters = [{ id: "a1", name: "Ash" }, { id: "a2", name: "Bea" }, { id: "a3", name: "Cy" }];
const record = (over = {}) => ({
  author_alter_id: "a1", author_alter_ids: ["a1"], content: "hi @Bea", mentioned_alter_ids: ["a2"],
  is_rich: false, group_id: null, is_pinned: false, reactions: {}, read_by_alter_ids: ["a1"], ...over,
});

test("post: the bulletin is the composer's record, notices follow", async () => {
  h.reset();
  const b = await B.postBulletin({ record: record(), alters, authorIds: ["a1"], mentionAuthorId: "a1" });
  assert.deepEqual(h.written(b), record());
  const logs = await h.E.MentionLog.list();
  const m = logs.find((l) => l.log_type === "mention");
  assert.equal(m.mentioned_alter_id, "a2");
  assert.equal(m.source_label, "Bulletin Board");
  assert.equal(m.navigate_path, `/bulletin/${b.id}`);
  const a = logs.find((l) => l.log_type === "authored");
  assert.equal(a.mentioned_alter_id, "a1");
  assert.equal(a.preview_text, "hi @Bea");
});

test("post with a poll: linked Poll record, pinned post, back-reference, inline label copy", async () => {
  h.reset();
  const b = await B.postBulletin({ record: record(), poll: { question: " Pizza? ", options: ["yes", " ", "no"] }, alters, authorIds: ["a1"], mentionAuthorId: "a1" });
  assert.equal(b.is_pinned, true);
  assert.deepEqual(b.poll, { question: "Pizza?", options: [{ label: "yes", votes: [] }, { label: "no", votes: [] }] });
  const p = await h.E.Poll.get(b.poll_id);
  assert.deepEqual(h.written(p), {
    question: "Pizza?", options: ["yes", "no"], votes: { 0: [], 1: [] }, is_closed: false,
    tally_mode: false, pinned_to_dashboard: true, created_by_alter_id: "a1", bulletin_id: b.id,
  });
  const g = await B.postBulletin({ record: record({ group_id: "g1" }), poll: { question: "Q", options: ["a", "b"] }, alters, authorIds: [] });
  assert.equal((await h.E.Poll.get(g.poll_id)).pinned_to_dashboard, false, "a group board's poll stays on that board");
});

test("whisper post: no secret in any MentionLog row; only recipients notified", async () => {
  h.reset();
  const secret = '<span class="whisper" data-whisper-for="Bea">the secret</span>';
  const b = await B.postBulletin({
    record: record({ content: secret, mentioned_alter_ids: ["a2"], is_rich: true }),
    alters, authorIds: ["a1"], mentionAuthorId: "a1", isWhisper: true, whisperRecipientIds: ["a2"],
  });
  assert.equal(b.content, secret, "the post keeps its text for its own screen");
  const logs = await h.E.MentionLog.list();
  assert.equal(logs.filter((l) => l.log_type === "mention").length, 1);
  for (const l of logs) {
    assert.ok(!JSON.stringify(l).includes("the secret"), `no secret in the ${l.log_type} row`);
    assert.equal(l.preview_text, WHISPER_PREVIEW);
  }
  assert.equal(logs.find((l) => l.log_type === "mention").source_label, "Bulletin Board (whisper)");
});

test("edit, pins and flags write exactly their fields", async () => {
  h.reset();
  const b = await B.createBulletin(record());
  const e = await B.editBulletin(b.id, { content: "new", authorIds: ["a2", "a3"], isRich: true });
  assert.equal(e.content, "new");
  assert.equal(e.author_alter_id, "a2");
  assert.deepEqual(e.author_alter_ids, ["a2", "a3"]);
  assert.equal(e.is_rich, true);
  assert.equal((await B.setBulletinPinned(b.id, true)).is_pinned, true);
  assert.equal((await B.toggleBulletinFlag({ ...b, dashboard_pinned: false }, "dashboard_pinned")).dashboard_pinned, true);
  await assert.rejects(() => B.toggleBulletinFlag(b, "content"));
  assert.equal((await B.setTaskBulletinContent(b.id, "[task:t1:done] x")).content, "[task:t1:done] x");
  assert.equal((await B.unlinkBulletinPoll(b.id)).poll_id, null);
});

test("reactions read fresh, so two taps from stale copies both count", async () => {
  h.reset();
  const b = await B.createBulletin(record());
  let seen = null;
  await B.reactToBulletin(b.id, "💜", "a1", {}, { onReactions: (r) => { seen = r; } });
  await B.reactToBulletin(b.id, "🎉", "a2", {}); // stale {}: must not drop 💜
  const r = (await h.E.Bulletin.get(b.id)).reactions;
  assert.deepEqual(r, { "💜": ["a1"], "🎉": ["a2"] });
  assert.deepEqual(seen, { "💜": ["a1"] });
  await B.reactToBulletin(b.id, "💜", "a1", {});
  assert.deepEqual((await h.E.Bulletin.get(b.id)).reactions["💜"], [], "a second tap takes it back");
});

test("legacy inline poll: one vote per voter, moved to the picked option", async () => {
  h.reset();
  const b = await B.createBulletin(record({ poll: { question: "Q", options: [{ label: "a", votes: ["a1"] }, { label: "b", votes: [] }] } }));
  await B.voteInlineBulletinPoll(b.id, 1, "a1", b.poll);
  const p = (await h.E.Bulletin.get(b.id)).poll;
  assert.deepEqual(p.options.map((o) => o.votes), [[], ["a1"]]);
});

test("mark read adds the reader once", async () => {
  h.reset();
  const b = await B.createBulletin(record({ read_by_alter_ids: [] }));
  await B.markBulletinsRead([b], "a2");
  await B.markBulletinsRead([await h.E.Bulletin.get(b.id)], "a2");
  assert.deepEqual((await h.E.Bulletin.get(b.id)).read_by_alter_ids, ["a2"]);
});

test("trash and restore a post", async () => {
  h.reset();
  const b = await B.createBulletin(record());
  await B.trashBulletin(b.id);
  assert.equal(await h.E.Bulletin.get(b.id), null);
  await restoreFromTrash([{ entity: "Bulletin", id: b.id }]);
  assert.equal((await h.E.Bulletin.get(b.id)).content, "hi @Bea");
});

test("comments: post (fields + activity bump), edit, react, trash, restore", async () => {
  h.reset();
  const b = await B.createBulletin(record());
  const c = await B.postBulletinComment({ bulletinId: b.id, authorIds: ["a1"], content: "hey @Cy", isRich: false, alters });
  assert.deepEqual(h.written(c), {
    bulletin_id: b.id, parent_comment_id: null, author_alter_id: "a1", author_alter_ids: ["a1"],
    content: "hey @Cy", is_rich: false, reactions: {},
  });
  assert.ok((await h.E.Bulletin.get(b.id)).last_activity_at);
  const logs = await h.E.MentionLog.list();
  assert.ok(logs.some((l) => l.log_type === "mention" && l.mentioned_alter_id === "a3" && l.source_type === "comment" && l.navigate_path === `/bulletin/${b.id}?commentId=${c.id}`));
  const r = await B.postBulletinComment({ bulletinId: b.id, parentCommentId: c.id, authorIds: [], content: "re", isRich: false, alters });
  assert.equal(r.author_alter_id, null);
  const e = await B.editBulletinComment(c.id, { content: "edited", authorIds: ["a2"], isRich: true });
  assert.equal(e.author_alter_id, "a2");
  assert.ok(e.edited_date);
  await B.reactToBulletinComment(c.id, "👍", "a1", {});
  assert.deepEqual((await h.E.BulletinComment.get(c.id)).reactions, { "👍": ["a1"] });
  await B.trashBulletinComment(c.id);
  assert.equal(await h.E.BulletinComment.get(c.id), null);
  await restoreFromTrash([{ entity: "BulletinComment", id: c.id }]);
  assert.equal((await h.E.BulletinComment.get(c.id)).content, "edited");
});

test("whisper comment: recipients only, and no secret in any row", async () => {
  h.reset();
  const b = await B.createBulletin(record());
  await B.postBulletinComment({ bulletinId: b.id, parentCommentId: "c0", authorIds: ["a1"], content: "secret words @Cy", isRich: true, isWhisper: true, whisperRecipientIds: ["a2"], alters });
  const logs = await h.E.MentionLog.list();
  assert.deepEqual(logs.filter((l) => l.log_type === "mention").map((l) => l.mentioned_alter_id), ["a2"]);
  for (const l of logs) assert.ok(!JSON.stringify(l).includes("secret words"));
  assert.equal(logs.find((l) => l.log_type === "mention").source_label, "Reply (whisper)");
});

await run();

#!/usr/bin/env node
// The system chat write path (src/lib/chatEntry.js): send / edit / delete a
// message, channels and categories, trash and restore, and the whisper
// privacy rule, through the real entity proxy. Field lists are copied from
// ChannelView / MeetingDialogue / Chat.jsx before the move (v0.380.4).
//
//   node scripts/test-chat-entry.mjs

import assert from "node:assert/strict";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities();
const C = await import("../src/lib/chatEntry.js");
const { restoreFromTrash } = await import("../src/lib/trash.js");
const { WHISPER_PREVIEW } = await import("../src/lib/whisperRedact.js");
const { test, run } = runner();

const alters = [{ id: "a1", name: "Ash" }, { id: "a2", name: "Bea" }, { id: "a3", name: "Cy" }];
const channel = { id: "ch1", name: "general" };

test("send: the message has exactly the old fields", async () => {
  h.reset();
  const m = await C.sendChatMessage({ channel, alters, cleanText: "hello @Bea", authorAlterIds: ["a1"], mentionedIds: ["a2"] });
  const w = h.written(m);
  assert.ok(w.timestamp);
  delete w.timestamp;
  assert.deepEqual(w, {
    channel_id: "ch1", author_alter_id: "a1", author_alter_ids: ["a1"], content: "hello @Bea",
    edited_at: null, deleted_at: null, reply_to_id: null, mentioned_alter_ids: ["a2"],
    is_whisper: false, whisper_to_ids: [], reactions: {}, thread_parent_id: null, is_pinned: false,
  });
  const logs = await h.E.MentionLog.list();
  const mention = logs.find((l) => l.log_type === "mention");
  assert.equal(mention.mentioned_alter_id, "a2");
  assert.equal(mention.navigate_path, `/chat?channel=ch1&message=${m.id}`);
  assert.equal(mention.source_label, "#general");
  assert.ok(logs.some((l) => l.log_type !== "mention"), "an authored-trail row for the speaker");
});

test("reply notice for a replied-to person not already @mentioned", async () => {
  h.reset();
  await C.sendChatMessage({ channel, alters, cleanText: "yes @Bea", authorAlterIds: ["a1"], mentionedIds: ["a2"], replyToId: "m0", replyAuthorIds: ["a2", "a3"] });
  const to = (await h.E.MentionLog.list()).filter((l) => l.log_type === "mention").map((l) => l.mentioned_alter_id).sort();
  assert.deepEqual(to, ["a2", "a3"], "a2 once (body), a3 from the reply");
});

test("whisper: secret text never reaches a MentionLog row", async () => {
  h.reset();
  const m = await C.sendChatMessage({
    channel, alters, cleanText: "the secret", authorAlterIds: ["a1"], mentionedIds: ["a2"],
    isWhisper: true, whisperRecipientIds: ["a2"],
  });
  assert.equal(m.content, "the secret", "the message keeps its text for its own screen");
  assert.equal(m.is_whisper, true);
  assert.deepEqual(m.whisper_to_ids, ["a2"]);
  const logs = await h.E.MentionLog.list();
  assert.ok(logs.length >= 2);
  for (const l of logs) {
    assert.ok(!JSON.stringify(l).includes("the secret"), `no secret in ${l.log_type} row`);
    assert.equal(l.preview_text, WHISPER_PREVIEW);
    assert.equal(l.source_label, "#general (whisper)");
  }
  const plain = await C.sendChatMessage({ channel, alters, cleanText: "x", authorAlterIds: [], whisperRecipientIds: ["a2"] });
  assert.deepEqual(plain.whisper_to_ids, [], "recipients only on a whisper");
});

test("edit and delete keep the record; delete leaves a placeholder", async () => {
  h.reset();
  const m = await C.sendChatMessage({ channel, alters, cleanText: "first", authorAlterIds: ["a1"], mentionedIds: [] });
  const e = await C.editChatMessage(m.id, { cleanText: "second", authorAlterIds: ["a2", "a3"], mentionedIds: [] });
  assert.equal(e.content, "second");
  assert.equal(e.author_alter_id, "a2");
  assert.deepEqual(e.author_alter_ids, ["a2", "a3"]);
  assert.ok(e.edited_at);
  const d = await C.deleteChatMessage(m.id);
  assert.equal(d.content, "");
  assert.ok(d.deleted_at);
  assert.equal(d.reply_to_id, null);
  assert.equal((await h.E.SystemChatMessage.list()).length, 1, "the placeholder stays");
});

test("channel delete trashes it with its messages in one batch; restore brings all back", async () => {
  h.reset();
  const ch = await C.createChatChannel(C.newChannelFields({ name: "talk", description: null, category_id: null, is_private: false, member_alter_ids: [] }));
  const w = h.written(ch);
  assert.equal(typeof w.sort_order, "number");
  assert.equal(w.is_archived, false);
  const m1 = await C.sendChatMessage({ channel: ch, alters, cleanText: "a", authorAlterIds: [] });
  const m2 = await C.sendChatMessage({ channel: ch, alters, cleanText: "b", authorAlterIds: [] });
  await C.deleteChatChannel(ch.id);
  assert.equal((await h.E.SystemChatChannel.list()).length, 0);
  assert.equal((await h.E.SystemChatMessage.list()).length, 0);
  const batch = h.raw("SystemChatChannel", ch.id).trash_batch;
  assert.equal(h.raw("SystemChatMessage", m1.id).trash_batch, batch);
  assert.equal(h.raw("SystemChatMessage", m2.id).trash_batch, batch);
  await restoreFromTrash([{ entity: "SystemChatChannel", id: ch.id }, { entity: "SystemChatMessage", id: m1.id }, { entity: "SystemChatMessage", id: m2.id }]);
  assert.equal((await h.E.SystemChatMessage.filter({ channel_id: ch.id })).length, 2);
});

test("default channel: same fields as the Chat page's first-run channel", async () => {
  h.reset();
  const g = await C.createDefaultChannel("Where alters talk to each other.");
  const w = h.written(g);
  delete w.created_date;
  assert.deepEqual(w, { name: "general", description: "Where alters talk to each other.", sort_order: 0, is_archived: false });
});

test("categories: create on top, set channels, reorder, delete moves children up", async () => {
  h.reset();
  const parent = await C.createChatCategory({ name: "P", color: null, parent_category_id: null });
  assert.ok(parent.sort_order < 0, "new categories sort to the top");
  assert.equal(parent.collapsed, false);
  const cat = await C.createChatCategory({ name: "C", color: "#fff", parent_category_id: parent.id });
  const sub = await C.createChatCategory({ name: "S", color: null, parent_category_id: cat.id });
  const a = await C.createChatChannel(C.newChannelFields({ name: "a", category_id: cat.id }));
  const b = await C.createChatChannel(C.newChannelFields({ name: "b", category_id: null }));
  await C.setCategoryChannels(cat.id, await h.E.SystemChatChannel.list(), [b.id]);
  assert.equal((await h.E.SystemChatChannel.get(a.id)).category_id, null);
  assert.equal((await h.E.SystemChatChannel.get(b.id)).category_id, cat.id);
  await C.toggleChatCategoryCollapsed(cat);
  assert.equal((await h.E.SystemChatCategory.get(cat.id)).collapsed, true);
  await C.reorderChatChannels([b.id, a.id]);
  assert.equal((await h.E.SystemChatChannel.get(a.id)).sort_order, 1);
  await C.deleteChatCategory(cat, { channels: await h.E.SystemChatChannel.list(), categories: await h.E.SystemChatCategory.list() });
  assert.equal((await h.E.SystemChatChannel.get(b.id)).category_id, parent.id, "channel moves up a level");
  assert.equal((await h.E.SystemChatCategory.get(sub.id)).parent_category_id, parent.id, "sub-category moves up");
  assert.equal(await h.E.SystemChatCategory.get(cat.id), null);
  assert.equal((await h.E.SystemChatChannel.list()).length, 2, "no channel is deleted");
});

await run();

#!/usr/bin/env node
// The system meeting write path (src/lib/meetingEntry.js): save a new
// meeting (steps through the grammar, notices, feelings logged), edit one
// (no feelings logged again), trash and restore, and the whisper preview
// rule, through the real entity proxy and the real grammar. Field lists are
// copied from SystemCheckIn.jsx before the move (v0.380.4).
//
//   node scripts/test-meeting-entry.mjs

import assert from "node:assert/strict";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities({
  stubs: {
    // The wheel picker is a React component; the grammar only needs its list.
    "@/components/emotions/EmotionWheelPicker": "export const WHEEL = {}; export default function W() { return null; }",
  },
});
const { configureCommandTerms } = await import("../src/lib/commandTerms.js");
configureCommandTerms({});
const M = await import("../src/lib/meetingEntry.js");
const { restoreFromTrash } = await import("../src/lib/trash.js");
const { WHISPER_PREVIEW } = await import("../src/lib/whisperRedact.js");
const { test, run } = runner();

const alters = [{ id: "a1", name: "Ash" }, { id: "a2", name: "Bea" }, { id: "a3", name: "Cy" }];
const terms = { system: "system", alter: "alter", alters: "alters" };

test("new meeting: steps saved with authors, notices, feelings logged once each", async () => {
  h.reset();
  const formData = {
    date: "2026-11-20",
    participants: [{ alter_id: "a1", emotions: ["Calm"], note: "ok" }, { alter_id: "a2", emotions: [] }, { alter_id: "gone", emotions: ["Sad"] }],
    step1_arrive: { breaths_taken: true },
    step2_notice: { feelings: "Tired; Calm", sensations: "warm" },
    step3_greet: { notes: "-Bea hello @Cy" },
  };
  const r = await M.saveMeeting({ formData, alters, terms });
  assert.equal(r.isNew, true);
  const w = h.written(r.meeting);
  assert.equal(w.date, "2026-11-20");
  assert.deepEqual(w.step1_arrive, { breaths_taken: true });
  assert.equal(w.step3_greet.notes.trim(), "hello @Cy", "the signpost marker is stripped");
  assert.deepEqual(w.step3_greet.author_alter_ids, ["a2"]);
  assert.deepEqual(w.participants, formData.participants);
  const mention = (await h.E.MentionLog.list()).find((l) => l.log_type === "mention" && l.source_type === "checkin");
  assert.equal(mention.mentioned_alter_id, "a3");
  assert.equal(mention.author_alter_id, "a2");
  assert.equal(mention.navigate_path, `/system-checkin?id=${r.meeting.id}`);
  const emo = await h.E.EmotionCheckIn.list();
  // a1's own feelings + "gone"'s (a participant row is logged as written) + step 2.
  assert.equal(emo.length, 3);
  const step2 = emo.find((e) => (e.note || "").startsWith("From system check-in"));
  assert.deepEqual(step2.emotions, ["Tired", "Calm"]);
  assert.equal(step2.note, "From system check-in. Sensations: warm");
  assert.deepEqual([...step2.fronting_alter_ids].sort(), ["a1", "a2"], "present = participants who exist");
  const a1 = emo.find((e) => e.alter_id === "a1");
  assert.equal(a1.note, "From system meeting. ok");
  assert.deepEqual(r.feelings, { logged: 3, participantFailures: 0, stepTwoFailed: false });
});

test("a meeting with no date gets today's", async () => {
  h.reset();
  const r = await M.saveMeeting({ formData: {}, alters, terms });
  assert.equal(r.meeting.date, M.todayLocalDate());
});

test("editing updates in place and never logs feelings again", async () => {
  h.reset();
  const first = await M.saveMeeting({ formData: { date: "2026-11-01", participants: [{ alter_id: "a1", emotions: ["Calm"] }] }, alters, terms });
  const before = (await h.E.EmotionCheckIn.list()).length;
  const again = await M.saveMeeting({ existing: first.meeting, formData: { ...first.meeting, step5_closing: { notes: "bye" } }, alters, terms });
  assert.equal(again.isNew, false);
  assert.equal(again.meeting.id, first.meeting.id);
  assert.equal((await h.E.SystemCheckIn.list()).length, 1);
  assert.equal((await h.E.EmotionCheckIn.list()).length, before);
  assert.equal(again.meeting.step5_closing.notes, "bye");
});

test("whisper in a step: the notice preview never holds the text", async () => {
  h.reset();
  const r = await M.saveMeeting({ formData: { date: "2026-11-02", step4_share: { notes: "/w @Bea [the secret plan]" } }, alters, terms });
  assert.ok(r, "saved");
  const logs = await h.E.MentionLog.list();
  const toBea = logs.filter((l) => l.log_type === "mention" && l.mentioned_alter_id === "a2");
  assert.ok(toBea.length >= 1, "the recipient is told");
  for (const l of logs) assert.ok(!JSON.stringify(l).includes("secret plan"), `no secret in ${l.log_type} row`);
  assert.ok(toBea.every((l) => l.preview_text === WHISPER_PREVIEW));
});

test("a broken command blocks the save", async () => {
  h.reset();
  await assert.rejects(() => M.saveMeeting({ formData: { step3_greet: { notes: "hi ~symptom:" } }, alters, terms }), /needs a name/);
  assert.equal((await h.E.SystemCheckIn.list()).length, 0);
});

test("trash and restore", async () => {
  h.reset();
  const r = await M.saveMeeting({ formData: { date: "2026-11-03" }, alters, terms });
  await M.trashMeeting(r.meeting.id);
  assert.equal(await h.E.SystemCheckIn.get(r.meeting.id), null);
  await restoreFromTrash([{ entity: "SystemCheckIn", id: r.meeting.id }]);
  assert.equal((await h.E.SystemCheckIn.get(r.meeting.id)).date, "2026-11-03");
});

test("step 2 feelings: older string form and the array form", () => {
  assert.deepEqual(M.stepTwoFeelings({ step2_notice: { feelings: "a, b;c" } }), ["a", "b", "c"]);
  assert.deepEqual(M.stepTwoFeelings({ step2_notice: { feelings: [" a ", "", 3] } }), ["a"]);
  assert.deepEqual(M.stepTwoFeelings({}), []);
});

await run();

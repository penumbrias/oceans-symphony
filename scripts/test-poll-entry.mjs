#!/usr/bin/env node
// The poll write path (src/lib/pollEntry.js): create, edit with options
// moving, votes (tally and per-person), decrement, add option, mode, close,
// pin (with its post), trash and restore, through the real entity proxy.
// Field lists are copied from Polls.jsx and BulletinComposer before the move
// (v0.380.4).
//
//   node scripts/test-poll-entry.mjs

import assert from "node:assert/strict";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities();
const P = await import("../src/lib/pollEntry.js");
const { createBulletin } = await import("../src/lib/bulletinEntry.js");
const { restoreFromTrash } = await import("../src/lib/trash.js");
const { test, run } = runner();

test("create on the Polls page: same fields as before (no pin field)", async () => {
  h.reset();
  const p = await P.createPoll({ question: "Q", options: ["a", "b"], tallyMode: false, createdByAlterId: "a1" });
  assert.deepEqual(h.written(p), { question: "Q", options: ["a", "b"], votes: { 0: [], 1: [] }, is_closed: false, tally_mode: false, created_by_alter_id: "a1" });
  const t = await P.createPoll({ question: "Q", options: ["a", "b"], tallyMode: true, createdByAlterId: "a1" });
  assert.equal(t.created_by_alter_id, null, "a tally poll has no creator");
});

test("per-person votes toggle and move; no voter is one system vote", async () => {
  h.reset();
  const p = await P.createPoll({ question: "Q", options: ["a", "b"] });
  await P.castPollVote(p, 0, ["a1", "a2"]);
  await P.castPollVote(p, 1, ["a1"]); // a stale copy: the fresh read keeps a2's vote
  let v = (await h.E.Poll.get(p.id)).votes;
  assert.deepEqual(v, { 0: ["a2"], 1: ["a1"] });
  await P.castPollVote(p, 1, ["a1"]);
  v = (await h.E.Poll.get(p.id)).votes;
  assert.deepEqual(v[1], [], "tapping your option again takes the vote back");
  await P.castPollVote(p, 0, []);
  assert.ok((await h.E.Poll.get(p.id)).votes[0].includes(""));
  assert.equal(globalThis.localStorage.getItem("symphony_dailytask_poll_voted_v1") !== null, true, "the routine marker is set");
});

test("tally votes add marks; decrement takes anonymous marks first", async () => {
  h.reset();
  const p = await P.createPoll({ question: "Q", options: ["a"], tallyMode: true });
  let seen = null;
  await P.castPollVote(p, 0, ["a1"], { onVotes: (v) => { seen = v; } });
  await P.castPollVote(p, 0, ["a1"]);
  assert.deepEqual((await h.E.Poll.get(p.id)).votes[0], ["", ""]);
  assert.deepEqual(seen[0], [""]);
  await h.E.Poll.update(p.id, { votes: { 0: ["a1", "", "a2"] } });
  assert.equal(await P.decrementTallyVote(p, 0), true);
  assert.deepEqual((await h.E.Poll.get(p.id)).votes[0], ["a1", "a2"]);
  assert.equal(await P.decrementTallyVote({ ...p, votes: {} }, 5), false);
});

test("closed polls take no votes", async () => {
  h.reset();
  const p = await P.createPoll({ question: "Q", options: ["a"] });
  await P.closePoll(p.id);
  assert.equal(await P.castPollVote(p, 0, ["a1"]), null, "the fresh read sees it closed");
  assert.deepEqual((await h.E.Poll.get(p.id)).votes, { 0: [] });
});

test("edit: votes follow their options; tally mode drops the creator", async () => {
  h.reset();
  const p = await P.createPoll({ question: "Q", options: ["a", "b"], createdByAlterId: "a1" });
  await h.E.Poll.update(p.id, { votes: { 0: ["x"], 1: ["y"] } });
  const fresh = await h.E.Poll.get(p.id);
  const e = await P.editPoll(fresh, { question: "Q2", options: ["b", "new", "a"], optionOrigin: [1, null, 0], tallyMode: false });
  assert.deepEqual(e.votes, { 0: ["y"], 1: [], 2: ["x"] });
  assert.equal(e.created_by_alter_id, "a1");
  const t = await P.editPoll(e, { question: "Q2", options: ["b"], optionOrigin: [0], tallyMode: true });
  assert.equal(t.created_by_alter_id, null);
  assert.equal(t.tally_mode, true);
  const added = await P.addPollOption(t, "z");
  assert.deepEqual(added.options, ["b", "z"]);
  assert.deepEqual(added.votes[1], []);
  assert.equal((await P.setPollTallyMode(p.id, false)).tally_mode, false);
});

test("pin follows to the bulletin it came from; trash unlinks it; restore", async () => {
  h.reset();
  const p = await P.createPoll({ question: "Q", options: ["a"], pinnedToDashboard: true });
  const b = await createBulletin({ content: "post", poll_id: p.id, is_pinned: true });
  await h.E.Poll.update(p.id, { bulletin_id: b.id });
  const linked = await h.E.Poll.get(p.id);
  await P.setPollPinned(linked, false);
  assert.equal((await h.E.Poll.get(p.id)).pinned_to_dashboard, false);
  assert.equal((await h.E.Bulletin.get(b.id)).is_pinned, false);
  await P.unpinPollOnly(p.id);
  await P.trashPoll(linked);
  assert.equal(await h.E.Poll.get(p.id), null);
  assert.equal((await h.E.Bulletin.get(b.id)).poll_id, null);
  await restoreFromTrash([{ entity: "Poll", id: p.id }]);
  assert.equal((await h.E.Poll.get(p.id)).question, "Q");
});

test("the remembered voting mode", () => {
  P.rememberTallyMode(true);
  assert.equal(P.defaultTallyMode(), true);
  P.rememberTallyMode(false);
  assert.equal(P.defaultTallyMode(), false);
  assert.deepEqual(P.pollCounts({ options: ["a", "b", "c"], votes: { 0: ["x", ""], 1: 3 } }), [2, 3, 0]);
});

await run();

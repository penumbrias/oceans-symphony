#!/usr/bin/env node
// The house's Polls room (board 25-PollsPhone): the order the polls show
// in, the words on each card's title bar and foot (who votes, who hasn't),
// who may close a poll, the editor keeping votes with their option, and
// that the room is drawn only on /polls with the old page gated, both
// frames mount it, the phone runs it edge to edge with its tools, it writes
// only through src/lib/pollEntry.js, nothing the old page did is lost, and
// its classes stay its own with thin edges. Pure: nothing is written.
//
//   node scripts/test-house-polls.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

const src = pathToFileURL(new URL("../src/", import.meta.url).pathname).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      let url = ${JSON.stringify(src)} + spec.slice(2);
      if (!/\\.[a-z]+$/.test(url)) url += ".js";
      return next(url, ctx);
    }
    return next(spec, ctx);
  }
`)}`);
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = mem();
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

const M = await import("../src/house/polls/pollsModel.js");
const S = await import("../src/lib/houseSwitch.js");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const terms = { alter: "part", alters: "parts", system: "crew", front: "the lead" };
const byId = { ash: { id: "ash", name: "Ash" }, sab: { id: "sab", name: "Sable" }, wren: { id: "wren", name: "Wren" } };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const P = [
  { id: "old", question: "Plant name?", is_closed: true, created_date: "2026-11-12T10:00:00Z", options: ["Gerald", "Fern"], votes: { 0: ["ash", "sab", "wren"], 1: ["ash"] } },
  { id: "paint", question: "Paint?", created_date: "2026-11-20T10:00:00Z", options: ["Blue", "Leave it"], votes: { 0: ["sab"], 1: ["wren"] } },
  { id: "dinner", question: "Dinner?", pinned_to_dashboard: true, created_date: "2026-11-10T10:00:00Z", options: ["Soup", { label: "Pasta" }], votes: { 0: ["ash", "sab", ""], 1: ["wren"] } },
  { id: "gone", question: "Gone", trashed_at: "x", options: ["a", "b"] },
];

test("the room's address: /polls only", () => {
  assert.equal(S.housePollsRoom("/polls"), true);
  assert.equal(S.housePollsRoom("/polls/"), true);
  assert.equal(S.housePollsRoom("/poll"), false);
  assert.equal(S.houseRebuiltRoom("/polls"), true);
});

test("order: open before closed, pinned first, newest first; trashed hidden", () => {
  assert.deepEqual(M.sortPolls(P).map((p) => p.id), ["dinner", "paint", "old"]);
  const s = M.sortPolls(P);
  assert.deepEqual(M.filterPolls(s, "open").map((p) => p.id), ["dinner", "paint"]);
  assert.deepEqual(M.filterPolls(s, "closed").map((p) => p.id), ["old"]);
});

test("counts, bars and the title bar's note", () => {
  const { counts, total } = M.pollTotals(P[2]);
  assert.deepEqual(counts, [3, 1]); assert.equal(total, 4);
  assert.equal(M.barPct(3, 4), 75); assert.equal(M.barPct(0, 0), 0);
  assert.equal(M.optionLabel(P[2].options[1]), "Pasta");
  assert.equal(M.pollMeta(P[2]), "pinned to the board");
  assert.equal(M.pollMeta(P[0], { dateWords: () => "Nov 12" }), "Nov 12");
  assert.equal(M.pollMeta({ ...P[1], bulletin_id: "b" }), "from the board");
});

test("who votes: the chosen voters, else the front, else the whole system", () => {
  assert.deepEqual(M.votersOf(null, ["ash"]), ["ash"]);
  assert.deepEqual(M.votersOf(["sab"], ["ash"]), ["sab"]);
  assert.deepEqual(M.votersOf(null, []), [""]);
  assert.equal(M.votedBy(P[2], 0, ["ash"]), true);
  assert.equal(M.votedBy({ ...P[2], tally_mode: true }, 0, ["ash"]), false);
});

test("the foot, in the person's terms", () => {
  const o = { byId, terms };
  assert.equal(M.pollFoot(P[0], o), "This poll is closed");
  assert.equal(M.pollFoot({ ...P[1], tally_mode: true }, o), "Anonymous tally: pick an option, then + or −");
  assert.equal(M.pollFoot(P[2], { ...o, voters: ["ash"], frontIds: ["ash"] }), "Voting as Ash, who is in the lead");
  assert.equal(M.pollFoot(P[1], { ...o, voters: ["ash", "sab"], frontIds: ["ash", "sab"] }), "Not voted yet: Ash");
  assert.equal(M.pollFoot(P[1], { ...o, voters: [""], frontIds: [] }), "Voting as the crew");
  assert.equal(M.pollFoot(P[1], { ...o, voters: ["wren"], frontIds: ["ash"], chosen: true }), "Voting as Wren");
});

test("closing: its maker, or anyone when it has none", () => {
  assert.equal(M.canClose(P[1], [""]), true);
  assert.equal(M.canClose({ ...P[1], created_by_alter_id: "ash" }, ["sab"]), false);
  assert.equal(M.canClose({ ...P[1], created_by_alter_id: "ash" }, ["sab", "ash"]), true);
  assert.equal(M.canClose(P[0], [""]), false);
});

test("the editor keeps votes with their option", () => {
  const e = M.editableOptions(P[2]);
  assert.deepEqual(e.options, ["Soup", "Pasta"]); assert.deepEqual(e.origin, [0, 1]);
  const f = M.formToSave({ question: " Dinner? ", options: ["", "Pasta", "New"], origin: [0, 1, null] });
  assert.deepEqual(f, { question: "Dinner?", options: ["Pasta", "New"], optionOrigin: [1, null] });
  assert.equal(M.formProblem({ question: "", options: ["a", "b"] }), "Type a question first");
  assert.equal(M.formProblem({ question: "q", options: ["a", " "] }), "Give it at least 2 options");
  assert.equal(M.formProblem({ question: "q", options: ["a", "b"] }), null);
  assert.equal(M.statusWords(M.sortPolls(P)), "3 polls · 2 open · 1 pinned to the board");
});

test("drawn only by the house: gated old page, both frames, edge to edge, its tools", () => {
  assert.ok(/path="\/polls" element=\{<HouseRoomGate><Polls \/><\/HouseRoomGate>\}/.test(read("src/App.jsx")), "the old page is gated");
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) assert.ok(read(f).includes("<HousePolls "), `${f} draws the room`);
  const phone = read("src/house/phone/HousePhoneFrame.jsx");
  assert.ok(/\|\| pollsRoom( \|\| \w+Room)* \? "px-0"/.test(phone), "the phone runs it edge to edge");
  assert.ok(/roomTools = [^;]*pollsRoom/.test(phone), "the phone frame reads the room's tools");
  assert.ok(/ownDocks[^;]*pollsRoom/.test(read("src/house/frame/HouseFrame.jsx")), "the room draws its own panels");
});

test("nothing the old page did is lost", () => {
  const r = read("src/house/polls/HousePolls.jsx");
  for (const s of ["castPollVote", "decrementTallyVote", "createPoll", "editPoll", "setPollPinned", "closePoll", "trashPoll", "rememberTallyMode", "defaultTallyMode", "SetFrontModal", "Anonymous tally count", "Add option", "Made by", "data-highlight-id", 'data-tour="polls-list"', 'tour: "polls-create"', 'data-tour="polls-create"']) assert.ok(r.includes(s), s);
  assert.ok(/<h1 className="hk-sr">Polls<\/h1>/.test(r), "the page name is a screen-reader heading, not a toolbar title");
});

test("the room writes only through the write path", () => {
  const dir = "src/house/polls";
  for (const f of readdirSync(new URL(`../${dir}`, import.meta.url)).filter((x) => /\.jsx?$/.test(x))) {
    const text = read(`${dir}/${f}`).replace(/\/\/.*$/gm, "");
    assert.ok(!/entities\.\w+\.(create|update|delete|bulkDelete)\(/.test(text), `${f} writes no record by hand`);
  }
});

test("its classes are its own, with thin edges", () => {
  const css = read("src/house/polls/polls.css");
  const sels = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/\.[a-z][\w-]*/g) || [];
  for (const c of sels) assert.ok(/^\.(hpo|hk)/.test(c), `${c} is the room's own or the kit's`);
  assert.ok(!css.split("\n").some((l) => /\b2px solid\b/.test(l) && !/focus-visible/.test(l)), "no 2px outlines");
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`ok   ${t.name}`); } catch (e) { failed++; console.log(`FAIL ${t.name}\n     ${e.message}`); }
}
console.log(failed ? `\n${failed} of ${tests.length} failed` : `\nAll ${tests.length} passed`);
process.exit(failed ? 1 : 0);

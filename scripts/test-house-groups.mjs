#!/usr/bin/env node
// The house's Groups room (board 26-Groups): the room's address and pages,
// the tree's rows (order, folding, search with paths, nothing buried by a
// loop), where a group may move or be dropped, the header's words, and
// that the room is drawn only on /groups and /group/:id with the old pages
// gated, both frames mount it, the phone runs it edge to edge with its
// tools, it writes only through the shared write paths (groupEntry.js,
// groupMembership via GroupMembersModal, groupNotes.js), Manage / Info /
// the person's own layout stay reachable, and its classes stay its own
// with thin edges. Pure: nothing is written anywhere.
//
//   node scripts/test-house-groups.mjs

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

const M = await import("../src/house/groups/groupsModel.js");
const S = await import("../src/lib/houseSwitch.js");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const terms = { alter: "part", alters: "parts", Alters: "Parts", system: "crew", System: "Crew" };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const G = [
  { id: "inner", name: "Inner world", order: 10 },
  { id: "garden", name: "The Garden", parent: "inner", owner_alter_id: "jun", order: 10 },
  { id: "green", name: "Greenhouse", parent: "garden" },
  { id: "lib", name: "The Library", parent: "inner", order: 20 },
  { id: "prot", name: "Protectors", order: 20 },
  { id: "loopA", name: "Loop A", parent: "loopB", order: 30 },
  { id: "loopB", name: "Loop B", parent: "loopA", order: 40 },
];
const A = [
  { id: "jun", name: "Juniper", groups: [{ id: "inner" }] },
  { id: "pip", name: "Pip", groups: [{ id: "garden" }] },
  { id: "sab", name: "Sable", groups: [{ id: "garden" }], is_archived: true },
];

test("the room's address: /groups and /group/:id, nothing else", () => {
  assert.equal(S.houseGroupsRoom("/groups"), "list");
  assert.equal(S.houseGroupsRoom("/groups/"), "list");
  assert.equal(S.houseGroupsRoom("/group/abc"), "group");
  assert.equal(S.houseGroupsRoom("/group/abc/x"), null);
  assert.equal(S.houseGroupsRoom("/Home"), null);
  assert.equal(M.groupsRoomOf("/group/a"), S.houseGroupsRoom("/group/a"));
  assert.equal(M.groupIdOf("/group/a%20b"), "a b");
  assert.equal(S.houseRebuiltRoom("/groups"), true);
  assert.equal(S.houseRebuiltRoom("/group/x"), true);
});

test("every old ?tab= lands; Info and the own layout are views", () => {
  assert.equal(M.groupPageOf(""), "profile");
  for (const t of ["profile", "board", "journal", "notes", "fronting"]) assert.equal(M.groupPageOf(`?tab=${t}`), t);
  assert.equal(M.groupPageOf("?tab=my-own-page"), "layout", "a page they added opens their layout");
  assert.equal(M.groupPageOf("?view=info"), "info");
  assert.equal(M.groupPageOf("?view=manage"), "manage");
  assert.equal(M.groupHref("g1"), "/group/g1");
  assert.equal(M.groupHref("g1", "board"), "/group/g1?tab=board");
  assert.equal(M.groupHref("g1", "info"), "/group/g1?view=info");
  assert.equal(M.findGroup([{ id: "x", sp_id: "sp1" }], "sp1").id, "x", "an imported sp_id finds it");
});

test("the tree: the groups' order, nested under their parent, a loop never buries anyone", () => {
  const rows = M.treeRows(G);
  const ids = rows.map((r) => r.g.id);
  for (const g of G) assert.ok(ids.includes(g.id), `${g.id} is shown`);
  assert.ok(ids.indexOf("inner") < ids.indexOf("garden") && ids.indexOf("garden") < ids.indexOf("green"));
  assert.equal(rows.find((r) => r.g.id === "green").depth, 2);
  assert.equal(rows.find((r) => r.g.id === "inner").hasKids, true);
  const folded = M.treeRows(G, { folded: new Set(["inner"]) }).map((r) => r.g.id);
  assert.ok(!folded.includes("garden") && !folded.includes("green") && folded.includes("inner"));
  const found = M.treeRows(G, { query: "green" });
  assert.equal(found.length, 1);
  assert.equal(found[0].path, "Inner world / The Garden", "a search result names where it is");
});

test("moving: never into itself; a drop must change something", () => {
  const t = M.moveTargets(G, ["garden"]).map((o) => o.id);
  assert.equal(t[0], "", "the top level first");
  assert.ok(!t.includes("garden") && !t.includes("green"), "not into itself or its own nested group");
  assert.ok(t.includes("prot"));
  assert.equal(M.canDrop(G, "garden", "green"), false);
  assert.equal(M.canDrop(G, "garden", "inner"), false, "already there");
  assert.equal(M.canDrop(G, "garden", "prot"), true);
  assert.equal(M.canDrop(G, "prot", ""), false, "already at the top");
  assert.equal(M.canDrop(G, "green", ""), true);
});

test("the words, in the person's terms", () => {
  assert.equal(M.subTermOf(terms), "subcrew");
  assert.equal(M.subTermOf({}), "subsystem");
  const line = M.headerLine(G[1], { owner: A[0], parent: G[0], terms });
  assert.equal(line, "Subcrew · root: Juniper · inside Inner world");
  assert.equal(M.headerLine(G[4], { memberCount: 1, terms }), "1 part");
  assert.equal(M.countWords(2, terms), "2 parts");
  assert.equal(M.visibleMembers({ ...G[1], hide_archived_members: true }, A).map((a) => a.id).join(), "pip", "the root and hidden archived ones aren't members");
  assert.equal(M.memberCount(G[1], A), 2);
  assert.equal(M.latestPost([{ group_id: "garden", created_date: "2026-01-01", id: "a" }, { group_id: "garden", created_date: "2026-02-01", id: "b" }, { group_id: "x", created_date: "2027-01-01" }], G[1]).id, "b");
});

test("drawn only by the house: gated old pages, both frames, edge to edge, its tools", () => {
  const app = read("src/App.jsx");
  assert.match(app, /path="\/groups" element=\{<HouseRoomGate><GroupsManager \/><\/HouseRoomGate>\}/);
  assert.match(app, /path="\/group\/:id" element=\{<HouseRoomGate><GroupProfile \/><\/HouseRoomGate>\}/);
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) assert.ok(read(f).includes("<HouseGroups "), `${f} draws the room`);
  const phone = read("src/house/phone/HousePhoneFrame.jsx");
  assert.ok(/\|\| groupsRoom( \|\| \w+Room)* \? "px-0"/.test(phone), "the phone runs it edge to edge");
  assert.ok(/roomTools = [^;]*groupsRoom/.test(phone), "the phone frame reads the room's tools");
  assert.ok(/ownDocks[^;]*groupsRoom/.test(read("src/house/frame/HouseFrame.jsx")), "the room draws its own panels");
});

test("nothing the old pages did is lost", () => {
  const r = read("src/house/groups/HouseGroups.jsx");
  assert.ok(r.includes("<GroupsManager embedded"), "Manage is the old manager");
  assert.ok(r.includes("<GroupProfile"), "Info and the own layout are the old group page");
  for (const s of ["GroupBoardSection", "GroupJournalSection", "GroupFrontingWidget", "GroupMembersModal", "CreateGroupModal", "ProfileSongPlayer", "useRegisterLookSubject"]) assert.ok(r.includes(s), s);
  for (const a of ["rename", "move", "colour", "delete", "members", "nest", "manage", "layout"]) assert.ok(new RegExp(`id: "${a}"`).test(r), `the ⋯ menu has ${a}`);
});

test("the room writes only through the write paths", () => {
  const dir = "src/house/groups";
  for (const f of readdirSync(new URL(`../${dir}`, import.meta.url)).filter((x) => /\.jsx?$/.test(x))) {
    const text = read(`${dir}/${f}`).replace(/\/\/.*$/gm, "");
    assert.ok(!/entities\.\w+\.(create|update|delete|bulkDelete)\(/.test(text), `${f} writes no record by hand`);
  }
  const lib = read("src/lib/groupEntry.js");
  assert.ok(lib.includes("withTrashBatch") && lib.includes("deleteGroupCascade") && lib.includes("wouldNest"));
  const mgr = read("src/pages/GroupsManager.jsx");
  assert.ok(mgr.includes('from "@/lib/groupEntry"'), "the old manager shares the writer");
  assert.ok(!/Group\.update\(/.test(mgr.replace(/\/\/.*$/gm, "")), "the old manager writes nothing by hand");
});

test("its classes are its own, with thin edges", () => {
  const css = read("src/house/groups/groups.css");
  const sels = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/\.[a-z][\w-]*/g) || [];
  for (const c of sels) assert.ok(/^\.(hgr|hk|hal-av)/.test(c), `${c} is the room's own or the kit's`);
  assert.ok(!css.split("\n").some((l) => /\b2px solid\b/.test(l) && !/focus-visible/.test(l)), "no 2px outlines (a focus ring may be 2px)");
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`ok   ${t.name}`); } catch (e) { failed++; console.log(`FAIL ${t.name}\n     ${e.message}`); }
}
console.log(failed ? `\n${failed} of ${tests.length} failed` : `\nAll ${tests.length} passed`);
process.exit(failed ? 1 : 0);

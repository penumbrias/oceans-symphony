#!/usr/bin/env node
// Who a friend sees in the front status (src/lib/friendFronters.js): one
// rule for every push — archived, "Show when fronting" off and
// hide-from-friends groups are never shared; legacy grouped rows still count.
//
//   node scripts/test-friend-fronters.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

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
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { buildFriendFronters, collectFronting, frontShareBlock, friendFrontersFor } = await import("../src/lib/friendFronters.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };

const alters = [
  { id: "a", name: "Ash" },                          // never set: shared (older profiles)
  { id: "b", name: "Bea", friends_visible: true },
  { id: "c", name: "Cy", friends_visible: false },    // new-profile default
  { id: "d", name: "Dee", is_archived: true },
  { id: "e", name: "Eli", friends_visible: true },    // in a hidden group
];
const groups = [{ id: "g", name: "Private", hide_from_friends: true, member_sp_ids: ["e"] }];
const sessions = (ids) => ids.map((id, i) => ({ id: `s${i}`, alter_id: id, is_active: true, is_primary: i === 0 }));

test("archived and hidden-group fronters never leave the device", () => {
  const out = buildFriendFronters({ activeSessions: sessions(["a", "b", "c", "d", "e"]), alters, groups });
  assert.deepEqual(out.map((f) => f.id), ["a", "b", "c"]);
  assert.equal(out[0].isPrimary, true);
  assert.equal(out[1].isCofronter, true);
});

test("friends without levels: the Show when fronting switch decides", () => {
  const all = buildFriendFronters({ activeSessions: sessions(["a", "b", "c"]), alters, groups });
  const out = friendFrontersFor(all, undefined);
  assert.deepEqual(out.map((f) => f.name), ["Ash", "Bea"]);
  assert.ok(out.every((f) => !("id" in f) && !("levelIds" in f) && !("friendsVisible" in f)), "local keys stripped");
  assert.deepEqual(friendFrontersFor(all, { hiddenAlterIds: ["a"] }).map((f) => f.name), ["Bea"]);
});

test("friends given levels see exactly those levels, with only their fields", () => {
  const lv = [
    { id: "L0", number: 0, name: "Close", fields: { name: true, color: true, pronouns: true } },
    { id: "L1", number: 1, name: "Anon", fields: { name: false, color: false } },
  ];
  const withLevels = alters.map((a) => (a.id === "c" ? { ...a, privacy_levels: ["L0"] } : a.id === "a" ? { ...a, privacy_levels: ["L1"] } : a));
  const all = buildFriendFronters({ activeSessions: sessions(["a", "b", "c"]), alters: withLevels, groups });
  // Cy has the switch off (imported) but is in a granted level → shown. Bea is in no level → not shown.
  assert.deepEqual(friendFrontersFor(all, { allowedLevelIds: ["L0"] }, lv).map((f) => f.name), ["Cy"]);
  const anon = friendFrontersFor(all, { allowedLevelIds: ["L1"] }, lv);
  assert.equal(anon.length, 1);
  assert.equal(anon[0].name, "?");
  assert.equal(anon[0].color, null);
  assert.equal("pronouns" in anon[0], false);
  assert.deepEqual(friendFrontersFor(all, { allowedLevelIds: ["L0"], hiddenAlterIds: ["c"] }, lv), [], "per-friend hide still wins");
  assert.deepEqual(friendFrontersFor(all, { shownAlterIds: ["b"] }, lv).map((f) => f.name), ["Bea"], "a reveal counts as levels");
});

test("why someone is held back", () => {
  const hidden = new Set(["e"]);
  assert.equal(frontShareBlock(alters[0], hidden), null);
  assert.equal(frontShareBlock(alters[2], hidden), "off");
  assert.equal(frontShareBlock(alters[3], hidden), "archived");
  assert.equal(frontShareBlock(alters[4], hidden), "group");
});

test("a hidden primary never leaks, and no one else is promoted to primary in its place", () => {
  const out = friendFrontersFor(buildFriendFronters({ activeSessions: sessions(["c", "b"]), alters, groups }));
  assert.deepEqual(out.map((f) => f.name), ["Bea"]);
  assert.equal(out[0].isPrimary, false);
});

test("legacy grouped rows count, without duplicates", () => {
  const legacy = [{ id: "L", is_active: true, primary_alter_id: "a", co_fronter_ids: ["b", "a"] }];
  assert.deepEqual(collectFronting(legacy).map((c) => c.alterId), ["a", "b"]);
  assert.deepEqual(friendFrontersFor(buildFriendFronters({ activeSessions: legacy, alters, groups })).map((f) => f.name), ["Ash", "Bea"]);
});

test("no one fronting sends an empty list", () => {
  assert.deepEqual(buildFriendFronters({ activeSessions: [], alters, groups }), []);
});

console.log(`\n${passed} passed`);

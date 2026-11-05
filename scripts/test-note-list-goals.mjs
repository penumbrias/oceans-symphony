#!/usr/bin/env node
// Checks the goal points that read notes, lists and flash-card decks
// (src/lib/noteListModel.js) and the XP they earn (src/lib/goalXp.js).
//
//   node scripts/test-note-list-goals.mjs

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
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

const { combineLists, itemsForList, listProgress, deckCardCount, deckStudyMinutes, isDeck, isItemList, isNote } =
  await import("../src/lib/noteListModel.js");
const { goalXpEvents } = await import("../src/lib/goalXp.js");

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };

const now = new Date(2026, 10, 3, 20, 0); // Tuesday
const added = new Date(2026, 10, 1, 9, 0).toISOString();

test("both stores make one catalogue, trashed lists left out", () => {
  const all = combineLists(
    [{ id: "a", name: "Shop" }, { id: "t", name: "Gone", trashed_at: "x" }],
    [{ id: "u", name: "Locked", list_type: "flashcards" }],
  );
  assert.deepEqual(all.map((l) => [l.id, l.source]), [["a", "idb"], ["u", "local"]]);
  assert.ok(isDeck(all[1]) && isItemList(all[0]));
});

test("notes and lists are one thing: every page but a deck has writing and items", () => {
  for (const t of ["note", "shopping", "wishlist", "checklist", undefined]) {
    assert.ok(isItemList({ list_type: t }) && isNote({ list_type: t }), String(t));
  }
  assert.ok(!isItemList({ list_type: "flashcards" }) && !isNote({ list_type: "flashcards" }));
  assert.ok(!isItemList(null));
});

test("items come from whichever store holds the list", () => {
  const src = { idbItems: [{ id: 1, list_id: "a" }], unlockedItems: [{ id: 2, list_id: "u" }] };
  assert.equal(itemsForList("a", src).length, 1);
  assert.equal(itemsForList("u", src)[0].id, 2);
  assert.equal(itemsForList(null, src).length, 0);
});

test("a list is finished only when it has items and all are ticked", () => {
  assert.equal(listProgress([]).finished, false);
  assert.equal(listProgress([{ checked: true }, { checked: false }]).finished, false);
  assert.deepEqual(listProgress([{ checked: true }, { checked: true }]), { done: 2, total: 2, finished: true });
});

test("new cards count from when the point was added; total counts the deck", () => {
  const cards = [{ created_date: "2026-10-01T10:00:00Z" }, { created_date: "2026-11-02T10:00:00Z" }];
  assert.equal(deckCardCount(cards, { from: new Date(added) }), 1);
  assert.equal(deckCardCount(cards), 2);
});

const study = (day, mins, deck = "d") => ({
  study_list_id: deck, status: "logged", duration_minutes: mins, timestamp: new Date(2026, 10, day, 10, 0).toISOString(),
});

test("study minutes: this week (Monday start) or since the point was added", () => {
  const acts = [study(1, 15), study(2, 20), study(3, 5), study(3, 50, "other")];
  assert.equal(deckStudyMinutes({ ref_list_id: "d", count_period: "week" }, acts, now), 25);
  assert.equal(deckStudyMinutes({ ref_list_id: "d", count_period: "total", created_date: added }, acts, now), 40);
});

test("XP: ticked list items, cards up to the target, study sessions until the minutes are reached", () => {
  const goals = [{ id: "g" }];
  const steps = [
    { id: "s1", goal_id: "g", kind: "list_done", ref_list_id: "l", created_date: added },
    { id: "s2", goal_id: "g", kind: "deck_cards", ref_list_id: "d", target_count: 1, created_date: added },
    { id: "s3", goal_id: "g", kind: "deck_study", ref_list_id: "d", target_minutes: 30, count_period: "total", created_date: added },
  ];
  const noteItems = [
    { list_id: "l", checked: true, purchased_at: new Date(2026, 10, 2, 9).toISOString() },
    { list_id: "l", checked: true, purchased_at: "2026-10-01T09:00:00Z" },
    { list_id: "d", created_date: new Date(2026, 10, 2, 9).toISOString() },
    { list_id: "d", created_date: new Date(2026, 10, 3, 9).toISOString() },
  ];
  const activities = [study(1, 15), study(2, 20), study(3, 5)];
  const ev = goalXpEvents({ goals, steps, noteItems, activities, now });
  const by = (id) => ev.filter((e) => e.stepId === id).length;
  assert.equal(by("s1"), 1);
  assert.equal(by("s2"), 1);
  assert.equal(by("s3"), 2);
});

console.log(`\n${passed} passed`);

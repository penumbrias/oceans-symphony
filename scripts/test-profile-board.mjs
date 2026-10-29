#!/usr/bin/env node
// Checks profile boards (src/lib/profileBoard.js, v0.289.0): a record with
// no saved layout seeds the same board every time, one page per tab with
// today's sections in today's order; duplicate rows from two devices fold
// into one board without losing a page; and the sync merge treats a
// ProfileBoard row's board page by page, like the home boards.
//
//   node scripts/test-profile-board.mjs

import assert from "node:assert/strict";
import {
  seedProfileBoard, pickProfileBoardRows, profilePageId, tabOfPageId, layoutForCopy, DEFAULT_OWNER_ID, isDefaultOwnerId,
  ALTER_PROFILE_PAGES, PROFILE_PAGES, PROFILE_OWNER_TYPES, GARDEN_ALTER_PROFILE_PAGES,
  NEW_ALTER_PROFILE_PAGES, NEW_PROFILE_TAB_ALIASES, NEW_LAYOUT_SUFFIX, usesNewProfile, layoutSuffixFor, layoutOwnerIds,
  NEW_GROUP_PROFILE_PAGES, GROUP_PROFILE_PAGES, hasNewProfile,
} from "../src/lib/profileBoard.js";
import { planFromBlocks, picturesOfParts, entryNamesFor, widgetsForParts, convertBoard } from "../src/lib/profileConvert.js";
import { mergeForEntity, BOARD_FIELDS, stampCreate, stampUpdate } from "../src/lib/syncMerge.js";
import { stampBoardChanges } from "../src/lib/boardStamp.js";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const T = (n) => new Date(Date.UTC(2026, 9, 27, 12, 0, n)).toISOString();

test("the alter seed has one page per tab, in today's order, with the tab in the page id", () => {
  const b = seedProfileBoard({ id: "a1", name: "Ash" }, "alter");
  assert.equal(b.pages.length, 13);
  assert.deepEqual(b.pages.map((p) => tabOfPageId(p.id)), ALTER_PROFILE_PAGES.map((p) => p.tab));
  assert.equal(b.defaultPageId, profilePageId("profile"));
  assert.equal(tabOfPageId("tab:private-messages"), "private-messages");
  assert.equal(tabOfPageId("p1"), null);
  assert.equal(b._seeded, true);
});

test("a garden alter seeds the info-widget Profile page, set up, with the classic other pages", () => {
  const b = seedProfileBoard({ id: "a1", name: "Ash", profile_layout: "garden" }, "alter");
  assert.equal(b.pages.length, GARDEN_ALTER_PROFILE_PAGES.length);
  const first = b.pages[0].widgets;
  assert.deepEqual(first.slice(0, 3).map((w) => w.widgetId), ["profile_header", "media", "info"]);
  assert.deepEqual(first[1].settings, { source: "pictures", autoFit: false });
  assert.equal(first[1].span.rows, 3);
  assert.deepEqual(first[2].settings.entries, ["bio"]);
  assert.ok(!first.some((w) => w.widgetId === "profile_bio"));
  // positions stack by each widget's own height
  assert.equal(first[2].pos.y, first[1].pos.y + 3);
  assert.deepEqual(b.pages.slice(1).map((p) => p.id), seedProfileBoard({ id: "a1" }, "alter").pages.slice(1).map((p) => p.id));
  // settings are copies, never the shared constant
  first[1].settings.source = "items";
  assert.equal(seedProfileBoard({ id: "a1", profile_layout: "garden" }, "alter").pages[0].widgets[1].settings.source, "pictures");
});

test("the seed is the same board every time, on every device", () => {
  const a = seedProfileBoard({ id: "a1" }, "alter");
  const b = seedProfileBoard({ id: "a1" }, "alter");
  assert.deepEqual(a, b);
});

test("every seeded widget has a unique instance id, a position and settings", () => {
  for (const type of PROFILE_OWNER_TYPES) {
    const b = seedProfileBoard({ id: "x" }, type);
    assert.equal(b.pages.length, PROFILE_PAGES[type].length, type);
    const ids = new Set();
    for (const p of b.pages) {
      let y = 0;
      for (const w of p.widgets) {
        assert.ok(!ids.has(w.instanceId), `${type}: duplicate ${w.instanceId}`);
        ids.add(w.instanceId);
        assert.deepEqual(w.pos, { x: 0, y });
        y += w.span.rows;
        assert.deepEqual(w.settings, {});
      }
    }
  }
});

test("the profile page shows the same sections the page shows today, top to bottom", () => {
  const b = seedProfileBoard({ id: "a1" }, "alter");
  assert.deepEqual(b.pages[0].widgets.map((w) => w.widgetId), [
    "profile_header", "profile_preferences", "profile_bio", "profile_groups",
    "profile_subsystems", "profile_answers", "profile_tags", "profile_fields",
  ]);
});

test("no rows: nothing picked, no board", () => {
  assert.deepEqual(pickProfileBoardRows([]), { keeper: null, extras: [], board: null });
  assert.deepEqual(pickProfileBoardRows(null), { keeper: null, extras: [], board: null });
});

test("one row: it is the keeper and its board is the board", () => {
  const row = { id: "r1", updated_date: T(1), board: { pages: [{ id: "tab:profile", widgets: [] }] } };
  const out = pickProfileBoardRows([row]);
  assert.equal(out.keeper, row);
  assert.deepEqual(out.extras, []);
  assert.equal(out.board, row.board);
});

test("two rows from two devices' first edits: newest keeps, the other's pages fold in", () => {
  const phone = { id: "p", updated_date: T(5), board: { pages: [
    { id: "tab:profile", _ut: T(5), widgets: [{ instanceId: "w1", widgetId: "profile_header" }] },
    { id: "tab:notes", _ut: T(5), widgets: [] },
  ] } };
  const desk = { id: "d", updated_date: T(3), board: { pages: [
    { id: "tab:profile", _ut: T(3), widgets: [{ instanceId: "w1", widgetId: "profile_header" }, { instanceId: "w2", widgetId: "profile_bio" }] },
    { id: "p_private", _ut: T(3), label: "Mine", widgets: [] },
  ] } };
  const out = pickProfileBoardRows([desk, phone]);
  assert.equal(out.keeper.id, "p");
  assert.deepEqual(out.extras.map((r) => r.id), ["d"]);
  const ids = out.board.pages.map((p) => p.id);
  assert.deepEqual(ids, ["tab:profile", "tab:notes", "p_private"]);
  // The newer page wins where both have it.
  assert.equal(out.board.pages[0].widgets.length, 1);
});

test("trashed rows are never picked", () => {
  const live = { id: "l", updated_date: T(1), board: { pages: [{ id: "tab:profile", widgets: [] }] } };
  const gone = { id: "g", updated_date: T(9), trashed_at: T(9), board: { pages: [{ id: "tab:x", widgets: [] }] } };
  assert.equal(pickProfileBoardRows([gone, live]).keeper.id, "l");
});

test("sync merges a ProfileBoard row's board page by page", () => {
  assert.deepEqual(BOARD_FIELDS.ProfileBoard, ["board"]);
  const base = { id: "r", owner_type: "alter", owner_id: "a1", created_date: T(0), updated_date: T(0), _ft: stampCreate(T(0)),
    board: { pages: [{ id: "tab:profile", _ut: T(0), widgets: [] }, { id: "tab:notes", _ut: T(0), widgets: [] }] } };
  // Phone arranges the profile page; desk renames the notes page.
  const phoneBoard = stampBoardChanges(base.board, { ...base.board, pages: [
    { id: "tab:profile", widgets: [{ instanceId: "w1", widgetId: "profile_header", pos: { x: 0, y: 0 }, span: { cols: 6, rows: 2 } }] },
    { id: "tab:notes", widgets: [] },
  ] }, T(4));
  const phone = { ...base, updated_date: T(4), _ft: stampUpdate(base, { board: phoneBoard }, T(4)), board: phoneBoard };
  const deskBoard = stampBoardChanges(base.board, { ...base.board, pages: [
    { id: "tab:profile", widgets: [] },
    { id: "tab:notes", label: "Scraps", widgets: [] },
  ] }, T(6));
  const desk = { ...base, updated_date: T(6), _ft: stampUpdate(base, { board: deskBoard }, T(6)), board: deskBoard };
  for (const [a, b] of [[phone, desk], [desk, phone]]) {
    const m = mergeForEntity("ProfileBoard", a, b);
    const profile = m.board.pages.find((p) => p.id === "tab:profile");
    const notes = m.board.pages.find((p) => p.id === "tab:notes");
    assert.equal(profile.widgets.length, 1, "the phone's arrangement survives");
    assert.equal(notes.label, "Scraps", "the desk's rename survives");
  }
});

test("a person's first edit drops the seeded marker when stamped", () => {
  const seed = seedProfileBoard({ id: "a1" }, "alter");
  const edited = { ...seed, pages: seed.pages.map((p, i) => (i === 0 ? { ...p, widgets: p.widgets.slice(1) } : p)) };
  delete edited._seeded;
  const stamped = stampBoardChanges(null, edited, T(1));
  assert.equal(stamped._seeded, undefined);
  assert.equal(stamped.pages[0]._ut, T(1));
});

test("layoutForCopy keeps the pages and the look, drops the bookkeeping", () => {
  const seed = seedProfileBoard({ id: "a1" }, "alter");
  const src = { ...seed, _lt: "2026-01-01T00:00:00.000Z", _removedPages: ["tab:notes"], _heals: ["x"],
    pages: seed.pages.map((p, i) => ({ ...p, _ut: "2026-01-01T00:00:00.000Z", ...(i === 0 ? { label: "Me" } : {}) })) };
  const copy = layoutForCopy(src);
  assert.equal(copy._seeded, undefined);
  assert.equal(copy._lt, undefined);
  assert.equal(copy._removedPages, undefined);
  assert.equal(copy._heals, undefined);
  assert.equal(copy.pages.length, seed.pages.length);
  assert.equal(copy.pages[0].label, "Me");
  assert.equal(copy.pages[0]._ut, undefined);
  assert.deepEqual(copy.pages[0].widgets, seed.pages[0].widgets);
  assert.equal(copy.grid.rowPx, seed.grid.rowPx);
  assert.equal(layoutForCopy(null), null);
  assert.equal(layoutForCopy("x"), null);
  assert.deepEqual(layoutForCopy({ a: 1 }).pages, []);
});

test("the default layout owner id is reserved", () => {
  assert.equal(isDefaultOwnerId(DEFAULT_OWNER_ID), true);
  assert.equal(isDefaultOwnerId("a1"), false);
});

const BLOCKS = [
  { type: "divider" },
  { type: "text", content: "<p>Hello</p>" },
  { type: "img-left", src: "local-image://a", alt: "me", text: "<p>Beside</p>" },
  { type: "text", content: "<p>  </p>" },
  { type: "gallery", images: [{ src: "https://x/1.png" }, { src: "local-image://a" }] },
  { type: "divider" },
  { type: "raw", content: "<b>Raw</b>" },
  { type: "img-solo", src: "" },
];

test("conversion plans every block as a part, in order, dropping only empties", () => {
  const parts = planFromBlocks(BLOCKS);
  assert.deepEqual(parts.map((p) => p.kind), ["text", "side", "media", "divider", "text"]);
  assert.equal(parts[1].imageFirst, true);
  assert.equal(parts[2].arrange, "grid");
  assert.deepEqual(picturesOfParts(parts), ["local-image://a", "https://x/1.png"]);
  assert.deepEqual(entryNamesFor(2, ["Bio 2"]), ["Bio 3", "Bio 4"]);
});

test("converted widgets stack below each other, side-by-side parts share a row", () => {
  const parts = planFromBlocks(BLOCKS);
  const { widgets, height } = widgetsForParts(parts, ["bio", "own:Bio 2", "own:Bio 3"]);
  assert.deepEqual(widgets.map((w) => w.widgetId), ["info", "media", "info", "media", "divider", "info"]);
  assert.deepEqual(widgets.map((w) => w.pos.y), [0, 2, 2, 5, 8, 9]);
  assert.deepEqual(widgets[2].settings.entries, ["own:Bio 2"]);
  assert.deepEqual(widgets[5].settings.entries, ["own:Bio 3"]);
  assert.equal(height, 11);
  assert.equal(new Set(widgets.map((w) => w.instanceId)).size, widgets.length);
});

test("a converted board replaces the bio widget in place and moves what's below down", () => {
  const base = seedProfileBoard({ id: "a1" }, "alter");
  const { widgets } = widgetsForParts(planFromBlocks(BLOCKS), ["bio", "own:Bio 2", "own:Bio 3"]);
  const out = convertBoard(base, { id: "a1" }, widgets);
  const page = out.pages[0].widgets;
  assert.ok(!page.some((w) => w.widgetId === "profile_bio"));
  const bioAt = base.pages[0].widgets.find((w) => w.widgetId === "profile_bio").pos.y;
  const tags = page.find((w) => w.widgetId === "profile_tags");
  const tagsBefore = base.pages[0].widgets.find((w) => w.widgetId === "profile_tags");
  assert.equal(tags.pos.y, tagsBefore.pos.y + 11 - 2);
  assert.equal(page.filter((w) => w.pos.y >= bioAt && w.pos.y < bioAt + 11 && ["info", "media", "divider"].includes(w.widgetId)).length, 6);
  // the base is never changed
  assert.ok(base.pages[0].widgets.some((w) => w.widgetId === "profile_bio"));
  assert.equal(out._seeded, undefined);
  assert.equal(new Set(page.map((w) => w.instanceId)).size, page.length);
});

test("with no saved layout the conversion starts from the garden page, without a second Pictures widget", () => {
  const { widgets } = widgetsForParts(planFromBlocks(BLOCKS), ["bio"]);
  const out = convertBoard(null, { id: "a1" }, widgets);
  const page = out.pages[0].widgets;
  assert.ok(!page.some((w) => w.widgetId === "media" && w.settings.source === "pictures"));
  assert.equal(page[0].widgetId, "profile_header");
  const textOnly = convertBoard(null, { id: "a1" }, widgetsForParts([{ kind: "text", html: "x" }], ["bio"]).widgets);
  assert.ok(textOnly.pages[0].widgets.some((w) => w.widgetId === "media" && w.settings.source === "pictures"));
});

test("the new profile (v0.305.0) seeds seven pages, with its own layout row id", () => {
  const rec = { id: "a1", profile_layout: "v2" };
  assert.ok(usesNewProfile(rec));
  assert.ok(!usesNewProfile({ id: "a1", profile_layout: "garden" }));
  const b = seedProfileBoard(rec, "alter");
  assert.deepEqual(b.pages.map((p) => tabOfPageId(p.id)), ["profile", "fronting", "messages", "notes", "journal", "wishes", "connections"]);
  assert.equal(b.pages.length, NEW_ALTER_PROFILE_PAGES.length);
  const notes = b.pages.find((p) => p.id === profilePageId("notes")).widgets[0];
  assert.equal(notes.mode, "expanded");
  assert.equal(notes.settings.count, 20);
  assert.equal(layoutSuffixFor(rec), NEW_LAYOUT_SUFFIX);
  assert.equal(layoutSuffixFor({ id: "a1" }), "");
  assert.equal(layoutSuffixFor(rec, "contact"), "");
  assert.deepEqual(layoutOwnerIds("a1"), ["a1", "a1::v2"]);
  // Classic and garden seeds are unchanged.
  assert.equal(seedProfileBoard({ id: "a1" }, "alter").pages.length, ALTER_PROFILE_PAGES.length);
  assert.equal(seedProfileBoard({ id: "a1", profile_layout: "garden" }, "alter").pages[0].widgets[1].widgetId, "media");
});

test("every old tab name lands on a page of the new profile", () => {
  const tabs = new Set(NEW_ALTER_PROFILE_PAGES.map((p) => p.tab));
  for (const p of ALTER_PROFILE_PAGES) {
    assert.ok(tabs.has(p.tab) || tabs.has(NEW_PROFILE_TAB_ALIASES[p.tab]), `no page for ?tab=${p.tab}`);
  }
});

test("new group profile: own pages, own row, every old tab still a page", () => {
  const rec = { id: "g1", profile_layout: "v2" };
  const b = seedProfileBoard(rec, "group");
  assert.deepEqual(b.pages.map((p) => p.id), NEW_GROUP_PROFILE_PAGES.map((p) => profilePageId(p.tab)));
  assert.equal(layoutSuffixFor(rec, "group"), NEW_LAYOUT_SUFFIX);
  assert.equal(layoutSuffixFor({ id: "g2" }, "group"), "");
  assert.equal(seedProfileBoard({ id: "g2" }, "group").pages.length, GROUP_PROFILE_PAGES.length);
  const tabs = new Set(NEW_GROUP_PROFILE_PAGES.map((p) => p.tab));
  for (const p of GROUP_PROFILE_PAGES) assert.ok(tabs.has(p.tab), `no page for ?tab=${p.tab}`);
  assert.equal(hasNewProfile("group"), true);
  assert.equal(hasNewProfile("contact"), false);
  assert.equal(layoutSuffixFor({ profile_layout: "v2" }, "contact"), "", "no new contact profile yet");
});

console.log(`\n${passed} checks passed`);

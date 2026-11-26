#!/usr/bin/env node
// The house's Notebook room (boards 19-Notebook, 20-NotebookPage and
// 18-NotebookPhone): what the room shows for an address, the ranges and the
// chart's columns, the balances (time, words, ticks, study and its run),
// the ledger (what moved each page, filtered by who, exported as CSV), who
// did it (written through activityWho.js, nothing else), weekly targets,
// coming due and repeats. Also: the room is drawn only on /goals, the old
// page is gated, both frames mount it, the phone runs it edge to edge, it
// writes only through the write paths, the deep links survive, and its
// classes don't clash with the kit's. Storage is the in-memory preview
// database; nothing real is written.
//
//   node scripts/test-house-notebook.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities({ stubs: {
  // The preview database keeps no history; watch the restore-point door instead.
  "@/lib/editRestorePoint": "export function keepEditRestorePoint(entity, rec) { (globalThis.__kept ||= []).push({ entity, snapshot: JSON.parse(JSON.stringify(rec)) }); }",
} });
const M = await import("../src/house/notebook/notebookModel.js");
const S = await import("../src/lib/houseSwitch.js");
const W = await import("../src/lib/activityWho.js");
const { indexPages } = await import("../src/lib/goalTree.js");

const { test, run } = runner();
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// A fixed Wednesday noon, so "this week" is Monday to now.
const NOW = new Date(2026, 10, 25, 12, 0, 0);
const at = (daysAgo, hour = 10) => { const d = new Date(NOW); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const goals = [
  { id: "novel", title: "The novel", status: "active" },
  { id: "ch1", title: "Chapter 1", parent_id: "novel" },
  { id: "garden", title: "Garden", status: "active" },
  { id: "gone", title: "Old", status: "done" },
];
const index = indexPages(goals);
const acts = [
  { id: "a1", timestamp: at(0), goal_id: "ch1", activity_name: "Wrote", duration_minutes: 30, words_written: 600, status: "done", fronting_alter_ids: ["river"] },
  { id: "a2", timestamp: at(1), goal_id: "garden", activity_name: "Weeding", duration_minutes: 45, status: "logged", alter_id: "ash" },
  { id: "a3", timestamp: at(9), goal_id: "novel", activity_name: "Plotting", duration_minutes: 20, status: "logged" },
  { id: "a4", timestamp: at(0, 8), study_list_id: "deck1", activity_name: "Study", duration_minutes: 10, status: "done" },
  { id: "a5", timestamp: at(1, 8), study_list_id: "deck1", activity_name: "Study", duration_minutes: 5, status: "done" },
  { id: "a6", timestamp: at(0), goal_id: "garden", activity_name: "Plan", duration_minutes: 60, status: "scheduled" },
  { id: "a7", timestamp: at(0), goal_id: "garden", activity_name: "Binned", duration_minutes: 99, status: "done", trashed_at: at(0) },
  { id: "a8", timestamp: at(0), activity_name: "Not a page", duration_minutes: 15, status: "done" },
];

test("the room's address: overview, a page, its own layout, the boards", () => {
  assert.deepEqual(M.notebookView(""), { kind: "overview" });
  assert.deepEqual(M.notebookView("?page=ch1"), { kind: "page", pageId: "ch1", layout: false });
  assert.deepEqual(M.notebookView("?highlight=ch1"), { kind: "page", pageId: "ch1", layout: false }, "a highlight opens the page");
  assert.deepEqual(M.notebookView("?page=ch1&view=layout"), { kind: "page", pageId: "ch1", layout: true });
  assert.deepEqual(M.notebookView("?notes=1"), { kind: "notes" });
  assert.deepEqual(M.notebookView("?view=board"), { kind: "board" });
  assert.equal(M.notebookRoomOf("/goals"), "notebook");
  assert.equal(M.notebookRoomOf("/goals/"), "notebook");
  assert.equal(M.notebookRoomOf("/goal"), null);
});

test("ranges and the chart's columns", () => {
  assert.deepEqual(M.RANGES.map((r) => r.id), ["week", "1m", "6m", "1y", "all"]);
  assert.ok(M.isRange("6m") && !M.isRange("2y"));
  const wk = M.chartBuckets("week", M.rangeStart("week", NOW), NOW);
  assert.equal(wk.unit, "day"); assert.equal(wk.buckets.length, 7);
  assert.equal(M.chartBuckets("1m", M.rangeStart("1m", NOW), NOW).unit, "week");
  assert.equal(M.chartBuckets("1y", M.rangeStart("1y", NOW), NOW).unit, "month");
  const ten = M.chartBuckets("all", new Date(2016, 0, 1), NOW);
  assert.ok(ten.buckets.length <= 24, "All time never draws more than 24 columns");
  assert.equal(ten.unit, "span");
  const first = M.rangeStart("all", NOW, [{ timestamp: new Date(2020, 2, 4).toISOString(), goal_id: "novel", status: "logged" }]);
  assert.equal(first.getFullYear(), 2020, "All time starts at the first thing that moved a page");
});

test("balances: time and words on pages, study and its run, only what happened", () => {
  const n = M.notebookNumbers({ activities: acts, index, range: "week", now: NOW });
  assert.equal(n.minutes, 75, "a plan, a trashed row and an activity on no page don't count");
  assert.equal(n.words, 600);
  assert.equal(n.study, 15); assert.equal(n.studySessions, 2);
  assert.equal(n.run, 2, "studied today and yesterday");
  assert.equal(n.prevMinutes, 20, "last week, for the vs line");
  assert.ok(n.byPage.has("novel") && !n.byPage.has("ch1"), "a section's time stacks on its top page");
  const s = M.chartSeries(n.byPage, n.buckets.length);
  assert.deepEqual(s.series.map((x) => x.id).sort(), ["garden", "novel"]);
  const items = { l1: [{ checked: true, purchased_at: at(0) }, { checked: true, purchased_at: at(20) }, { checked: false }] };
  const t = M.notebookNumbers({ activities: [], index, lists: [{ id: "l1", name: "Shop" }], itemsOf: (id) => items[id], range: "week", now: NOW });
  assert.equal(t.ticked, 1, "only ticks inside the range");
  assert.equal(M.studyRun([], NOW), 0);
});

test("the ledger: newest first, a page with its sections, by who, as CSV", () => {
  const whoIds = (a) => W.activityWhoIds(a);
  const all = M.ledgerRows({ activities: acts, index, deckIds: new Set(["deck1"]), whoIds });
  assert.deepEqual(all.map((r) => r.a.id), ["a1", "a4", "a2", "a5", "a3"]);
  assert.deepEqual(M.ledgerRows({ activities: acts, index, pageIds: ["novel", "ch1"] }).map((r) => r.a.id), ["a1", "a3"]);
  assert.deepEqual(M.ledgerRows({ activities: acts, index, who: "ash", whoIds }).map((r) => r.a.id), ["a2"], "older rows' single alter_id counts");
  assert.deepEqual(M.ledgerRows({ activities: acts, index, deckIds: new Set(["deck1"]), who: "__none", whoIds }).map((r) => r.a.id), ["a4", "a5", "a3"]);
  assert.equal(M.amountOf(acts[0]), "+600 w");
  assert.match(M.amountOf(acts[1]), /^\+45/);
  const csv = M.ledgerCsv([{ a: { activity_name: 'Say "hi", then', duration_minutes: 5 }, when: NOW }], { pageName: () => "Garden" });
  assert.equal(csv.split("\n")[0], "When,What,Page,By,Minutes,Words");
  assert.ok(csv.includes('"Say ""hi"", then"'), "commas and quotes are escaped");
  const shares = M.whoShares(all, (a) => (W.activityWhoIds(a)[0] ? { id: W.activityWhoIds(a)[0], label: W.activityWhoIds(a)[0] } : null));
  assert.equal(shares.total, 110);
  assert.equal(shares.rows[0].id, "ash");
});

test("balances for lists and decks; the even-pace tick", () => {
  assert.deepEqual(M.listMeasure({ id: "l", list_type: "flashcards" }, [{}, {}]).val, "2 cards");
  assert.equal(M.listMeasure({ id: "l" }, []).val, "note");
  const p = M.weekPace(NOW);
  assert.ok(p > 0 && p < 100);
});

test("who did it: the patch keeps both fields in step", () => {
  assert.deepEqual(W.activityWhoIds({ alter_id: "ash" }), ["ash"]);
  assert.deepEqual(W.activityWhoIds({ fronting_alter_ids: ["river", null], alter_id: "ash" }), ["river"]);
  assert.deepEqual(W.activityWhoPatch({ fronting_alter_ids: [] }, ["a", "a", "b"]), { fronting_alter_ids: ["a", "b"] }, "no alter_id added where there was none");
  assert.deepEqual(W.activityWhoPatch({ alter_id: "x" }, ["b"]), { fronting_alter_ids: ["b"], alter_id: "b" });
  assert.deepEqual(W.activityWhoPatch({ alter_id: "x" }, []), { fronting_alter_ids: [], alter_id: null });
});

test("who did it: written through the entity proxy, only what changed, restorable", async () => {
  h.reset();
  const a = await h.E.Activity.create({ activity_name: "Wrote", goal_id: "ch1", duration_minutes: 30, alter_id: "ash", notes: "kept" });
  const out = await W.setActivityWho(a, ["river", "pip"]);
  assert.deepEqual(out.fronting_alter_ids, ["river", "pip"]);
  assert.equal(out.alter_id, "river");
  const raw = h.raw("Activity", a.id);
  assert.equal(raw.notes, "kept"); assert.equal(raw.duration_minutes, 30, "nothing else is touched");
  assert.ok(raw._ft?.fronting_alter_ids, "the change is stamped for sync");
  // Another device changed the notes while the sheet was open: kept.
  await h.E.Activity.update(a.id, { notes: "changed elsewhere" });
  await W.setActivityWho(raw, ["pip"]);
  assert.equal(h.raw("Activity", a.id).notes, "changed elsewhere");
  const kept = (globalThis.__kept || []).filter((k) => k.entity === "Activity");
  assert.equal(kept.length, 2, "the version before each edit is kept in Recent changes");
  assert.equal(kept[0].snapshot.alter_id, "ash");
  await W.setActivityWho(h.raw("Activity", a.id), ["pip"]);
  assert.equal((globalThis.__kept || []).length, 2, "nothing changed → nothing written, no restore point");
  await assert.rejects(() => W.setActivityWho({}, ["x"]));
});

test("the Notebook room is drawn by the house only on /goals", () => {
  assert.equal(S.houseNotebookRoom("/goals"), true);
  assert.equal(S.houseNotebookRoom("/goals/"), true);
  assert.ok(!S.houseNotebookRoom("/notes"));
  assert.ok(!S.houseNotebookRoom("/goal"));
  assert.equal(S.houseRebuiltRoom("/goals"), true);
  assert.match(read("src/App.jsx"), /path="\/goals" element=\{<HouseRoomGate><GoalsPage \/><\/HouseRoomGate>\}/);
});

test("both frames mount the room; the phone runs it edge to edge with its own tools", () => {
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) {
    const t = read(f);
    assert.ok(t.includes("house/notebook/HouseNotebook"), `${f} loads the room`);
    assert.ok(/<HouseNotebook /.test(t), `${f} mounts it`);
  }
  const phone = read("src/house/phone/HousePhoneFrame.jsx");
  assert.ok(/notebookRoom \? "px-0"/.test(phone) || /\|\| notebookRoom\) \? "px-0"|\|\| notebookRoom \? "px-0"/.test(phone), "the phone runs it edge to edge");
  assert.ok(/ownDocks[^;]*notebookRoom/.test(read("src/house/frame/HouseFrame.jsx")), "the room draws its own side panels");
  const room = read("src/house/notebook/HouseNotebook.jsx");
  assert.ok(room.includes("useRoomTools"), "the phone's header tools come from the room (nothing floats over the page)");
  assert.ok(!/position:\s*fixed/.test(read("src/house/notebook/notebook.css")), "nothing floats over scrolling content");
});

test("the room writes only through the write paths", () => {
  const dir = "src/house/notebook";
  const files = readdirSync(new URL(`../${dir}`, import.meta.url)).filter((f) => /\.jsx?$/.test(f)).map((f) => `${dir}/${f}`);
  for (const f of files) {
    const text = read(f).replace(/\/\/.*$/gm, "");
    assert.ok(!/(entities|localEntities|base44)\b[^;]*\.(create|update|delete|bulkDelete)\(/.test(text), `${f} writes a record directly`);
    assert.ok(!/\b(localEntities|base44)\b/.test(text), `${f} reaches for the entity layer`);
    assert.ok(!/localStorage\.setItem/.test(text), `${f} keeps state in localStorage`);
  }
  const room = read(`${dir}/HouseNotebook.jsx`) + read(`${dir}/NotebookParts.jsx`);
  for (const fn of ["updatePage", "deletePage", "movePage", "setGoalStatus", "startPageActivity", "stopPageActivity", "createPage", "createStoryPage", "createNote", "fileInPage", "setActivityWho"]) {
    assert.ok(room.includes(fn), `the room uses ${fn}`);
  }
  assert.ok(read("src/components/goals/workspace/useNotebookWorkspace.js").includes("carryOverWeeklyGoals"), "the carry-over goes through goals.js");
  assert.ok(/run\(\(\) => deletePage/.test(room) && room.includes("ConfirmSheet"), "a page is deleted only after asking, into the trash");
  const who = read("src/lib/activityWho.js");
  assert.ok(who.includes("editRecord(") && !/\.(create|update)\(/.test(who.replace(/\/\/.*$/gm, "")), "who did it goes through editRecord");
});

test("deep links survive: ?page, ?highlight, ?new, ?fromWish, ?list, ?notes, ?view", () => {
  const ws = read("src/components/goals/workspace/useNotebookWorkspace.js");
  for (const k of ['params.get("page")', 'params.get("highlight")', 'params.get("new")', 'params.get("fromWish")', 'params.get("list")', 'params.get("notes")']) assert.ok(ws.includes(k), `the workspace keeps ${k}`);
  const room = read("src/house/notebook/HouseNotebook.jsx");
  assert.ok(room.includes("useHighlightScroll") && room.includes("data-highlight-id"), "highlights land on the page");
  assert.ok(room.includes("useNotebookWorkspace") && read("src/pages/Goals.jsx").includes("useNotebookWorkspace"), "the old page and the room share one workspace");
  assert.ok(room.includes('params.get("new") === "1"'), "?new=1 asks for the new page's name");
});

test("hn- classes are the room's own and the CSS is the room's", () => {
  for (const f of ["src/house/kit/frame/frameKit.css", "src/house/kit/panels.css", "src/house/kit/kit.css", "src/house/alters/alters.css", "src/house/write/write.css", "src/house/planner/planner.css", "src/house/home/home.css", "src/house/day/day.css", "src/house/checkin/checkin.css", "src/house/support/support.css", "src/house/frame/frame.css", "src/house/phone/phone.css"]) {
    let t = ""; try { t = read(f); } catch { continue; }
    assert.ok(!/\.hn-|\.hn\b/.test(t), `${f} has no hn- classes`);
  }
  const css = read("src/house/notebook/notebook.css");
  assert.ok(!/!important/.test(css));
  assert.ok(!/font-size:\s*\d+px/.test(css), "no px font sizes");
  for (const sel of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0]).filter((s) => s.trim())) {
    for (const part of sel.split(",")) assert.ok(/\.hn[-\s.[]|\.hn$|\.hn\b/.test(part), `"${part.trim()}" styles something outside the room`);
  }
  assert.ok(read("src/house/notebook/HouseNotebook.jsx").includes("notebook/notebook.css"), "the room imports its CSS (the phone needs it)");
  assert.ok(/\.hn--phone \{[^}]*padding: 0 var\(--house-space-2/.test(css) && /\[data-house\]\.hn \{[^}]*background: var\(--house-page\)/.test(css), "the phone paints the page with the slim gutter");
});

await run();

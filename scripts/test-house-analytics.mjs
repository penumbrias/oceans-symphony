#!/usr/bin/env node
// The house's Analytics room (board 06-Analytics): what the address means
// (?tab=, ?alter=), the calendar periods and how they step, how the board
// shapes the engine's numbers (bars, the feelings calendar, the together
// grid) and words them, and that the room is drawn only on /analytics, the
// old page is gated, both frames mount it, the phone runs it edge to edge
// with its doors in ⋯, it reads through the old page's reads and the
// analytics engine and writes nothing, and its classes stay its own with
// thin edges. Pure: nothing is written anywhere.
//
//   node scripts/test-house-analytics.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const M = await import("../src/house/analytics/analyticsModel.js");
const S = await import("../src/lib/houseSwitch.js");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("the address: no ?tab is the board, the old tabs keep their ids and ?alter=", () => {
  assert.equal(M.analyticsViewOf(""), "board");
  assert.equal(M.analyticsViewOf(null), "board");
  assert.equal(M.analyticsViewOf("?tab=zzz"), "board");
  for (const t of ["overview", "fronting", "wellbeing", "life", "alters"]) assert.equal(M.analyticsViewOf(`?tab=${t}`), t, `the old ?tab=${t} still lands`);
  assert.equal(M.analyticsAlterOf("?tab=alters&alter=a1"), "a1", "a profile's link lands on that one's footprint");
  assert.equal(M.analyticsViewHref("board"), "/analytics");
  assert.equal(M.analyticsViewHref("alters", { alterId: "a1" }), "/analytics?tab=alters&alter=a1");
  for (const v of M.ANALYTICS_VIEWS) assert.equal(M.analyticsViewOf(M.analyticsViewHref(v).slice("/analytics".length)), v, `${v} round-trips`);
});

test("every old view has a door, in the person's words", () => {
  const terms = { fronting: "being out", Fronting: "Being out", Alters: "Parts", alter: "part", switches: "shifts", fronts: "is out" };
  const list = M.analyticsViewList(terms);
  assert.deepEqual(list.map((v) => v.id), ["overview", "fronting", "wellbeing", "life", "alters"]);
  assert.equal(list[1].label, "Being out");
  assert.equal(list[4].label, "Parts");
  const all = list.map((v) => `${v.label} ${v.hint}`).join(" ");
  assert.ok(!/\balter\b|\bfronting\b|\bswitches\b/.test(all), "no built-in words when the person has their own");
});

test("periods: week by the person's week start, month, year, and stepping", () => {
  const anchor = new Date(2026, 10, 26, 12); // Thu 26 Nov 2026
  const mon = M.periodOf("week", anchor, 1);
  assert.equal(mon.from.getDay(), 1); assert.equal(mon.from.getDate(), 23);
  assert.equal(mon.to.getDate(), 29);
  const sun = M.periodOf("week", anchor, 0);
  assert.equal(sun.from.getDay(), 0); assert.equal(sun.from.getDate(), 22);
  const m = M.periodOf("month", anchor);
  assert.equal(m.from.getDate(), 1); assert.equal(m.to.getDate(), 30); assert.equal(m.to.getHours(), 23);
  const y = M.periodOf("year", anchor);
  assert.equal(y.from.getMonth(), 0); assert.equal(y.to.getMonth(), 11); assert.equal(y.to.getDate(), 31);
  assert.equal(M.stepAnchor("month", new Date(2026, 0, 31), -1).getMonth(), 11, "Jan 31 back a month is December, not a skipped month");
  assert.equal(M.stepAnchor("month", new Date(2026, 0, 31), 1).getMonth(), 1);
  assert.equal(M.stepAnchor("week", anchor, -1).getDate(), 19);
  assert.equal(M.stepAnchor("year", anchor, 1).getFullYear(), 2027);
  const now = anchor.getTime();
  assert.equal(M.canStepForward("month", anchor, 1, now), false, "no stepping into a month that hasn't started");
  assert.equal(M.canStepForward("month", new Date(2026, 9, 5), 1, now), true);
});

test("Pick dates: the quick choices and All time from the first record", () => {
  const now = new Date(2026, 10, 26, 15);
  const r = M.customFor("90d", now);
  assert.equal(Math.round((r.to - r.from) / 86400000), 90);
  const all = M.customFor("all", now, new Date(2024, 2, 3).getTime());
  assert.equal(all.from.getFullYear(), 2024);
  assert.equal(M.customFor("nope", now), null);
  assert.deepEqual(M.CUSTOM_QUICK.map((q) => q.label), ["Last 30 days", "Last 90 days", "Last year", "All time"]);
});

test("board 06's words: period, status line, the stretch before", () => {
  const m = M.periodOf("month", new Date(2026, 10, 5));
  assert.equal(M.periodWords("month", m.from, m.to), "November 2026");
  assert.equal(M.spanWords(m.from, m.to, new Date(2026, 10, 26)), "November 1 to 30");
  assert.equal(M.spanWords(m.from, m.to, new Date(2027, 1, 1)), "November 1 to 30, 2026");
  const w = M.periodOf("week", new Date(2026, 10, 26), 1);
  assert.equal(M.periodWords("week", w.from, w.to), "Nov 23 to 29, 2026");
  const w2 = M.periodOf("week", new Date(2026, 11, 2), 1);
  assert.equal(M.periodWords("week", w2.from, w2.to), "Nov 30 to Dec 6, 2026");
  assert.equal(M.periodWords("year", new Date(2026, 0, 1), new Date(2026, 11, 31)), "2026");
  assert.equal(M.priorWords("month", m.from), "in October");
  assert.equal(M.priorWords("year", new Date(2026, 0, 1)), "in 2025");
  assert.equal(M.priorWords("week", w.from), "the week before");
  const p = M.priorPeriod("month", new Date(2026, 10, 5), 1);
  assert.equal(p.from.getMonth(), 9);
});

test("bars: a bar a day (future days drawn empty), long stretches folded", () => {
  const keys = M.periodDayKeys(new Date(2026, 10, 1), new Date(2026, 10, 30));
  assert.equal(keys.length, 30);
  const bars = M.periodBars({ keys, valueByKey: new Map([["2026-11-02", 3]]), todayKey: "2026-11-20" });
  assert.equal(bars.length, 30);
  assert.equal(bars[1].value, 3);
  assert.equal(bars[0].value, null, "an unlogged day is unknown, never 0");
  assert.equal(bars[29].future, true);
  assert.deepEqual(M.axisLabels(bars), ["Nov 1", "Nov 11", "Nov 20", "Nov 30"]);
  const yk = M.periodDayKeys(new Date(2026, 0, 1), new Date(2026, 11, 31));
  const yb = M.periodBars({ keys: yk, valueByKey: new Map([["2026-03-01", 2], ["2026-03-02", 4]]), todayKey: "2026-11-26" });
  assert.equal(yb.length, 12, "a year is a bar a month");
  assert.equal(yb[2].value, 3, "a month's bar is the average of its logged days");
  assert.equal(yb[11].future, true);
  assert.equal(M.barLabel("2026-03"), "Mar");
});

test("feelings: the most felt each day, a month grid starting on the person's weekday", () => {
  const cis = [
    { timestamp: new Date(2026, 10, 2, 9).toISOString(), emotions: ["calm", "tired"] },
    { timestamp: new Date(2026, 10, 2, 18).toISOString(), emotions: ["calm"] },
    { timestamp: new Date(2026, 10, 3, 9).toISOString(), emotions: ["anxious"], alter_id: "b" },
    { timestamp: new Date(2026, 9, 3, 9).toISOString(), emotions: ["sad"] },
  ];
  const from = new Date(2026, 10, 1).getTime(), to = new Date(2026, 10, 30, 23, 59).getTime();
  const { byDay, total } = M.tallyFeelings(cis, from, to);
  assert.equal(total.get("sad"), undefined, "outside the stretch is left out");
  assert.deepEqual(M.feelingLegend(total), ["calm", "anxious", "tired"]);
  const keys = M.periodDayKeys(new Date(2026, 10, 1), new Date(2026, 10, 30));
  const g = M.feelingCells({ keys, byDay, todayKey: "2026-11-20", weekStartsOn: 1 });
  assert.equal(g.mode, "days");
  assert.equal(g.lead, 6, "1 Nov 2026 is a Sunday: six blanks in a Monday-first grid");
  assert.equal(M.feelingCells({ keys, byDay, weekStartsOn: 0 }).lead, 0);
  assert.equal(g.cells[1].feeling, "calm");
  assert.equal(g.cells[29].future, true);
  const scoped = M.tallyFeelings(cis, from, to, (c) => c.alter_id === "b");
  assert.deepEqual(M.feelingLegend(scoped.total), ["anxious"], "Whose keeps only theirs");
  const yk = M.periodDayKeys(new Date(2026, 0, 1), new Date(2026, 11, 31));
  assert.equal(M.feelingCells({ keys: yk, byDay }).mode, "months");
});

test("who fronts together: the top fronters, or the picked one and who they shared most with", () => {
  const pairs = [
    { alterIdA: "a", alterIdB: "b", totalOverlap: 10 },
    { alterIdA: "c", alterIdB: "d", totalOverlap: 50 },
    { alterIdA: "b", alterIdB: "d", totalOverlap: 30 },
  ];
  assert.deepEqual(M.togetherIds({ fronters: ["a", "b", "c", "d", "e", "f"], pairs }), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(M.togetherIds({ fronters: ["a", "b", "c", "d"], pairs, whoseId: "b" }), ["b", "d", "a"]);
  const g = M.togetherGrid(["a", "b"], pairs);
  assert.equal(g.val.get("b|a"), 10); assert.equal(g.any, true); assert.equal(g.max, 10);
  assert.equal(M.togetherGrid(["a", "e"], pairs).any, false);
});

test("Noticed: descriptive sentences in the person's words", () => {
  const terms = { switches: "shifts", fronting: "being out", front: "the front" };
  const from = new Date(2026, 10, 1);
  const n = M.noticedWords({
    terms, kind: "month", from,
    plans: { completionRate: 0.72 }, plansPrior: { completionRate: 0.61 },
    switchesPerDay: 4.1, switchesPrior: 4.1,
    sleep: { avgHours: 6.8333, nightsLogged: 14 }, sleepLink: { gated: true },
  });
  assert.equal(n[0].big, "72%"); assert.equal(n[0].words, "of plans got done, up from 61% in October");
  assert.equal(n[1].words, "shifts a day on average, the same as in October");
  assert.equal(n[2].big, "6 h 50"); assert.equal(n[2].words, "average sleep over 14 logged nights");
  const linked = M.noticedWords({ terms, kind: "week", from, plans: {}, sleep: { avgHours: 7, nightsLogged: 9 }, sleepLink: { gated: false, withMean: 0.1, withoutMean: 0.4, medianHours: 6 } });
  assert.equal(linked[2].words, "average sleep; distress was logged on 40% of days after nights under 6 h, 10% after longer ones");
  assert.equal(linked[0].big, "—");
  const all = JSON.stringify(n.concat(linked));
  assert.ok(!/better|worse|improv|caus/i.test(all), "never judgmental or causal");
  const who = M.noticedWords({ terms, kind: "month", from, plans: {}, switchesPerDay: 1, sleep: {}, whoseName: "Ash" });
  assert.equal(who[1].words, "times a day Ash came to the front");
  assert.equal(M.hoursWords(7.999), "8 h");
  assert.equal(M.hoursWords(null), "—");
  assert.match(M.emptyWords("together", terms), /being out/);
});

test("the room is drawn by the house only on /analytics; the old page is gated", () => {
  assert.equal(S.houseAnalyticsRoom("/analytics"), true);
  assert.equal(S.houseAnalyticsRoom("/analytics/"), true);
  assert.ok(!S.houseAnalyticsRoom("/analyticsx"));
  assert.ok(!S.houseAnalyticsRoom("/co-fronting"));
  assert.equal(S.houseRebuiltRoom("/analytics"), true);
  assert.match(read("src/App.jsx"), /path="\/analytics" element=\{<HouseRoomGate><Analytics \/><\/HouseRoomGate>\}/);
});

test("both frames mount the room; the phone runs it edge to edge with its doors in ⋯", () => {
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) {
    const t = read(f);
    assert.ok(t.includes("house/analytics/HouseAnalytics"), `${f} loads the room`);
    assert.ok(/<HouseAnalytics /.test(t), `${f} mounts it`);
  }
  const phone = read("src/house/phone/HousePhoneFrame.jsx");
  assert.ok(/\|\| analyticsRoom \? "px-0"/.test(phone), "the phone runs it edge to edge");
  assert.ok(/roomTools = [^;]*analyticsRoom/.test(phone), "the phone frame reads the room's tools");
  assert.ok(/ownDocks[^;]*analyticsRoom/.test(read("src/house/frame/HouseFrame.jsx")), "the room draws its own toolbar and status line");
  const room = read("src/house/analytics/HouseAnalytics.jsx");
  assert.ok(room.includes("useRoomTools") && room.includes('label: "Therapy report"'), "the phone's ⋯ holds the therapy report and the views");
  assert.ok(!/position:\s*fixed/.test(read("src/house/analytics/analytics.css")), "nothing floats over scrolling content");
});

test("one set of reads and one copy of the old views", () => {
  const room = read("src/house/analytics/HouseAnalytics.jsx");
  const page = read("src/pages/Analytics.jsx");
  assert.ok(/export function useAnalyticsData/.test(page) && /export function AnalyticsTabBody/.test(page), "the old page shares its reads and its tab bodies");
  assert.ok(/useAnalyticsData\(\{ from, to \}\)/.test(page) && /<AnalyticsTabBody/.test(page), "the old page draws through them too");
  assert.ok(room.includes("useAnalyticsData(") && room.includes("<AnalyticsTabBody"), "the room reads and draws through the same");
  for (const fn of ["frontingRollup", "coFrontingPairs", "sleepRollup", "plansLifecycle", "sleepVsNextDayDistress", "attributeRecord", "dailySeries"]) {
    assert.ok(room.includes(fn), `the board's numbers come from the engine (${fn})`);
  }
  assert.ok(room.includes("StaleSessionsModal"), "open sessions can still be reviewed");
  assert.ok(room.includes("useAlterLabel") && room.includes("useTerms"), "names and words are the person's");
});

test("the room writes nothing", () => {
  const dir = "src/house/analytics";
  const files = readdirSync(new URL(`../${dir}`, import.meta.url)).filter((f) => /\.jsx?$/.test(f)).map((f) => `${dir}/${f}`);
  assert.ok(files.length >= 2);
  for (const f of files) {
    const text = read(f).replace(/\/\/.*$/gm, "");
    assert.ok(!/\.(create|update|delete|bulkDelete|bulkCreate)\(/.test(text), `${f} writes a record`);
    assert.ok(!/localStorage\.(setItem|removeItem)/.test(text), `${f} keeps state in localStorage`);
    assert.ok(!/(localEntities|base44)\b/.test(text), `${f} reaches the entity layer itself`);
    assert.ok(!/writeSettings\(|writeBoard\(|setMode\(/.test(text), `${f} writes settings`);
  }
});

test("han- classes are the room's own and the CSS keeps thin edges", () => {
  const dir = new URL("../src/house/", import.meta.url);
  const others = [];
  for (const d of readdirSync(dir)) {
    let fs = []; try { fs = readdirSync(new URL(`${d}/`, dir)); } catch { continue; }
    for (const f of fs) if (f.endsWith(".css") && !(d === "analytics" && f === "analytics.css")) others.push(`src/house/${d}/${f}`);
  }
  others.push("src/house/kit/frame/frameKit.css");
  for (const f of others) {
    let t = ""; try { t = read(f); } catch { continue; }
    assert.ok(!/\.han-|\.han\b/.test(t), `${f} has no han- classes`);
  }
  const css = read("src/house/analytics/analytics.css");
  assert.ok(!/!important/.test(css));
  assert.ok(!/font-size:\s*\d+px/.test(css), "no px font sizes");
  assert.ok(!/(outline|border|box-shadow)[^;]*\b2px\b/.test(css.replace(/:focus-visible[^}]*}/g, "")), "edges are the thin pixel line, never a hard 2px");
  for (const sel of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0]).filter((s) => s.trim() && !s.includes("@media"))) {
    for (const part of sel.split(/,(?![^(]*\))/)) assert.ok(/\.han[-\s.[:]|\.han$|\.han\b/.test(part), `"${part.trim()}" styles something outside the room`);
  }
  assert.ok(read("src/house/analytics/HouseAnalytics.jsx").includes("analytics/analytics.css"), "the room imports its CSS (the phone needs it)");
  assert.ok(/\[data-house\]\.han \{[^}]*background: var\(--house-page\)/.test(css), "the room paints the page");
  assert.ok(/\.han--phone \.han-floor \{[^}]*var\(--house-space-2/.test(css), "the phone keeps the slim gutter");
  const room = read("src/house/analytics/HouseAnalytics.jsx");
  assert.ok(!/#[0-9a-f]{6}\b/i.test(room.replace(/\/\/.*$/gm, "")), "chart colours are house colours, not hex in the room");
});

test("tour anchors the room adds have steps", () => {
  const tour = read("src/components/onboarding/FeatureTour.jsx");
  const room = read("src/house/analytics/HouseAnalytics.jsx");
  for (const a of ["analytics-range", "analytics-whose", "analytics-board", "analytics-more"]) {
    assert.ok(room.includes(`data-tour="${a}"`), `the room has ${a}`);
    assert.ok(tour.includes(`"${a}"`), `the tour has a step for ${a}`);
  }
  assert.ok(room.includes('data-tour="analytics-charts"'), "the room keeps the old anchor analytics-charts");
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`ok   ${t.name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${t.name}\n     ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);

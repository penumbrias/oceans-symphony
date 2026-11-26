// The house's Notebook room (boards 19-Notebook, 20-NotebookPage and
// 18-NotebookPhone): every rule the room draws by, pure, so
// scripts/test-house-notebook.mjs can check it.
//
// The "finance app" reading of the Notebook: each page is an account with
// a balance (words so far, points done, items left, cards in a deck); the
// ledger lists what moved a page (activities logged on it, words written in
// its sessions, deck study sessions); weekly targets carry a pace tick;
// Coming due, Repeats and a range from This week to All time.
//
// Nothing here is typed twice and nothing is stored: every number is read
// from the records the goal widgets already count (src/lib/goals.js,
// goalTree.js, goalWriting.js, noteListModel.js).

import { format, differenceInCalendarDays, startOfDay, addDays, addMonths, startOfMonth } from "date-fns";
import { countableMinutes, statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { goalWeekWindow, activityWhen } from "@/lib/goalCounting";
import { isOpenGoal, stepState } from "@/lib/goals";
import { rootPages, ancestorsOf, subtreeProgress, liveSteps, formatMinutes } from "@/lib/goalTree";
import { sectionHeading, pageWordCount, wordTargetOf, formatWords } from "@/lib/goalWriting";
import { isDeck, listProgress } from "@/lib/noteListModel";

const DAY = 86400000;
const HAPPENED = new Set([ACTIVITY_STATUSES.LOGGED, ACTIVITY_STATUSES.DONE, ACTIVITY_STATUSES.PARTIAL]);

// Series colours: a page's sections take its colour; lists and decks have
// their own. The board's palette (19-Notebook). Alters keep their colours.
export const PAGE_COLORS = Object.freeze(["#c98bb9", "#5aa0c8", "#9cc46b", "#e8a65d", "#86b88f", "#e3c16f", "#7fb3a6", "#b48ad6"]);
export const LIST_COLOR = "#f4e3b5";
export const DECK_COLOR = "#9cc46b";
export const OTHER_COLOR = "#565d86";

export const RANGES = Object.freeze([
  { id: "week", label: "This week", short: "Week" },
  { id: "1m", label: "1M", short: "1M" },
  { id: "6m", label: "6M", short: "6M" },
  { id: "1y", label: "1Y", short: "1Y" },
  { id: "all", label: "All time", short: "All" },
]);
export const RANGE_WORDS = Object.freeze({ week: "this week", "1m": "the last month", "6m": "the last 6 months", "1y": "the last year", all: "all time" });
export const VS_WORDS = Object.freeze({ week: "vs last week", "1m": "vs the month before", "6m": "vs the 6 before", "1y": "vs the year before" });
export const isRange = (id) => RANGES.some((r) => r.id === id);

// ── The room's address ─────────────────────────────────────────────

/** The Notebook room for this path ("/goals"), or null. */
export function notebookRoomOf(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return p === "/goals" ? "notebook" : null;
}

/** What the room shows for these search params. */
export function notebookView(search) {
  let q;
  try { q = new URLSearchParams(search || ""); } catch { q = new URLSearchParams(); }
  const pageId = q.get("page") || q.get("highlight") || null;
  const view = q.get("view");
  if (pageId) return { kind: "page", pageId, layout: view === "layout" };
  if (q.get("notes") === "1") return { kind: "notes" };
  if (view === "board") return { kind: "board" };
  return { kind: "overview" };
}

// ── Colours ────────────────────────────────────────────────────────

export function pageColorsOf(index) {
  const roots = rootPages(index);
  const byRoot = new Map(roots.map((p, i) => [p.id, PAGE_COLORS[i % PAGE_COLORS.length]]));
  const rootOf = (id) => {
    const up = ancestorsOf(index, id);
    return up.length ? up[up.length - 1].id : id;
  };
  return { color: (id) => byRoot.get(rootOf(id)) || PAGE_COLORS[0], rootOf };
}

// ── What moved a page ──────────────────────────────────────────────

/** Activities that happened and belong to a page or a deck. */
export const pageActs = (activities) => (activities || []).filter((a) => a && !a.trashed_at && !a.removed_at
  && (a.goal_id || a.study_list_id) && HAPPENED.has(statusFor(a)));

export const wordsOf = (a) => Math.max(0, Math.round(Number(a?.words_written) || 0));

export function rangeStart(id, now = new Date(), activities = [], weekStartsOn = 1) {
  if (id === "week") return goalWeekWindow(now, weekStartsOn).start;
  if (id === "1m") return new Date(now.getTime() - 30 * DAY);
  if (id === "6m") return new Date(now.getTime() - 182 * DAY);
  if (id === "1y") return new Date(now.getTime() - 365 * DAY);
  let first = now.getTime() - 30 * DAY;
  for (const a of pageActs(activities)) {
    const w = activityWhen(a);
    if (w && w.getTime() < first) first = w.getTime();
  }
  return startOfDay(new Date(first));
}

/**
 * The chart's columns for a range: days for This week, weeks for 1M and 6M,
 * months for a year and All time (grouped so there are never more than 24).
 * [{ start, end, label }], plus `unit` ("day" | "week" | "month" | "span").
 */
export function chartBuckets(range, start, now = new Date()) {
  const out = [];
  if (range === "week") {
    for (let i = 0; i < 7; i++) {
      const s = addDays(start, i);
      out.push({ start: s, end: addDays(s, 1), label: format(s, "EEE") });
    }
    return { unit: "day", buckets: out };
  }
  if (range === "1m" || range === "6m") {
    let s = startOfDay(start);
    while (s < now) { const e = addDays(s, 7); out.push({ start: s, end: e, label: format(s, "MMM d") }); s = e; }
    return { unit: "week", buckets: out };
  }
  const first = startOfMonth(start);
  let months = 0;
  for (let s = first; s < now; s = addMonths(s, 1)) months += 1;
  const step = Math.max(1, Math.ceil(months / 24));
  for (let s = first; s < now; s = addMonths(s, step)) out.push({ start: s, end: addMonths(s, step), label: format(s, step === 1 ? "MMM" : "MMM yy") });
  return { unit: step === 1 ? "month" : "span", buckets: out };
}

const bucketIndex = (buckets, t) => {
  for (let i = 0; i < buckets.length; i++) if (t >= buckets[i].start.getTime() && t < buckets[i].end.getTime()) return i;
  return t >= (buckets[buckets.length - 1]?.start.getTime() ?? Infinity) ? buckets.length - 1 : -1;
};

// Consecutive days, up to today, with at least one study session (a day
// without one yet today doesn't break yesterday's run).
export function studyRun(activities = [], now = new Date()) {
  const days = new Set();
  for (const a of pageActs(activities)) {
    if (!a.study_list_id) continue;
    const w = activityWhen(a);
    if (w) days.add(format(w, "yyyy-MM-dd"));
  }
  let d = startOfDay(now);
  if (!days.has(format(d, "yyyy-MM-dd"))) d = addDays(d, -1);
  let n = 0;
  while (days.has(format(d, "yyyy-MM-dd")) && n < 3650) { n += 1; d = addDays(d, -1); }
  return n;
}

/**
 * Everything the overview's stat cards and chart show for one range.
 * `itemsOf(listId)` gives a list's rows (ticked ones carry `purchased_at`).
 */
export function notebookNumbers({ activities = [], index, lists = [], itemsOf = () => [], range = "week", now = new Date(), weekStartsOn = 1 }) {
  const acts = pageActs(activities);
  const start = rangeStart(range, now, acts, weekStartsOn);
  const span = range === "week" ? 7 * DAY : Math.max(DAY, now - start);
  const prevStart = new Date(start.getTime() - span);
  const { unit, buckets } = chartBuckets(range, start, now);
  const n = buckets.length || 1;
  const empty = () => Array(n).fill(0);
  const colors = pageColorsOf(index);
  const s = {
    start, unit, buckets,
    minutes: 0, prevMinutes: 0, words: 0, prevWords: 0, study: 0, prevStudy: 0, studySessions: 0, ticked: 0, listsDone: 0,
    run: studyRun(activities, now),
    spark: { minutes: empty(), words: empty(), study: empty(), ticked: empty() },
    byPage: new Map(),
  };
  for (const a of acts) {
    const when = activityWhen(a);
    if (!when) continue;
    const t = when.getTime();
    const m = countableMinutes(a) || 0;
    const w = wordsOf(a);
    const inRange = t >= start.getTime() && t <= now.getTime();
    const inPrev = t >= prevStart.getTime() && t < start.getTime();
    const bi = inRange ? bucketIndex(buckets, t) : -1;
    if (a.goal_id && index?.byId?.has(a.goal_id)) {
      if (inRange) {
        s.minutes += m; s.words += w;
        if (bi >= 0) {
          s.spark.minutes[bi] += m; s.spark.words[bi] += w;
          const root = colors.rootOf(a.goal_id);
          if (!s.byPage.has(root)) s.byPage.set(root, empty());
          s.byPage.get(root)[bi] += m;
        }
      } else if (inPrev) { s.prevMinutes += m; s.prevWords += w; }
    }
    if (a.study_list_id) {
      if (inRange) { s.study += m; s.studySessions += 1; if (bi >= 0) s.spark.study[bi] += m; } else if (inPrev) s.prevStudy += m;
    }
  }
  for (const l of lists || []) {
    if (isDeck(l)) continue;
    const rows = itemsOf(l.id) || [];
    let here = 0;
    for (const it of rows) {
      if (!it?.checked) continue;
      const at = it.purchased_at ? new Date(it.purchased_at).getTime() : NaN;
      if (Number.isFinite(at) && at >= start.getTime() && at <= now.getTime()) {
        s.ticked += 1; here += 1;
        const bi = bucketIndex(buckets, at);
        if (bi >= 0) s.spark.ticked[bi] += 1;
      }
    }
    if (here && listProgress(rows).finished) s.listsDone += 1;
  }
  return s;
}

/** The chart's stacks: the four busiest pages, then "Other pages". */
export function chartSeries(byPage, n) {
  const series = [...byPage.entries()].map(([id, vals]) => ({ id, vals, total: vals.reduce((x, y) => x + y, 0) }))
    .filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  const top = series.slice(0, 4);
  const rest = series.slice(4);
  if (rest.length) {
    const vals = Array(n).fill(0);
    for (const x of rest) x.vals.forEach((v, i) => { vals[i] += v; });
    top.push({ id: "__other", vals, total: vals.reduce((x, y) => x + y, 0) });
  }
  const stacks = Array(n).fill(0).map((_, i) => top.reduce((x, y) => x + y.vals[i], 0));
  return { series: top, stacks, max: Math.max(1, ...stacks) };
}

export const plusMinutes = (d) => (d >= 0 ? `+${formatMinutes(d)}` : `-${formatMinutes(-d)}`);
export const plusNum = (d) => (d >= 0 ? `+${d.toLocaleString()}` : `-${Math.abs(d).toLocaleString()}`);

// ── The ledger ─────────────────────────────────────────────────────

/**
 * Rows of the ledger, newest first: [{ a, when }]. `pageIds` limits it to a
 * page and its sections; otherwise every page and deck. `whoIds(a)` and
 * `who` (an alter id, or "__none") filter by who did it.
 */
export function ledgerRows({ activities = [], index, deckIds = new Set(), pageIds = null, who = null, whoIds = () => [] }) {
  const ids = pageIds ? new Set(pageIds) : null;
  return pageActs(activities)
    .filter((a) => (ids ? ids.has(a.goal_id) : (a.goal_id && index?.byId?.has(a.goal_id)) || deckIds.has(a.study_list_id)))
    .filter((a) => {
      if (!who) return true;
      const w = whoIds(a);
      return who === "__none" ? w.length === 0 : w.includes(who);
    })
    .map((a) => ({ a, when: activityWhen(a) }))
    .filter((r) => r.when)
    .sort((x, y) => y.when - x.when);
}

export function whenLabel(d, now = new Date()) {
  const days = differenceInCalendarDays(now, d);
  if (days === 0) return `Today ${format(d, "h:mm")}`;
  if (days > 0 && days < 7) return format(d, "EEE");
  return format(d, "MMM d");
}

/** What a row moved: words when it wrote some, else its time. */
export function amountOf(a) {
  const w = wordsOf(a);
  if (w > 0) return `+${w.toLocaleString()} w`;
  return `+${formatMinutes(countableMinutes(a) || 0)}`;
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The ledger as CSV (When, What, Page, By, Minutes, Words). */
export function ledgerCsv(rows, { pageName = () => "", whoName = () => "" } = {}) {
  const head = ["When", "What", "Page", "By", "Minutes", "Words"];
  const lines = [head.join(",")];
  for (const { a, when } of rows || []) {
    lines.push([
      format(when, "yyyy-MM-dd HH:mm"), a.activity_name || "Session", pageName(a), whoName(a),
      Math.round(countableMinutes(a) || 0), wordsOf(a),
    ].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** Who's put time in, biggest share first (the page's "Who's been writing" bar). */
export function whoShares(rows, whoOf) {
  const m = new Map();
  let total = 0;
  for (const { a } of rows || []) {
    const mins = countableMinutes(a) || 0;
    if (!mins) continue;
    total += mins;
    const w = whoOf(a);
    const key = w?.id || "__none";
    const cur = m.get(key) || { id: key, label: w?.label || "not signed", color: w?.color || null, mins: 0 };
    cur.mins += mins;
    m.set(key, cur);
  }
  return { total, rows: [...m.values()].sort((a, b) => b.mins - a.mins) };
}

// ── Balances ───────────────────────────────────────────────────────

/** A page's balance: its number and how full its bar is. */
export function pageMeasure(page, { index, steps, ctx }) {
  const target = wordTargetOf(page);
  const heading = sectionHeading(index, page);
  const words = heading || page.child_section_style || target ? pageWordCount(index, steps, page.id) : 0;
  if (words > 0 || target) {
    return { val: `${formatWords(words)} w`, pct: target ? (words / target) * 100 : 0, words: true };
  }
  const { done, total } = subtreeProgress(index, steps, ctx, page.id);
  if (total > 0) return { val: `${done} of ${total}`, pct: (done / total) * 100 };
  return { val: "", pct: 0 };
}

/** A note, list or deck's balance. */
export function listMeasure(list, rows = []) {
  if (isDeck(list)) return { val: rows.length === 1 ? "1 card" : `${rows.length} cards`, pct: rows.length ? 100 : 0 };
  const p = listProgress(rows);
  if (!p.total) return { val: "note", pct: 0 };
  const left = p.total - p.done;
  return { val: left ? `${left} left` : "all ticked", pct: (p.done / p.total) * 100 };
}

/** Where an even pace would be through this week (0–100). */
export function weekPace(now = new Date(), weekStartsOn = 1) {
  const { start } = goalWeekWindow(now, weekStartsOn);
  return Math.max(0, Math.min(100, ((now - start) / (7 * DAY)) * 100));
}

/** This week's targets: every weekly point on an open page. */
export function weeklyTargets({ goals = [], steps = [], ctx = {} }) {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const rows = [];
  for (const s of liveSteps(steps)) {
    const weekly = s.kind === "rhythm" || ((s.kind === "activity_count" || s.kind === "deck_study") && s.count_period === "week");
    if (!weekly) continue;
    const g = byId.get(s.goal_id);
    if (!g || !isOpenGoal(g)) continue;
    const st = stepState(s, ctx);
    if (!st.target) continue;
    const unit = s.kind === "activity_count" ? "" : " min";
    rows.push({
      id: s.id, goalId: g.id, label: `${g.title || "Untitled"}${s.title ? `, ${s.title}` : ""}`,
      value: `${st.current} of ${st.target}${unit}`, pct: Math.min(100, (st.current / st.target) * 100), done: !!st.done,
    });
  }
  return rows;
}

/** Things dated in the next 14 days (and up to a week late). */
export function comingDue({ goals = [], steps = [], ctx = {}, now = new Date() }) {
  const today = startOfDay(now);
  const rows = [];
  for (const g of goals) {
    if (!g?.target_date || !isOpenGoal(g) || g.removed_at || g.trashed_at) continue;
    const d = new Date(`${g.target_date}T12:00:00`);
    const days = differenceInCalendarDays(d, today);
    if (days >= -7 && days <= 14) rows.push({ id: g.id, d, days, what: g.title || "Untitled", kind: "by date", page: g.id });
  }
  const byId = new Map(goals.map((g) => [g.id, g]));
  for (const s of liveSteps(steps)) {
    if (s.kind !== "todo" && s.kind !== "plan") continue;
    if (!byId.has(s.goal_id)) continue;
    const st = stepState(s, ctx);
    if (st.done || !st.linked) continue;
    const raw = s.kind === "todo" ? st.linked.due_date : (st.linked.timestamp || st.linked.planned_date);
    if (!raw) continue;
    const d = s.kind === "todo" || /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? new Date(`${String(raw).slice(0, 10)}T12:00:00`) : new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const days = differenceInCalendarDays(d, today);
    if (days >= -7 && days <= 14) rows.push({ id: s.id, d, days, what: st.linked.title || st.linked.activity_name || s.title || "Step", kind: s.kind === "todo" ? "to-do" : "plan", page: s.goal_id });
  }
  return rows.sort((a, b) => a.d - b.d);
}

export function dueWhen(r) {
  if (r.days < 0) return "late";
  if (r.days === 0) return "Today";
  if (r.days < 7) return format(r.d, "EEE");
  return format(r.d, "MMM d");
}

/** Points that come round again (a routine, time each week). */
export function repeatRows({ goals = [], steps = [], ctx = {} }) {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const rows = [];
  for (const s of liveSteps(steps)) {
    const g = byId.get(s.goal_id);
    if (!g || !isOpenGoal(g)) continue;
    const st = stepState(s, ctx);
    if (!st.ongoing) continue;
    let what = s.title || "";
    if (s.kind === "rhythm") what = what || `${s.weekly_minutes || 0} min a week`;
    if (s.kind === "daily_task") what = st.linked?.title || what || "Routine";
    if (s.kind === "activity_count") what = what || `${s.target_count || 1} times a week`;
    if (s.kind === "deck_study") what = what || `${s.target_minutes || 0} min study a week`;
    rows.push({ id: s.id, goalId: g.id, what: `${g.title ? `${g.title}: ` : ""}${what}`, status: st.done ? "done" : s.kind === "daily_task" ? "routine" : "this week" });
  }
  return rows;
}

/** The points on one page that count by themselves (board 20's "Points: what counts"). */
const KIND_WORDS = {
  check: "tick", todo: "to-do", todos: "to-dos", activity_count: "times", plan: "plan", daily_task: "routine",
  rhythm: "time a week", list_done: "finish a list", deck_cards: "make cards", deck_study: "study",
};
export function pagePoints(pageId, { steps = [], ctx = {} }) {
  return liveSteps(steps).filter((s) => s.goal_id === pageId && s.kind && s.kind !== "check").map((s) => {
    const st = stepState(s, ctx);
    const v = st.target ? `${st.current ?? 0} of ${st.target}` : st.done ? "done" : "open";
    return { id: s.id, what: s.title || KIND_WORDS[s.kind] || "Point", kind: KIND_WORDS[s.kind] || s.kind, value: v, done: !!st.done };
  });
}

/** The page's own measure row: so far, against the target and the even pace. */
export function pageProgress(page, { index, steps, ctx, activities = [], pageIds = [page?.id], now = new Date(), weekStartsOn = 1 }) {
  const target = wordTargetOf(page);
  const heading = sectionHeading(index, page);
  const words = heading || page.child_section_style || target ? pageWordCount(index, steps, page.id) : 0;
  const { done, total } = subtreeProgress(index, steps, ctx, page.id);
  const weekStart = goalWeekWindow(now, weekStartsOn).start;
  const ids = new Set(pageIds);
  let weekWords = 0, weekMin = 0;
  for (const a of pageActs(activities)) {
    if (!ids.has(a.goal_id)) continue;
    const w = activityWhen(a);
    if (!w || w < weekStart) continue;
    weekWords += wordsOf(a);
    weekMin += countableMinutes(a) || 0;
  }
  const byWords = words > 0 || !!target;
  const startD = page.created_date ? new Date(page.created_date) : null;
  const endD = page.target_date ? new Date(`${page.target_date}T12:00:00`) : null;
  const paceFrac = startD && endD && endD > startD ? Math.max(0, Math.min(1, (now - startD) / (endD - startD))) : null;
  const goalN = byWords ? target : total;
  const curN = byWords ? words : done;
  return {
    byWords, current: curN, goal: goalN || 0, pct: goalN ? Math.min(100, (curN / goalN) * 100) : 0,
    pace: paceFrac != null && goalN ? paceFrac * 100 : null, paceValue: paceFrac != null && goalN ? Math.round(paceFrac * goalN) : null,
    start: startD, end: endD, weekWords, weekMin, empty: !byWords && total === 0 && weekMin === 0,
  };
}

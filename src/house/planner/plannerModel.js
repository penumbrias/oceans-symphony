// The house's Planner room (plan step 5.1, board 04-Planner and board
// 48-ActivityEditorPhone), as pure rules: which page and view is showing
// (Day · Week · Month · Year · Plans list, and Insights), the stretch of
// time on screen and how the arrows move it, where each entry sits in a
// day column and how it looks (done, still to do, needs a decision,
// skipped, called off), the all-day row (events, dates from profiles,
// plans with no time, to-dos with a due day), the week's counts, the plans
// that need a decision, the month and year grids, the plans list and the
// addresses that land on the room (?date=, ?view=, ?activityId=, ?event=).
//
// PURE: records in, what to draw out. Nothing here writes a record.
// Tested in scripts/test-house-planner.mjs.

import { format } from "date-fns";
import { statusFor, isPastTimeScheduled } from "@/lib/activityStatus";
import { layoutDay } from "@/lib/planner/layout";
import { eventsOnDay } from "@/lib/plannerEventDates";
import { getAncestorIds, indexById } from "@/lib/categoryTreeUtils";
import { categoryIdOf } from "@/lib/planner/rollup";
import { formatClock } from "@/lib/planner/displayPrefs";
import { dayKeyOf, parseDayKey, startOfWeek } from "@/house/day/dayView";

export { dayKeyOf, parseDayKey, startOfWeek };

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// ── Pages and views ────────────────────────────────────────────────────
// The calendar's zooms, the room's pages, and the one radio row board 04
// draws (Day · Week · Month · Year · Plans list). The keys are the old
// planner's, so a person's remembered view carries between the houses.
export const PLANNER_VIEWS = Object.freeze(["day", "week", "month", "year"]);
export const PLANNER_SECTIONS = Object.freeze(["calendar", "plans", "insights"]);
export const PLANNER_PICKS = Object.freeze([
  { id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" },
  { id: "year", label: "Year" }, { id: "plans", label: "Plans list" },
]);
export const VIEW_KEY = "symphony_planner_view_v1";
export const SECTION_KEY = "symphony_planner_section_v1";
const OLD_VIEW_KEY = "symphony_act_view_mode";

const readJson = (store, k) => { try { const v = store?.getItem(k); return v == null ? null : JSON.parse(v); } catch { return null; } };

/** The page and zoom the person last left the planner on (either house). */
export function readPlannerState(store) {
  const v = readJson(store, VIEW_KEY) ?? readJson(store, OLD_VIEW_KEY);
  const s = readJson(store, SECTION_KEY);
  return {
    view: PLANNER_VIEWS.includes(v) ? v : "week",
    section: PLANNER_SECTIONS.includes(s) ? s : "calendar",
  };
}

/** Remember the page and zoom (best-effort: storage may be off). */
export function writePlannerState(store, { view, section }) {
  try {
    if (PLANNER_VIEWS.includes(view)) store?.setItem(VIEW_KEY, JSON.stringify(view));
    if (PLANNER_SECTIONS.includes(section)) store?.setItem(SECTION_KEY, JSON.stringify(section));
    return true;
  } catch { return false; }
}

/** Which radio is on: the zoom on the calendar, "plans" on the list, none on Insights. */
export function pickOf({ section, view }) {
  if (section === "plans") return "plans";
  if (section === "calendar") return view;
  return null;
}

/** The page and zoom a radio press leads to (the zoom is kept when the list is picked). */
export function stateForPick(pick, current) {
  if (pick === "plans") return { section: "plans", view: current.view };
  if (PLANNER_VIEWS.includes(pick)) return { section: "calendar", view: pick };
  return current;
}

// ── The stretch of time on screen ──────────────────────────────────────
/** { from, to, days } for a zoom; the list and Insights follow the week. */
export function rangeOf(view, anchor, weekStart = 1) {
  const a = startOfDay(anchor);
  if (view === "day") return { from: a, to: addDays(a, 1), days: [a] };
  if (view === "month") {
    const from = new Date(a.getFullYear(), a.getMonth(), 1);
    const to = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    return { from, to, days: [] };
  }
  if (view === "year") return { from: new Date(a.getFullYear(), 0, 1), to: new Date(a.getFullYear() + 1, 0, 1), days: [] };
  const from = startOfWeek(a, weekStart);
  return { from, to: addDays(from, 7), days: Array.from({ length: 7 }, (_, i) => addDays(from, i)) };
}

/** Board 04's range words: "Nov 16 to 22", "Fri Nov 20", "November 2026", "2026". */
export function rangeWords(view, anchor, weekStart = 1) {
  const a = startOfDay(anchor);
  if (view === "day") return format(a, "EEE MMM d");
  if (view === "month") return format(a, "MMMM yyyy");
  if (view === "year") return format(a, "yyyy");
  const { from } = rangeOf("week", a, weekStart);
  const last = addDays(from, 6);
  if (from.getFullYear() !== last.getFullYear()) return `${format(from, "MMM d yyyy")} to ${format(last, "MMM d yyyy")}`;
  if (from.getMonth() !== last.getMonth()) return `${format(from, "MMM d")} to ${format(last, "MMM d")}`;
  return `${format(from, "MMM d")} to ${format(last, "d")}`;
}

/** The arrows step by what the calendar shows (a day, a week, a month, a year). */
export function stepAnchor(view, anchor, dir) {
  const a = startOfDay(anchor);
  if (view === "day") return addDays(a, dir);
  if (view === "month") return new Date(a.getFullYear(), a.getMonth() + dir, Math.min(a.getDate(), 28));
  if (view === "year") return new Date(a.getFullYear() + dir, a.getMonth(), Math.min(a.getDate(), 28));
  return addDays(a, 7 * dir);
}

/** Does the stretch on screen hold today? (Today is greyed when it does.) */
export function holdsToday(view, anchor, weekStart = 1, now = new Date()) {
  const { from, to } = rangeOf(view === "day" || view === "month" || view === "year" ? view : "week", anchor, weekStart);
  return now >= from && now < to;
}

// ── One entry ──────────────────────────────────────────────────────────
/** Minutes an entry takes on the calendar (what happened, else what was planned). */
export function entryMinutes(a) {
  const actual = Number(a?.actual_duration_minutes);
  if (Number.isFinite(actual) && actual > 0) return actual;
  const planned = Number(a?.duration_minutes);
  return Number.isFinite(planned) && planned > 0 ? planned : 0;
}

/** { start, end } for a timed entry (end null when it has no length), else null. */
export function entrySpan(a) {
  if (!a?.timestamp) return null;
  const start = new Date(a.timestamp);
  if (Number.isNaN(start.getTime())) return null;
  const mins = entryMinutes(a);
  return { start, end: mins ? new Date(start.getTime() + mins * 60000) : null };
}

// How an entry looks (board 04): done and logged are filled in their
// colour; a plan still to come is dashed in its colour; a plan whose time
// has passed with nobody saying how it went is dashed in the warning
// colour ("needs a decision"); skipped is grey and struck; called off is
// grey, struck and faded. Words go with every look, never colour alone.
export const TONE_WORDS = Object.freeze({
  done: "done", logged: "logged", partial: "partly done", plan: "planned",
  open: "needs a decision", skipped: "skipped", cancelled: "called off", todo: "to-do", running: "running now",
});

export function entryTone(a, now = new Date()) {
  if (a?._isTask) return "todo";
  if (a?._live) return "running";
  const st = statusFor(a);
  if (st === "done") return "done";
  if (st === "logged") return "logged";
  if (st === "partial") return "partial";
  if (st === "skipped") return "skipped";
  if (st === "cancelled") return "cancelled";
  if (st === "scheduled") {
    if (isPastTimeScheduled(a, 0) && entryEnd(a, now)) return "open";
    return "plan";
  }
  return "logged";
}
// A plan "needs a decision" once its END has passed (a plan running over
// now is still on).
function entryEnd(a, now) {
  const s = entrySpan(a);
  if (!s) return false;
  const end = s.end || s.start;
  return end.getTime() <= now.getTime();
}

/** An entry's colour: its own tag, else its category's, else the nearest coloured parent's. */
export function colourOf(a, byId = {}) {
  if (a?.color) return a.color;
  const cid = categoryIdOf(a);
  if (!cid) return null;
  if (byId[cid]?.color) return byId[cid].color;
  for (const pid of getAncestorIds(cid, byId)) if (byId[pid]?.color) return byId[pid].color;
  return null;
}

/** A filter for the categories hidden on this device: hidden with their whole branch (cycle-guarded). */
export function hiddenFilter(categories = [], hiddenIds = []) {
  if (!hiddenIds?.length) return () => false;
  const byId = indexById(categories);
  const hidden = new Set(hiddenIds);
  const isHidden = (cid) => !!cid && (hidden.has(cid) || getAncestorIds(cid, byId).some((p) => hidden.has(p)));
  return (a) => {
    const ids = Array.isArray(a?.activity_category_ids) && a.activity_category_ids.length ? a.activity_category_ids : [categoryIdOf(a)];
    return ids.some(isHidden);
  };
}

/** "8 AM" / "08" for a ruler hour (board 04's gutter), per the clock preference. */
export function hourWords(hour, fmt) {
  if (fmt !== "ampm") return `${String(hour).padStart(2, "0")}:00`;
  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}
/** "10 AM" / "12:30 PM" / "10:00" for an entry's start. */
export function clockWords(minutes, fmt) {
  if (fmt !== "ampm") return formatClock(minutes, "24");
  const whole = Math.round(minutes);
  const h = Math.floor(whole / 60) % 24, m = whole % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

// ── The day columns ────────────────────────────────────────────────────
// Each day: its blocks (laid out side by side when they overlap, real
// times, a block that crosses midnight drawn on both days) and its all-day
// row: events (payday), dates from profiles (birthdays), plans with a day
// but no time, and to-dos due that day.
export function dayColumns({ days = [], activities = [], tasks = [], events = [], dates = [], byId = {}, now = new Date(), fmt = "24", nameOfDate = (x) => x.fieldName }) {
  const todayKey = dayKeyOf(now);
  return days.map((day) => {
    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart.getTime() + DAY);
    const key = dayKeyOf(dayStart);
    const timed = [];
    const allDay = [];
    for (const ev of eventsOnDay(events, dayStart)) {
      allDay.push({ key: `ev:${ev.event.id}:${ev.key}`, kind: "event", label: ev.event.title || "Event", event: ev.event, occurrenceKey: ev.key, colour: ev.event.tag_color || null });
    }
    for (const d of dates) {
      if (d.month === dayStart.getMonth() + 1 && d.day === dayStart.getDate()) {
        allDay.push({ key: `date:${d.alterId}:${d.fieldName}`, kind: "date", label: nameOfDate(d), date: d, colour: d.color || null });
      }
    }
    for (const a of activities) {
      if (!a) continue;
      if (!a.timestamp) {
        if (a.planned_date && dayKeyOf(new Date(a.planned_date)) === key) {
          allDay.push({ key: `a:${a.id}`, kind: "untimed", label: a.activity_name || "Activity", item: a, tone: entryTone(a, now), colour: colourOf(a, byId) });
        }
        continue;
      }
      const s = entrySpan(a);
      if (!s) continue;
      const touches = s.end ? (s.start < dayEnd && s.end > dayStart) : (s.start >= dayStart && s.start < dayEnd);
      if (touches) timed.push({ ...a, _item: a, start: s.start, end: s.end });
    }
    for (const t of tasks) {
      if (!t?._isTask) continue;
      const at = new Date(t.timestamp);
      if (Number.isNaN(at.getTime()) || at < dayStart || at >= dayEnd) continue;
      if (t._dueOnly) allDay.push({ key: t.id, kind: "todo", label: t.activity_name || "To-do", item: t, tone: "todo" });
      else timed.push({ ...t, _item: t, start: at, end: new Date(at.getTime() + 30 * 60000) });
    }
    const blocks = layoutDay(timed, dayStart).map((b) => ({
      key: b.id,
      item: b._item,
      startMin: b.startMin,
      endMin: b.endMin,
      left: b.left,
      width: b.width,
      continuesBefore: b.continuesBefore,
      continuesAfter: b.continuesAfter,
      tone: entryTone(b._item, now),
      colour: b._item?._isTask ? null : colourOf(b._item, byId),
      label: b._item?.activity_name || (b._item?._isTask ? "To-do" : "Activity"),
      time: clockWords(b.startMin, fmt),
    }));
    return { day: dayStart, key, today: key === todayKey, blocks, allDay };
  });
}

/** Where the now line sits in a day column (0 to 1), or null on other days. */
export function nowFraction(day, now = new Date()) {
  const s = startOfDay(day).getTime();
  const t = now.getTime();
  return t >= s && t < s + DAY ? (t - s) / DAY : null;
}

// The drag maths live with the kit block that draws the columns.
export { dragRange, dragBlock } from "@/house/kit/timeColumnsModel";

// ── The week's numbers (board 04's status line and "This week") ────────
/** "18 plans, 9 logs, 2 events" for a stretch. */
export function weekCounts({ activities = [], events = [], from, to }) {
  let plans = 0, logs = 0, eventsN = 0;
  for (const a of activities) {
    const when = a?.timestamp ? new Date(a.timestamp) : a?.planned_date ? new Date(a.planned_date) : null;
    if (!when || when < from || when >= to) continue;
    if (statusFor(a) === "logged") logs += 1; else plans += 1;
  }
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) eventsN += eventsOnDay(events, d).length;
  return { plans, logs, events: eventsN };
}

export function countWords({ plans, logs, events }) {
  const w = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;
  return `${w(plans, "plan")}, ${w(logs, "log")}, ${w(events, "event")}`;
}

/** Plans whose time has passed and nobody said how they went, newest first. */
export function needsDecision(activities = [], now = new Date()) {
  return activities
    .filter((a) => a && !a._isTask && statusFor(a) === "scheduled" && entryEnd(a, now))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/** The time on the top categories this week (or the activities when nothing is filed). */
export function topTotals(totals, categories = [], activities = [], { max = 5 } = {}) {
  const byId = indexById(categories);
  const roots = (totals?.categories || []).filter((c) => byId[c.key] && !byId[c.key].parent_category_id);
  const rows = (roots.length ? roots : (totals?.categories || []).filter((c) => byId[c.key])).slice(0, max)
    .map((c) => ({ key: c.key, label: byId[c.key]?.name || c.label, minutes: c.minutes, colour: byId[c.key]?.color || null }));
  if (rows.length) return rows;
  const byName = new Map(activities.map((a) => [a?.activity_name || "Untitled", a]));
  return (totals?.activities || []).slice(0, max)
    .map((a) => ({ key: a.key, label: a.label, minutes: a.minutes, colour: colourOf(byName.get(a.key), byId) }));
}

/** "2 h", "2 h 10", "45 m" (board 04's totals). */
export function hoursWords(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m} m`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

// ── Month and year ─────────────────────────────────────────────────────
/** A month's grid: whole weeks, days outside the month marked. */
export function monthCells(month, weekStart = 1) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const out = [];
  for (let d = startOfWeek(first, weekStart); d <= last || out.length % 7; d = addDays(d, 1)) {
    out.push({ date: d, key: dayKeyOf(d), inMonth: d.getMonth() === month.getMonth() });
    if (out.length > 42) break;
  }
  return out;
}

/** The weekday letters for a grid's header (M T W T F S S). */
export function weekdayLetters(weekStart = 1) {
  const base = startOfWeek(new Date(2026, 10, 18), weekStart);
  return Array.from({ length: 7 }, (_, i) => format(addDays(base, i), "EEEEE"));
}

/** Per day: what's on it (names, in time order), plans still open, and how many. */
export function entriesByDay(activities = [], { from, to } = {}) {
  const out = new Map();
  for (const a of activities) {
    if (!a) continue;
    const when = a.timestamp ? new Date(a.timestamp) : a.planned_date ? new Date(a.planned_date) : null;
    if (!when || Number.isNaN(when.getTime())) continue;
    if (from && (when < from || when >= to)) continue;
    const k = dayKeyOf(when);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(a);
  }
  for (const list of out.values()) list.sort((x, y) => new Date(x.timestamp || x.planned_date) - new Date(y.timestamp || y.planned_date));
  return out;
}

/** The year: twelve months, each with its count of entries and the days that hold any. */
export function yearMonths(year, activities = [], events = []) {
  const byDay = entriesByDay(activities, { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1) });
  return Array.from({ length: 12 }, (_, m) => {
    const month = new Date(year, m, 1);
    let count = 0;
    const busy = new Map();
    for (const [k, list] of byDay) {
      const d = parseDayKey(k);
      if (d && d.getMonth() === m) { count += list.length; busy.set(k, list.length); }
    }
    const eventDays = new Set();
    for (let d = month; d.getMonth() === m; d = addDays(d, 1)) if (eventsOnDay(events, d).length) eventDays.add(dayKeyOf(d));
    return { month, label: format(month, "MMMM"), count, busy, eventDays };
  });
}

// ── The plans list ─────────────────────────────────────────────────────
// Still to do: Needs a decision, Today, This week, Later (a repeating
// series is ONE row: the next one, and how many are ahead). Resolved: the
// outcomes, newest first.
export function plansListGroups(activities = [], { now = new Date(), weekStart = 1, resolved = false, limit = 60 } = {}) {
  const real = activities.filter((a) => a && !a._isTask);
  if (resolved) {
    const done = real.filter((a) => ["done", "partial", "skipped", "cancelled"].includes(statusFor(a)) && (a.timestamp || a.planned_date))
      .sort((a, b) => new Date(b.timestamp || b.planned_date) - new Date(a.timestamp || a.planned_date));
    return [{ id: "resolved", label: "Resolved", rows: done.slice(0, limit).map((a) => ({ key: a.id, item: a, count: 1 })), more: Math.max(0, done.length - limit) }];
  }
  const open = needsDecision(real, now);
  const openIds = new Set(open.map((a) => a.id));
  const todayEnd = addDays(startOfDay(now), 1);
  const weekEnd = addDays(startOfWeek(now, weekStart), 7);
  const ahead = real.filter((a) => statusFor(a) === "scheduled" && !openIds.has(a.id))
    .sort((a, b) => new Date(a.timestamp || a.planned_date) - new Date(b.timestamp || b.planned_date));
  const seen = new Map();
  const rows = [];
  for (const a of ahead) {
    const g = a.recurrence_group_id;
    if (g && seen.has(g)) { seen.get(g).count += 1; continue; }
    const row = { key: g ? `series:${g}` : a.id, item: a, count: 1, series: !!g };
    if (g) seen.set(g, row);
    rows.push(row);
  }
  const when = (r) => new Date(r.item.timestamp || r.item.planned_date);
  const groups = [
    { id: "open", label: "Needs a decision", rows: open.map((a) => ({ key: a.id, item: a, count: 1 })) },
    { id: "today", label: "Today", rows: rows.filter((r) => when(r) < todayEnd) },
    { id: "week", label: "This week", rows: rows.filter((r) => when(r) >= todayEnd && when(r) < weekEnd) },
    { id: "later", label: "Later", rows: rows.filter((r) => when(r) >= weekEnd) },
  ];
  return groups.filter((g) => g.rows.length);
}

/** "Fri 12:30" / "Fri Nov 27 · any time" for a list row. */
export function whenWords(a, fmt = "24", now = new Date()) {
  if (!a) return "";
  if (!a.timestamp) {
    if (!a.planned_date) return "";
    const d = new Date(a.planned_date);
    return `${format(d, dayKeyOf(d) === dayKeyOf(now) ? "'Today'" : "EEE MMM d")} · any time`;
  }
  const d = new Date(a.timestamp);
  const clock = clockWords(d.getHours() * 60 + d.getMinutes(), fmt);
  const sameWeek = Math.abs(d - now) < 6 * DAY;
  return `${format(d, sameWeek ? "EEE" : "EEE MMM d")} ${clock}`;
}

// ── Addresses that land on the room ────────────────────────────────────
// The old page's deep links, read the same way: ?date=YYYY-MM-DD starts on
// that day; ?view= picks the zoom; ?activityId= (or the older ?highlight=)
// opens that entry's details; ?event= opens that planner event (on ?date=).
export const PLANNER_LANDING_PARAMS = Object.freeze(["date", "view", "activityId", "highlight", "event"]);

export function plannerLanding(search) {
  let q;
  try { q = new URLSearchParams(search || ""); } catch { q = new URLSearchParams(); }
  const view = q.get("view");
  const date = parseDayKey(q.get("date") || "");
  const out = {
    date,
    view: PLANNER_VIEWS.includes(view) ? view : view === "plans" ? "plans" : null,
    activityId: q.get("activityId") || q.get("highlight") || null,
    eventId: q.get("event") || null,
  };
  out.any = PLANNER_LANDING_PARAMS.some((k) => q.has(k));
  return out;
}

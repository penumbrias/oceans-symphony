// Planner events — the date maths (pure, no entity access, so node tests
// can import it). See plannerEvents.js for the save path.
//
// An event is a DATE, not a plan: payday, a birthday, an anniversary. It
// has no time and no length, never needs marking done, and a repeating one
// is ONE record with a rule (owner ask, 2026-11-04) — so "every 2 weeks"
// and "every year" run on forever instead of stopping at a 52-row series.
//
// Record: { title, date: "YYYY-MM-DD" (the first one), repeat, until:
// "YYYY-MM-DD" | null, skipped_dates: ["YYYY-MM-DD"], notes, tag_color,
// alter_ids }.
//
// Occurrences are counted from the FIRST date (offset n), never stepped
// from the one before, so a 31st-of-the-month event lands on the 30th in
// short months and back on the 31st after, and a Feb 29 birthday shows on
// Feb 28 in other years (date-fns clamps to the month's last day).

import { advanceOccurrence } from "./recurrenceIntervals.js";

export const EVENT_REPEATS = Object.freeze(["none", "weekly", "biweekly", "monthly", "yearly"]);

const PERIOD_DAYS = { weekly: 7, biweekly: 14, monthly: 30.4375, yearly: 365.25 };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const repeatOf = (ev) => (EVENT_REPEATS.includes(ev?.repeat) ? ev.repeat : "none");

// "YYYY-MM-DD" → local noon (noon, so no timezone can push it onto the
// day before). Null for anything else.
export function parseDayKey(s) {
  if (typeof s !== "string" || !DAY_RE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const out = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(out.getTime()) ? null : out;
}

export function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const noonOf = (date) => { const d = new Date(date); d.setHours(12, 0, 0, 0); return d; };

// Every occurrence of one event between two days (inclusive, by day).
// Returns [{ event, date: Date (local noon), key: "YYYY-MM-DD" }].
export function occurrencesBetween(ev, from, to, { max = 500 } = {}) {
  const first = parseDayKey(ev?.date);
  if (!first) return [];
  const lo = noonOf(from).getTime();
  const hi = noonOf(to).getTime();
  if (hi < lo) return [];
  const until = parseDayKey(ev.until);
  const untilMs = until ? until.getTime() : Infinity;
  const skipped = new Set(Array.isArray(ev.skipped_dates) ? ev.skipped_dates : []);
  const repeat = repeatOf(ev);
  const out = [];
  const push = (d) => {
    const key = dayKey(d);
    if (!skipped.has(key)) out.push({ event: ev, date: d, key });
  };
  if (repeat === "none") {
    const t = first.getTime();
    if (t >= lo && t <= hi) push(first);
    return out;
  }
  // Jump close to the window, then walk (a couple of steps early, so a
  // clamped month end can't be missed).
  const approx = Math.floor((lo - first.getTime()) / (PERIOD_DAYS[repeat] * 86400000)) - 2;
  for (let n = Math.max(0, approx); out.length < max; n += 1) {
    const d = noonOf(advanceOccurrence(first, n, repeat));
    const t = d.getTime();
    if (t > hi || t > untilMs) break;
    if (t >= lo) push(d);
  }
  return out;
}

export function occursOn(ev, day) {
  return occurrencesBetween(ev, day, day).length > 0;
}

// Every event on one day: [{ event, date, key }].
export function eventsOnDay(events, day) {
  const out = [];
  for (const ev of events || []) out.push(...occurrencesBetween(ev, day, day));
  return out;
}

// The next occurrence on or after `from` (default today), within ~2 years.
export function nextOccurrence(ev, from = new Date()) {
  const horizon = new Date(from); horizon.setFullYear(horizon.getFullYear() + 2);
  return occurrencesBetween(ev, from, horizon, { max: 1 })[0] || null;
}

// Coming up across every event, soonest first. `to` caps the window;
// `limit` caps the count.
export function upcomingOccurrences(events, { from = new Date(), to = null, limit = 20 } = {}) {
  const end = to || (() => { const d = new Date(from); d.setFullYear(d.getFullYear() + 1); return d; })();
  const all = [];
  for (const ev of events || []) all.push(...occurrencesBetween(ev, from, end, { max: limit }));
  all.sort((a, b) => a.date - b.date || String(a.event.title || "").localeCompare(String(b.event.title || "")));
  return all.slice(0, limit);
}

// Is the series over (its last date has passed)?
export function eventIsPast(ev, today = new Date()) {
  return !nextOccurrence(ev, today);
}

// The number of whole years since the first date — "turns 30", "5th
// anniversary" — for a yearly event, or null.
export function yearsSinceFirst(ev, occurrenceDate) {
  if (repeatOf(ev) !== "yearly") return null;
  const first = parseDayKey(ev.date);
  if (!first || !occurrenceDate) return null;
  const n = occurrenceDate.getFullYear() - first.getFullYear();
  return n > 0 ? n : null;
}

// ── Reminders (v0.350.0) ─────────────────────────────────────────────
// An event's `reminders` is a list of how many days before each date to
// remind (0 = on the day, 1 = the day before, 7 = a week before), at
// `reminder_time` ("HH:MM", default 09:00) local time.

export const EVENT_REMINDER_DAYS = Object.freeze([0, 1, 7]);
export const DEFAULT_EVENT_REMINDER_TIME = "09:00";

export function reminderDaysOf(ev) {
  const list = Array.isArray(ev?.reminders) ? ev.reminders : [];
  return [...new Set(list.map(Number).filter((n) => EVENT_REMINDER_DAYS.includes(n)))].sort((a, b) => a - b);
}

export function reminderTimeOf(ev) {
  const t = ev?.reminder_time;
  return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : DEFAULT_EVENT_REMINDER_TIME;
}

// Every reminder that should fire after `now` and within `horizonDays`,
// soonest first: [{ event, occurrence, daysBefore, fireMs }].
export function eventReminderFires(events, { now = Date.now(), horizonDays = 45, limit = 24 } = {}) {
  const nowMs = typeof now === "number" ? now : new Date(now).getTime();
  const horizonMs = nowMs + horizonDays * 86400000;
  const from = new Date(nowMs);
  const to = new Date(horizonMs + 8 * 86400000); // a date up to a week past the horizon can still fire inside it
  const out = [];
  for (const ev of events || []) {
    const days = reminderDaysOf(ev);
    if (!days.length || !ev?.id) continue;
    const [hh, mm] = reminderTimeOf(ev).split(":").map(Number);
    for (const occ of occurrencesBetween(ev, from, to, { max: 60 })) {
      for (const daysBefore of days) {
        const fire = new Date(occ.date);
        fire.setDate(fire.getDate() - daysBefore);
        fire.setHours(hh, mm, 0, 0);
        const fireMs = fire.getTime();
        if (fireMs > nowMs && fireMs <= horizonMs) out.push({ event: ev, occurrence: occ, daysBefore, fireMs });
      }
    }
  }
  out.sort((a, b) => a.fireMs - b.fireMs);
  return out.slice(0, limit);
}

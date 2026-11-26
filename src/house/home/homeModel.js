// The house's Home room, as pure rules (the approved mockups, boards 01-Main
// and 08-Phone). PURE: records in, what to draw out. Writes nothing; every
// button the room draws goes through the record's own write path
// (resolvePlan, setFront, checkinEntry, dailyTaskSystem).
//
// Tested in scripts/test-house-home.mjs.

import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { activityDate } from "@/lib/dateUtils";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// ── Today's plans: "From Planner" (desktop) and "Coming up" (phone) ────
// Each item: { key, kind, title, time (Date|null), tone, action, activity?, event? }
//   kind "event"   — an all-day date (payday, a birthday): label "event"
//   kind "next"    — the soonest plan still ahead today: action "start"
//   kind "planned" — later plans today, and plans with no time: label "planned"
//   kind "open"    — a plan whose time passed and isn't resolved: action "resolve"
// Order: events, then open plans (oldest first), then the rest by time.
export function todayPlanItems({ activities = [], events = [], now = new Date(), title = (a) => a?.activity_name || "Activity" } = {}) {
  const today = dayKey(now);
  const out = [];
  for (const occ of events || []) {
    const ev = occ?.event || occ;
    if (!ev) continue;
    out.push({ key: `ev:${ev.id || ev.title}:${today}`, kind: "event", title: ev.title || ev.name || "Event", time: null, event: ev });
  }
  const planned = [];
  for (const a of activities || []) {
    if (!a || a.trashed_at) continue;
    if (statusFor(a) !== ACTIVITY_STATUSES.SCHEDULED) continue;
    const untimed = !a.timestamp && !!a.planned_date;
    const when = untimed ? null : activityDate(a);
    const day = untimed ? a.planned_date : dayKey(when);
    if (day !== today) continue;
    planned.push({ a, when });
  }
  const timed = planned.filter((p) => p.when).sort((x, y) => x.when - y.when);
  const open = timed.filter((p) => p.when.getTime() < now.getTime());
  const ahead = timed.filter((p) => p.when.getTime() >= now.getTime());
  for (const p of open) out.push({ key: p.a.id, kind: "open", title: title(p.a), time: p.when, activity: p.a, action: "resolve" });
  ahead.forEach((p, i) => out.push({ key: p.a.id, kind: i === 0 ? "next" : "planned", title: title(p.a), time: p.when, activity: p.a, action: i === 0 ? "start" : null }));
  for (const p of planned.filter((x) => !x.when)) out.push({ key: p.a.id, kind: "planned", title: title(p.a), time: null, activity: p.a, action: null });
  return out;
}

/** "Walk, 20 min" — the plan's name with its planned length. */
export function planTitle(a) {
  const name = a?.activity_name || "Activity";
  const mins = Number(a?.duration_minutes) || 0;
  if (mins <= 0) return name;
  if (mins < 60) return `${name}, ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${name}, ${h} h${m ? ` ${m} min` : ""}`;
}

// ── The guide: one thing that wants attention, at a time ───────────────
// The oldest plan from today that passed without being resolved (the
// mockup's "Lunch didn't get ticked off. Did it happen?"), else nothing
// (the guide just greets).
export function guideItem(planItems = []) {
  const open = planItems.find((p) => p.kind === "open");
  if (!open) return null;
  return { kind: "resolve", key: open.key, activity: open.activity, title: open.title };
}

// ── A window of time drawn left to right ───────────────────────────────
export function dayWindow(day) {
  const start = startOfDay(day).getTime();
  return { start, end: start + DAY_MS };
}

/** The next `hours` hours from now, starting on the hour before it. */
export function nextHoursWindow(now = new Date(), hours = 6) {
  const s = new Date(now); s.setMinutes(0, 0, 0);
  const start = s.getTime();
  return { start, end: start + hours * 60 * MIN };
}

/** A span in a window, as left/width percentages; null when outside it. */
export function spanIn(win, start, end, { minWidth = 0 } = {}) {
  const a = toMs(start);
  const b = end == null ? a : toMs(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (b < win.start || a > win.end) return null;
  const len = win.end - win.start;
  const l = Math.max(a, win.start);
  const r = Math.min(Math.max(b, a), win.end);
  const left = ((l - win.start) / len) * 100;
  const width = Math.max(minWidth, ((r - l) / len) * 100);
  return { left: round(left), width: round(Math.min(width, 100 - left)) };
}

/** Hour ticks for a window: every `step` hours, as { at: Date, left }. */
export function hourTicks(win, step = 2) {
  const out = [];
  const first = new Date(win.start);
  first.setMinutes(0, 0, 0);
  if (first.getTime() < win.start) first.setHours(first.getHours() + 1);
  for (let t = first.getTime(); t <= win.end; t += step * 60 * MIN) {
    out.push({ at: new Date(t), left: round(((t - win.start) / (win.end - win.start)) * 100) });
  }
  return out;
}

function toMs(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (!v) return NaN;
  return new Date(v).getTime();
}
const round = (n) => Math.round(n * 100) / 100;

// ── Routines (the mockup's "Routines  Lv 4  120 xp") ───────────────────
// Rows for today's routines: the person ticks "tap" ones; "auto" ones tick
// themselves when the thing they track happens.
export function routineRows(templates = [], { isDue = () => true, isDone = () => false } = {}) {
  return (templates || [])
    .filter((t) => t && t.is_active !== false && !t.trashed_at && isDue(t))
    .map((t) => ({ template: t, done: !!isDone(t), how: t.mode === "AUTO" ? "auto" : "tap" }))
    .sort((a, b) => (a.done === b.done ? (a.template.sort_order ?? 0) - (b.template.sort_order ?? 0) : (a.done ? 1 : -1)));
}

/** The latest status note (newest timestamp), skipping trashed rows. */
export function latestStatus(notes = []) {
  let best = null;
  for (const n of notes || []) {
    if (!n || n.trashed_at || !n.note) continue;
    if (!best || String(n.timestamp || "") > String(best.timestamp || "")) best = n;
  }
  return best;
}

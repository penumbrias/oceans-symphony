// The layered timeline's views, as pure rules (boards 01-Main, 08-Phone and
// 09-TimelineOptions): which stretch of time is on screen (a day, six
// hours or a week), how the arrows and "Now" move it, its ruler, how the
// days in it are put together, "Whose" (one {alter}'s records, or
// everyone's), and the addresses that land on it (?date=, ?focusSessionId=,
// ?highlightStatus=, ?view=).
//
// PURE: records in, what to draw out. Nothing here writes a record.
// Tested in scripts/test-house-timeline.mjs.

import { journalAuthorIds } from "@/lib/journalAuthors";

export const DAY_RANGES = Object.freeze(["day", "hours6", "week"]);
const HOUR = 60 * 60 * 1000;

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const dayKeyOf = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

/** "YYYY-MM-DD" → a local Date at midnight, or null. */
export function parseDayKey(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const x = new Date(y, m - 1, d);
  return dayKeyOf(x) === s ? x : null;
}

/** The first day of the week holding `d` (weekStart: 0 Sunday … 6 Saturday). */
export function startOfWeek(d, weekStart = 1) {
  const x = startOfDay(d);
  const back = (x.getDay() - weekStart + 7) % 7;
  return addDays(x, -back);
}

/** The words the range picker uses: Home's are board 09's, the room's say what they show. */
export function rangeLabels(page) {
  return page === "home"
    ? { day: "Today", hours6: "Next 6 h", week: "Week" }
    : { day: "Day", hours6: "6 hours", week: "Week" };
}

/** Where a range starts when it is "now". */
export function nowAnchor(range, now = new Date(), weekStart = 1) {
  if (range === "week") return startOfWeek(now, weekStart).getTime();
  if (range === "hours6") { const x = new Date(now); x.setMinutes(0, 0, 0); return x.getTime(); }
  return startOfDay(now).getTime();
}

/** Where a range starts to show a given day (today: around now). */
export function anchorForDay(range, day, now = new Date(), weekStart = 1) {
  if (range === "week") return startOfWeek(day, weekStart).getTime();
  if (range === "hours6") {
    if (dayKeyOf(day) === dayKeyOf(now)) return nowAnchor("hours6", now);
    const x = startOfDay(day); x.setHours(8); return x.getTime();
  }
  return startOfDay(day).getTime();
}

/** The stretch on screen: { start, end } in ms. */
export function viewWindow(range, anchor, weekStart = 1) {
  if (range === "week") { const s = startOfWeek(anchor, weekStart); return { start: s.getTime(), end: addDays(s, 7).getTime() }; }
  if (range === "hours6") { const s = new Date(anchor); s.setMinutes(0, 0, 0); return { start: s.getTime(), end: s.getTime() + 6 * HOUR }; }
  const s = startOfDay(anchor);
  return { start: s.getTime(), end: addDays(s, 1).getTime() };
}

/** The previous (-1) or next (+1) stretch. */
export function stepAnchor(range, anchor, dir, weekStart = 1) {
  const d = dir < 0 ? -1 : 1;
  if (range === "week") return addDays(startOfWeek(anchor, weekStart), 7 * d).getTime();
  if (range === "hours6") return new Date(anchor).getTime() + 6 * HOUR * d;
  return addDays(startOfDay(anchor), d).getTime();
}

/** Is "now" inside the stretch? (The now line shows; "Now" is pressed.) */
export function holdsNow(range, anchor, now = new Date(), weekStart = 1) {
  const w = viewWindow(range, anchor, weekStart);
  const t = new Date(now).getTime();
  return t >= w.start && t < w.end;
}

/** Changing range keeps the day the person was looking at. */
export function switchRange(fromRange, anchor, toRange, now = new Date(), weekStart = 1) {
  const w = viewWindow(fromRange, anchor, weekStart);
  if (fromRange === toRange) return anchor;
  if (holdsNow(fromRange, anchor, now, weekStart)) return nowAnchor(toRange, now, weekStart);
  // A week opens on its first day; a day or six hours on the day it shows.
  return anchorForDay(toRange, new Date(w.start), now, weekStart);
}

/** The calendar days a stretch touches (local midnights). */
export function daysOf(win) {
  const out = [];
  for (let d = startOfDay(win.start); d.getTime() < win.end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The ruler: hours for a day (every 2) or six hours (every hour); days for a week. */
export function rulerTicks(range, win) {
  const span = win.end - win.start;
  const pct = (t) => Math.round(((t - win.start) / span) * 10000) / 100;
  if (range === "week") return daysOf(win).map((d) => ({ at: d, left: pct(d.getTime()), day: true }));
  const step = range === "hours6" ? 1 : 2;
  const out = [];
  const first = new Date(win.start); first.setMinutes(0, 0, 0);
  if (first.getTime() < win.start) first.setHours(first.getHours() + 1);
  for (let t = first.getTime(); t <= win.end; t += step * HOUR) out.push({ at: new Date(t), left: pct(t) });
  return out;
}

// Slices are made per day (sliceTimelineDay); a stretch over several days
// is their union. A record that spans midnight shows up in both days, so
// rows are kept once by id.
const LIST_KEYS = ["sessions", "activities", "emotions", "journals", "checkIns", "bulletins", "tasks", "symptomSessions", "symptomCheckIns", "locations", "statusNotes", "sleeps", "lineageEvents", "diaryCards", "polls", "reminderInstances", "reflections", "alterNotes", "importantDates", "plannerEvents", "doses"];

export function mergeSlices(slices = []) {
  const out = { hasData: false };
  for (const k of LIST_KEYS) out[k] = [];
  const seen = Object.fromEntries(LIST_KEYS.map((k) => [k, new Set()]));
  for (const s of slices) {
    if (!s) continue;
    out.hasData = out.hasData || !!s.hasData;
    for (const k of LIST_KEYS) {
      for (const r of s[k] || []) {
        const id = k === "plannerEvents" ? `${r?.event?.id || r?.id || ""}:${s.dateStr || ""}` : (r && r.id) || null;
        if (id != null && seen[k].has(id)) continue;
        if (id != null) seen[k].add(id);
        out[k].push(r);
      }
    }
  }
  // Routines are per day; a stretch keeps the last day's (the day view's one).
  out.dailyProgress = slices.length ? slices[slices.length - 1]?.dailyProgress || null : null;
  out.dateStr = slices[0]?.dateStr || null;
  return out;
}

// ── Whose (board 09) ──────────────────────────────────────────────────
// Everyone a record names: who it was by, for, or written by.
export function attributedIds(r) {
  if (!r || typeof r !== "object") return [];
  const ids = new Set();
  for (const k of ["alter_id", "primary_alter_id", "author_alter_id", "to_alter_id"]) if (r[k]) ids.add(r[k]);
  for (const k of ["co_fronter_ids", "fronting_alter_ids", "author_alter_ids", "co_author_alter_ids", "alter_ids"]) {
    if (Array.isArray(r[k])) for (const id of r[k]) if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * One {alter}'s day: their fronting, and every record that names them.
 * Dates, events and routines belong to everyone and stay. With no alter,
 * the slice comes back as it was.
 */
export function filterWhose(slice, alterId) {
  if (!alterId || !slice) return slice;
  const names = (r) => attributedIds(r).includes(alterId);
  const out = { ...slice };
  out.sessions = (slice.sessions || []).filter((s) => (s.alter_id ? s.alter_id === alterId : names(s)))
    // A legacy grouped row draws its other members too; keep only this one.
    .map((s) => (s.alter_id ? s : { ...s, primary_alter_id: alterId, co_fronter_ids: [] }));
  for (const k of ["activities", "emotions", "symptomCheckIns", "symptomSessions", "locations", "statusNotes", "sleeps", "checkIns", "bulletins", "tasks", "diaryCards", "polls", "reflections", "alterNotes", "doses", "lineageEvents", "reminderInstances"]) {
    out[k] = (slice[k] || []).filter((r) => (k === "lineageEvents"
      ? [...(r.source_alter_ids || []), ...(r.result_alter_ids || [])].includes(alterId)
      : names(r)));
  }
  out.journals = (slice.journals || []).filter((j) => journalAuthorIds(j).includes(alterId));
  return out;
}

/** In a week, each day's dates and events become a mark on that day. */
export function weekEventItems(daySlices = []) {
  const out = [];
  for (const s of daySlices) {
    if (!s) continue;
    const noon = (() => { const d = parseDayKey(s.dateStr); if (!d) return null; d.setHours(12); return d; })();
    if (!noon) continue;
    for (const occ of s.plannerEvents || []) {
      const ev = occ?.event || occ;
      out.push({ key: `ev:${ev?.id || ev?.title}:${s.dateStr}`, kind: "dot", start: noon, label: ev?.title || "Event", ref: { type: "event", id: ev?.id, record: ev } });
    }
    (s.importantDates || []).forEach((x, i) => {
      out.push({ key: `date:${s.dateStr}:${i}`, kind: "dot", start: noon, label: x.label || x.title || "A date", ref: { type: "date", record: x } });
    });
  }
  return out;
}

// ── Addresses that land on the timeline ───────────────────────────────
//   ?date=YYYY-MM-DD           that day
//   ?focusSessionId=<id>&edit=1  that {fronting} session picked (edit: its form opens)
//   ?highlightStatus=<id>      that status note picked
//   ?view=day|hours6|week      the range (one visit; the saved Show stays)
export function landingFrom(search) {
  let q;
  try { q = new URLSearchParams(search || ""); } catch { q = new URLSearchParams(); }
  const date = parseDayKey(q.get("date"));
  const view = DAY_RANGES.includes(q.get("view")) ? q.get("view") : null;
  return {
    date,
    view,
    focusSessionId: q.get("focusSessionId") || null,
    edit: q.get("edit") === "1",
    highlightStatus: q.get("highlightStatus") || null,
    any: !!(date || view || q.get("focusSessionId") || q.get("highlightStatus")),
  };
}

/** The one-visit parameters a landing reads, taken off once used. */
export const LANDING_PARAMS = Object.freeze(["focusSessionId", "edit", "highlightStatus"]);

/**
 * Where a landing goes, once the records are loaded:
 * { day: Date|null, pick: { key, label, ref }|null, edit: bool }.
 */
export function resolveLanding(landing, { sessions = [], statusNotes = [] } = {}, nameOf = () => "") {
  if (!landing) return { day: null, pick: null, edit: false };
  if (landing.focusSessionId) {
    const s = sessions.find((x) => x && x.id === landing.focusSessionId);
    if (s) {
      const alterId = s.alter_id || s.primary_alter_id || null;
      return {
        day: startOfDay(new Date(s.start_time)),
        pick: { key: `${s.id}:${alterId}`, label: nameOf(alterId), ref: { type: "session", id: s.id, record: s, alterId } },
        edit: landing.edit,
      };
    }
  }
  if (landing.highlightStatus) {
    const n = statusNotes.find((x) => x && x.id === landing.highlightStatus);
    if (n) return { day: startOfDay(new Date(n.timestamp)), pick: { key: n.id, label: "Status note", ref: { type: "status", id: n.id, record: n } }, edit: false };
  }
  return { day: landing.date || null, pick: null, edit: false };
}

/** A time typed as "HH:MM" on a day → ISO; null if it can't be read. */
export function timeOnDay(day, hhmm) {
  if (typeof hhmm !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const d = startOfDay(day); d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** "HH:MM" for a moment (rounded down to `step` minutes). */
export function hhmmOf(at, step = 1) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const m = Math.floor(d.getMinutes() / step) * step;
  return `${String(d.getHours()).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

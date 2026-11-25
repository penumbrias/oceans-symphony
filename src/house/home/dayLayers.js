// The Home room's timeline dock, as pure rules (board 01-Main's "Timeline"
// and "Layers", board 09-TimelineOptions). One day's records, read from the
// timeline's own slice (sliceTimelineDay, the same slice the Timeline page,
// its widget and the old pixel dock draw), grouped the way the mockup
// groups them:
//
//   Fronting   one lane per {alter} who was in front that day
//   Plans      Planned · Logged, with the day's events written across
//   Check-ins  Feelings · Symptoms · Sleep · Status notes
//   (hidden until shown) Locations · Journals
//
// PURE: it only DISPLAYS. Nothing here writes a record. Which layers show
// is a device preference (layerPrefs.js).
//
// Tested in scripts/test-house-home.mjs.

import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { activityDate } from "@/lib/dateUtils";
import { journalEntryDate } from "@/lib/journalDate";
import { redactWhispers } from "@/lib/whisperRedact";

// Every layer the dock knows. `color` is a house colour role (CSS custom
// property), so the person's paint reaches it; alters keep their own colour.
export const DAY_LAYERS = Object.freeze([
  { id: "fronting", group: "fronting", label: "Fronting", color: "var(--house-text)", source: "sessions" },
  { id: "planned", group: "plans", label: "Planned", color: "var(--house-accent)", source: "Planner" },
  { id: "logged", group: "plans", label: "Logged", color: "var(--house-info)", source: "Planner" },
  { id: "events", group: "plans", label: "Events", color: "var(--house-accent-text)", source: "Planner" },
  { id: "feelings", group: "checkins", label: "Feelings", color: "var(--house-good)", source: "check-ins" },
  { id: "symptoms", group: "checkins", label: "Symptoms", color: "var(--house-danger)", source: "check-ins" },
  { id: "sleep", group: "checkins", label: "Sleep", color: "var(--house-wave)", source: "Sleep" },
  { id: "statuses", group: "checkins", label: "Status notes", color: "var(--house-note)", source: "Home" },
  { id: "locations", group: "more", label: "Locations", color: "var(--house-info)", source: "Locations" },
  { id: "journals", group: "more", label: "Journals", color: "var(--house-good)", source: "Journals" },
]);
export const DEFAULT_HIDDEN_LAYERS = Object.freeze(["locations", "journals"]);

export const DAY_GROUPS = Object.freeze([
  { id: "fronting", label: "Fronting", color: "var(--house-text)" },
  { id: "plans", label: "Plans", color: "var(--house-accent)" },
  { id: "checkins", label: "Check-ins", color: "var(--house-good)" },
  { id: "more", label: "More", color: "var(--house-info)" },
]);

// Whisper secrets never reach the dock (they are masked first).
const plain = (s) => redactWhispers(String(s || "")).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const membersOf = (s) => (s.alter_id ? [s.alter_id] : [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean));
const emotionNames = (e) => (Array.isArray(e.emotions) ? e.emotions : [])
  .map((x) => (typeof x === "string" ? x : x?.name || x?.label)).filter(Boolean);

// A plan's look on the lane: done / partial (filled), skipped or cancelled
// (struck), still open after its time (dashed, warning), still ahead (dashed).
export function planTone(a, now = Date.now()) {
  const st = statusFor(a);
  if (st === ACTIVITY_STATUSES.DONE || st === ACTIVITY_STATUSES.PARTIAL) return "done";
  if (st === ACTIVITY_STATUSES.SKIPPED || st === ACTIVITY_STATUSES.CANCELLED) return "skipped";
  if (st === ACTIVITY_STATUSES.LOGGED) return "logged";
  const t = activityDate(a).getTime();
  return t < now ? "open" : "plan";
}

/**
 * The day's lanes.
 *   slice: sliceTimelineDay(src, day)
 *   opts: { alters (by id map), categories (by id map), symptoms (by id map),
 *           nameOf(alterId) → label, now (ms) }
 * Returns { groups: [{ id, label, color, rows: [{ id, layer, label, color, items }] }], allDay: [...] }
 * Items: { key, kind: "bar"|"dot", start, end, label, tone?, color?, ref: { type, id, record } }
 */
export function buildDayLanes(slice, { alters = {}, categories = {}, symptoms = {}, nameOf = (id) => alters[id]?.name || "Unknown", now = Date.now() } = {}) {
  const d = slice || {};
  const rows = { fronting: [], plans: [], checkins: [], more: [] };

  // Fronting: a lane per alter, in the order they first came forward.
  const byAlter = new Map();
  for (const s of d.sessions || []) {
    for (const id of membersOf(s)) {
      if (!byAlter.has(id)) byAlter.set(id, []);
      byAlter.get(id).push(s);
    }
  }
  const firstStart = (list) => Math.min(...list.map((s) => new Date(s.start_time).getTime()));
  for (const [id, list] of [...byAlter.entries()].sort((a, b) => firstStart(a[1]) - firstStart(b[1]))) {
    rows.fronting.push({
      id: `alter:${id}`, layer: "fronting", label: nameOf(id), color: alters[id]?.color || null, alterId: id,
      items: list.map((s) => ({
        key: `${s.id}:${id}`, kind: "bar", start: s.start_time, end: s.end_time || null,
        label: nameOf(id), color: alters[id]?.color || null, ref: { type: "session", id: s.id, record: s, alterId: id },
      })),
    });
  }

  // Plans: planned vs logged.
  const planned = []; const logged = [];
  for (const a of d.activities || []) {
    const tone = planTone(a, now);
    const start = activityDate(a);
    const mins = Math.max(0, Number(a.actual_duration_minutes ?? a.duration_minutes) || 0);
    const item = {
      key: a.id, kind: mins > 0 ? "bar" : "dot", start, end: mins > 0 ? new Date(start.getTime() + mins * 60000) : null,
      label: a.activity_name || "Activity", tone, color: categories[a.parent_category_id]?.color || null,
      ref: { type: "activity", id: a.id, record: a },
    };
    (tone === "logged" ? logged : planned).push(item);
  }
  rows.plans.push({ id: "planned", layer: "planned", label: "Planned", items: planned });
  rows.plans.push({ id: "logged", layer: "logged", label: "Logged", items: logged });
  const allDay = [
    ...(d.plannerEvents || []).map((occ) => {
      const ev = occ?.event || occ;
      return { key: `ev:${ev?.id || ev?.title}`, label: ev?.title || "Event", ref: { type: "event", id: ev?.id, record: ev } };
    }),
    ...(d.importantDates || []).map((x, i) => ({ key: `date:${i}:${x.label || x.title || ""}`, label: x.label || x.title || "A date", ref: { type: "date", record: x } })),
  ];

  // Check-ins.
  rows.checkins.push({
    id: "feelings", layer: "feelings", label: "Feelings",
    items: (d.emotions || []).map((e) => ({
      key: e.id, kind: "dot", start: e.timestamp, label: emotionNames(e).join(", ") || "Check-in", ref: { type: "emotion", id: e.id, record: e },
    })),
  });
  rows.checkins.push({
    id: "symptoms", layer: "symptoms", label: "Symptoms",
    items: [
      ...(d.symptomSessions || []).map((s) => {
        const def = symptoms[s.symptom_id || s.symptom_definition_id];
        return { key: `ss:${s.id}`, kind: "bar", start: s.start_time, end: s.end_time || null, label: def?.name || def?.label || "Symptom", ref: { type: "symptomSession", id: s.id, record: s } };
      }),
      ...(d.symptomCheckIns || []).map((c) => {
        const def = symptoms[c.symptom_id];
        const name = def?.name || def?.label || "Symptom";
        return { key: `sc:${c.id}`, kind: "dot", start: c.timestamp, label: c.intensity != null ? `${name} ${c.intensity}` : name, ref: { type: "symptomCheckIn", id: c.id, record: c } };
      }),
    ],
  });
  rows.checkins.push({
    id: "sleep", layer: "sleep", label: "Sleep",
    items: (d.sleeps || []).filter((s) => s.bedtime).map((s) => ({
      key: s.id, kind: "bar", start: s.bedtime, end: s.wake_time || null, label: "Sleep", ref: { type: "sleep", id: s.id, record: s },
    })),
  });
  rows.checkins.push({
    id: "statuses", layer: "statuses", label: "Status notes",
    items: (d.statusNotes || []).map((n) => ({
      key: n.id, kind: "dot", start: n.timestamp, label: clip(plain(n.note), 24), ref: { type: "status", id: n.id, record: n },
    })),
  });
  rows.more.push({
    id: "locations", layer: "locations", label: "Locations",
    items: (d.locations || []).map((l) => ({ key: l.id, kind: "dot", start: l.timestamp, label: l.name || "Location", ref: { type: "location", id: l.id, record: l } })),
  });
  rows.more.push({
    id: "journals", layer: "journals", label: "Journals",
    items: (d.journals || []).map((j) => ({
      key: j.id, kind: "dot", start: journalEntryDate(j), label: j.is_encrypted ? "Locked journal" : (j.title || "Journal entry"), ref: { type: "journal", id: j.id, record: j },
    })),
  });

  const groups = DAY_GROUPS.map((g) => ({ ...g, rows: rows[g.id] }));
  return { groups, allDay };
}

/** Rows whose layer is hidden are left out; a group with no rows left is left out too. */
export function visibleGroups(lanes, hidden = []) {
  const off = new Set(hidden);
  return (lanes?.groups || [])
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !off.has(r.layer)) }))
    .filter((g) => g.rows.length || (g.id === "plans" && !off.has("events") && (lanes.allDay || []).length));
}

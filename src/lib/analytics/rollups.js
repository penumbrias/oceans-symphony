// Domain rollups for the new analytics engine. Everything the Overview tab
// (and later, the domain tabs) renders is computed here — components stay
// presentation-only. Each rollup returns plain JSON-ish objects and is safe
// to memoise on the raw query arrays + range.
//
// Fronting numbers use sessionNormalizer (sweep-line, both legacy + per-alter
// row models, no Date.now() leakage) — NEVER recompute fronting time ad hoc.

import { normalizeSessions, sessionsInRange, sliceByOverlap } from "@/lib/sessionNormalizer";
import { toMs, dayKey, bucketByDay, inRange, DAY_MS } from "./range";
import { dailySeries, baseline, trend, deviation } from "./baselines";

const HOUR_MS = 60 * 60 * 1000;

// ---------- Fronting ----------

// Switches/day = number of session STARTS per day (a co-front group start
// counts once per underlying row in the individual model; legacy group rows
// count once — descriptive, and consistent across the app's history).
export function frontingRollup({ sessions, range, priorRangeObj, baselineRange }) {
  const now = range.now;
  const normalized = normalizeSessions(sessions || [], now);

  const starts = normalized
    .map((s) => ({ ms: s.startMs }))
    .filter((s) => s.ms != null);

  const switchesSeries = dailySeries(starts, (s) => s.ms, range, { kind: "count" });
  const priorSwitches = priorRangeObj ? dailySeries(starts, (s) => s.ms, priorRangeObj, { kind: "count" }) : null;
  const baseSwitches = baselineRange ? dailySeries(starts, (s) => s.ms, baselineRange, { kind: "count" }) : null;

  // Total fronted time inside the range via the overlap slicer (union time —
  // co-fronting doesn't double count here).
  const inWin = sessionsInRange(normalized, range.fromMs, range.toMs, now);
  const slices = sliceByOverlap(inWin, range.fromMs, range.toMs, now);
  let frontedMs = 0;
  const perAlterMs = new Map();
  const distinctFronters = new Set();
  for (const slice of slices) {
    const dur = slice.endMs - slice.startMs;
    if (dur <= 0) continue;
    frontedMs += dur;
    for (const id of slice.aliveAlterIds) {
      distinctFronters.add(id);
      perAlterMs.set(id, (perAlterMs.get(id) || 0) + dur);
    }
  }

  // Co-front pair counts (per underlying overlap occurrence day) for the
  // "often front together" insight. Counted as distinct DAYS a pair
  // overlapped, which reads naturally in a sentence.
  const pairDays = new Map(); // "idA|idB" (sorted) -> Set of dayKeys
  for (const slice of slices) {
    if (slice.aliveAlterIds.size < 2) continue;
    const ids = [...slice.aliveAlterIds].sort();
    const day = dayKey(slice.startMs);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        if (!pairDays.has(key)) pairDays.set(key, new Set());
        pairDays.get(key).add(day);
      }
    }
  }
  const coFrontPairs = [...pairDays.entries()]
    .map(([key, days]) => {
      const [a, b] = key.split("|");
      return { a, b, days: days.size };
    })
    .sort((x, y) => y.days - x.days);

  return {
    switchesSeries,
    switchesTrend: priorSwitches ? trend(switchesSeries, priorSwitches) : null,
    switchesBaseline: baseSwitches ? baseline(baseSwitches) : null,
    frontedMs,
    frontedHours: frontedMs / HOUR_MS,
    perAlterMs,
    distinctFronters: distinctFronters.size,
    coFrontPairs,
    switchesTotal: switchesSeries.reduce((a, p) => a + (p.value || 0), 0),
  };
}

// ---------- Emotions ----------

export function emotionRollup({ emotionCheckIns, range, priorRangeObj, baselineRange }) {
  const getMs = (c) => toMs(c.timestamp || c.created_date);
  const all = emotionCheckIns || [];

  const countSeries = dailySeries(all, getMs, range, { kind: "count" });
  const inWin = all.filter((c) => inRange(getMs(c), range));

  const emotionCounts = new Map();
  let distressCount = 0;
  let intensitySum = 0, intensityN = 0;
  for (const c of inWin) {
    for (const e of c.emotions || []) {
      if (!e) continue;
      emotionCounts.set(e, (emotionCounts.get(e) || 0) + 1);
    }
    if (c.is_distress) distressCount++;
    const val = Number(c.intensity);
    if (Number.isFinite(val) && val > 0) { intensitySum += val; intensityN++; }
  }
  const topEmotions = [...emotionCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const distressSeries = dailySeries(all.filter((c) => c.is_distress), getMs, range, { kind: "count" });
  const priorDistress = priorRangeObj ? dailySeries(all.filter((c) => c.is_distress), getMs, priorRangeObj, { kind: "count" }) : null;

  return {
    countSeries,
    countTrend: priorRangeObj ? trend(countSeries, dailySeries(all, getMs, priorRangeObj, { kind: "count" })) : null,
    countBaseline: baselineRange ? baseline(dailySeries(all, getMs, baselineRange, { kind: "count" })) : null,
    checkInsTotal: inWin.length,
    topEmotions,
    distressCount,
    distressTrend: priorDistress ? trend(distressSeries, priorDistress) : null,
    avgIntensity: intensityN ? intensitySum / intensityN : null,
  };
}

// ---------- Sleep ----------

function sleepStartMs(rec) {
  return toMs(rec.start_time || rec.bedtime || (rec.date ? `${rec.date}T12:00:00` : null) || rec.created_date);
}

function sleepDurationHours(rec) {
  const explicit = Number(rec.duration_minutes);
  if (Number.isFinite(explicit) && explicit > 0) return explicit / 60;
  const start = toMs(rec.start_time || rec.bedtime);
  const end = toMs(rec.end_time || rec.wake_time);
  if (start != null && end != null && end > start) return (end - start) / HOUR_MS;
  return null;
}

export function sleepRollup({ sleepRecords, range, baselineRange }) {
  const all = (sleepRecords || []).map((r) => ({ ...r, __ms: sleepStartMs(r), __hours: sleepDurationHours(r) }))
    .filter((r) => r.__ms != null);

  const mkSeries = (rng) => dailySeries(
    all.filter((r) => r.__hours != null),
    (r) => r.__ms,
    rng,
    { kind: "value", getValue: (items) => items.reduce((a, r) => a + r.__hours, 0) },
  );

  const hoursSeries = mkSeries(range);
  const inWin = all.filter((r) => inRange(r.__ms, range));
  const withHours = inWin.filter((r) => r.__hours != null);
  const qualities = inWin.map((r) => Number(r.quality)).filter((q) => Number.isFinite(q) && q > 0);

  return {
    hoursSeries,
    nightsLogged: inWin.length,
    avgHours: withHours.length ? withHours.reduce((a, r) => a + r.__hours, 0) / withHours.length : null,
    avgQuality: qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : null,
    hoursBaseline: baselineRange ? baseline(mkSeries(baselineRange)) : null,
  };
}

// ---------- Activities ----------

const COUNTED_STATUSES = new Set(["logged", "done", "partial"]);

function activityMinutes(a) {
  const actual = Number(a.actual_duration_minutes);
  if (Number.isFinite(actual) && actual > 0) return actual;
  const planned = Number(a.duration_minutes);
  if (Number.isFinite(planned) && planned > 0) return planned;
  return 0;
}

export function activityRollup({ activities, range, baselineRange }) {
  const getMs = (a) => toMs(a.timestamp || a.created_date);
  // Status-aware: scheduled/skipped/cancelled don't count as things that
  // happened (mirrors ActivityTallyTracker's rules). Legacy rows without a
  // status count as logged.
  const counted = (activities || []).filter((a) => {
    const s = (a.status || "logged").toLowerCase();
    return COUNTED_STATUSES.has(s);
  });

  const mkMinutesSeries = (rng) => dailySeries(counted, getMs, rng, {
    kind: "count",
    getValue: (items) => items.reduce((acc, a) => acc + activityMinutes(a), 0),
  });

  const minutesSeries = mkMinutesSeries(range);
  const inWin = counted.filter((a) => inRange(getMs(a), range));

  return {
    minutesSeries,
    activitiesTotal: inWin.length,
    minutesTotal: inWin.reduce((acc, a) => acc + activityMinutes(a), 0),
    minutesBaseline: baselineRange ? baseline(mkMinutesSeries(baselineRange)) : null,
  };
}

// ---------- Presence (days you showed up) ----------
//
// A day is "present" when ANY log exists in any family. Powers the
// presence calendar — explicitly NOT a streak: gaps are neutral, and this
// doubles as an amnesia aid ("what did we do on the 12th?").
export function presenceRollup({ families, range }) {
  // families: array of { items, getMs }
  const present = new Map(); // dayKey -> count of logs
  for (const fam of families || []) {
    const buckets = bucketByDay(fam.items || [], fam.getMs, range);
    for (const [key, items] of buckets.entries()) {
      present.set(key, (present.get(key) || 0) + items.length);
    }
  }
  const daysPresent = [...present.keys()].length;
  return { presentByDay: present, daysPresent, daysInRange: range.days };
}

// Convenience for deviation phrasing shared by headline cards.
export function vsUsual(current, baselineObj) {
  if (!baselineObj || !baselineObj.sufficient) return { band: "unknown", pct: null };
  return deviation(current, baselineObj.mean);
}

export const __internal = { sleepDurationHours, activityMinutes, DAY_MS };

// Wellbeing-domain engine (Phase 3 of the analytics rebuild): the
// cross-domain lag correlations, after-distress recovery, pre-switch
// symptom signature, and annotated trend series.
//
// HARD RULES (analytics-rebuild-plan memory):
//   - Correlations use the Bearable 3+3 gate: at least 3 outcome-known days
//     WITH the factor and 3 WITHOUT, or nothing is reported.
//   - "Outcome-known" honesty: a day only counts toward a distress-rate
//     comparison when at least one emotion check-in exists that day —
//     an unlogged day is UNKNOWN, not "no distress".
//   - Everything returned is descriptive ("on days when…"); sentence
//     assembly happens in the component with terms + soft language.

import { normalizeSessions } from "@/lib/sessionNormalizer";
import { getAncestorIds } from "@/lib/categoryTreeUtils";
import { toMs, dayKey, inRange } from "./range";
import { dailySeries } from "./baselines";

const HOUR_MS = 3600000;

// ---------- Generic gated factor↔outcome comparison ----------
//
// factorDays: Set<dayKey> — days the factor was present
// outcomeByDay: Map<dayKey, number> — outcome value on OUTCOME-KNOWN days only
// Returns null when the 3+3 gate fails.
export function factorOutcome({ factorDays, outcomeByDay }) {
  const withVals = [];
  const withoutVals = [];
  for (const [key, value] of outcomeByDay.entries()) {
    if (factorDays.has(key)) withVals.push(value);
    else withoutVals.push(value);
  }
  if (withVals.length < 3 || withoutVals.length < 3) {
    return { gated: true, withN: withVals.length, withoutN: withoutVals.length };
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const withMean = mean(withVals);
  const withoutMean = mean(withoutVals);
  return {
    gated: false,
    withMean,
    withoutMean,
    withN: withVals.length,
    withoutN: withoutVals.length,
    diff: withMean - withoutMean,
  };
}

// Distress outcome map: dayKey -> 1 if any distress-flagged check-in that
// day, else 0 — ONLY for days that have at least one check-in.
export function distressOutcomeByDay(emotionCheckIns, range) {
  const byDay = new Map();
  for (const c of emotionCheckIns || []) {
    const ms = toMs(c.timestamp || c.created_date);
    if (ms == null || !inRange(ms, range)) continue;
    const key = dayKey(ms);
    const prev = byDay.get(key) || 0;
    byDay.set(key, c.is_distress ? 1 : prev);
  }
  return byDay;
}

// ---------- Sleep → next-day distress ----------
//
// Factor split is PERSONAL: nights at/above your own median sleep vs below
// (no external "8 hours" target). A night affects the day it ENDS on.
export function sleepVsNextDayDistress({ sleepRecords, emotionCheckIns, range }) {
  const hoursByAffectedDay = new Map();
  for (const r of sleepRecords || []) {
    const start = toMs(r.start_time || r.bedtime);
    const end = toMs(r.end_time || r.wake_time);
    let hours = Number(r.duration_minutes) > 0 ? Number(r.duration_minutes) / 60 : null;
    if (hours == null && start != null && end != null && end > start) hours = (end - start) / HOUR_MS;
    if (hours == null) continue;
    const affectedMs = end != null ? end : (start != null ? start + hours * HOUR_MS : null);
    if (affectedMs == null || !inRange(affectedMs, range)) continue;
    const key = dayKey(affectedMs);
    hoursByAffectedDay.set(key, (hoursByAffectedDay.get(key) || 0) + hours);
  }
  const observed = [...hoursByAffectedDay.values()].sort((a, b) => a - b);
  if (observed.length < 6) return { gated: true, nightsObserved: observed.length, need: 6 };
  const median = observed[Math.floor(observed.length / 2)];

  const factorDays = new Set();
  for (const [key, hours] of hoursByAffectedDay.entries()) {
    if (hours >= median) factorDays.add(key);
  }
  // Outcome restricted to days where sleep was logged at all (else the
  // factor itself is unknown for that day) AND a check-in exists.
  const distressAll = distressOutcomeByDay(emotionCheckIns, range);
  const outcomeByDay = new Map();
  for (const [key, val] of distressAll.entries()) {
    if (hoursByAffectedDay.has(key)) outcomeByDay.set(key, val);
  }
  const cmp = factorOutcome({ factorDays, outcomeByDay });
  return { ...cmp, medianHours: median };
}

// ---------- Activity category → distress (same day) ----------
export function activityCategoriesVsDistress({ activities, categories, emotionCheckIns, range, maxResults = 2 }) {
  const catById = {};
  for (const c of categories || []) catById[c.id] = c;
  const rootOf = (catId) => {
    if (!catId || !catById[catId]) return null;
    const ancestors = getAncestorIds(catId, categories || []);
    const rootId = ancestors.length ? ancestors[ancestors.length - 1] : catId;
    return catById[rootId] || catById[catId];
  };

  // Factor days per ROOT category (status-aware: things that happened).
  const factorDaysByRoot = new Map(); // rootId -> Set<dayKey>
  for (const a of activities || []) {
    const s = (a.status || "logged").toLowerCase();
    if (s === "scheduled" || s === "skipped" || s === "cancelled") continue;
    const ms = toMs(a.timestamp || a.created_date);
    if (ms == null || !inRange(ms, range)) continue;
    const root = rootOf(a.parent_category_id);
    if (!root) continue;
    if (!factorDaysByRoot.has(root.id)) factorDaysByRoot.set(root.id, new Set());
    factorDaysByRoot.get(root.id).add(dayKey(ms));
  }

  const outcomeByDay = distressOutcomeByDay(emotionCheckIns, range);
  const results = [];
  for (const [rootId, factorDays] of factorDaysByRoot.entries()) {
    const cmp = factorOutcome({ factorDays, outcomeByDay });
    if (cmp.gated) continue;
    results.push({ category: catById[rootId], ...cmp });
  }
  results.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return results.slice(0, maxResults);
}

// ---------- Contact time → distress (same day) ----------
export function encountersVsDistress({ encounters, emotionCheckIns, range }) {
  const factorDays = new Set();
  for (const e of encounters || []) {
    const ms = toMs(e.start_time || e.timestamp || e.created_date);
    if (ms == null || !inRange(ms, range)) continue;
    factorDays.add(dayKey(ms));
  }
  if (factorDays.size === 0) return { gated: true, withN: 0, withoutN: 0 };
  const outcomeByDay = distressOutcomeByDay(emotionCheckIns, range);
  return factorOutcome({ factorDays, outcomeByDay });
}

// ---------- After distress: recovery ----------
//
// For each distress-flagged check-in, find the NEXT check-in within
// `windowHours`. "Calmer" = lower numeric intensity (when both have one),
// or the next check-in not being distress-flagged (fallback when intensity
// is missing). Strengths-based: reported as "your next check-in was calmer
// N of M times", never as failure counts.
export function afterDistress({ emotionCheckIns, range, windowHours = 12 }) {
  const sorted = (emotionCheckIns || [])
    .map((c) => ({ c, ms: toMs(c.timestamp || c.created_date) }))
    .filter((x) => x.ms != null && inRange(x.ms, range))
    .sort((a, b) => a.ms - b.ms);

  const pairs = [];
  for (let i = 0; i < sorted.length; i++) {
    if (!sorted[i].c.is_distress) continue;
    const next = sorted.slice(i + 1).find((x) => x.ms - sorted[i].ms <= windowHours * HOUR_MS);
    if (!next) continue;
    const a = Number(sorted[i].c.intensity);
    const b = Number(next.c.intensity);
    let calmer;
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) calmer = b < a;
    else calmer = !next.c.is_distress;
    pairs.push({ calmer, minutes: Math.round((next.ms - sorted[i].ms) / 60000) });
  }
  if (pairs.length < 3) return { gated: true, pairsN: pairs.length, need: 3 };
  const calmerN = pairs.filter((p) => p.calmer).length;
  const calmerMinutes = pairs.filter((p) => p.calmer).map((p) => p.minutes).sort((a, b) => a - b);
  return {
    gated: false,
    pairsN: pairs.length,
    calmerN,
    medianCalmerMinutes: calmerMinutes.length ? calmerMinutes[Math.floor(calmerMinutes.length / 2)] : null,
    windowHours,
  };
}

// ---------- Pre-switch symptom signature ----------
//
// Which symptoms show up in the hours before tracked switches, compared
// with how often they show up in general. Lift > 1 = "more common than
// usual before a switch". Descriptive only.
export function preSwitchSignature({ sessions, symptomCheckIns, range, hoursBefore = 12, maxResults = 3 }) {
  const now = range.now;
  const switchStarts = normalizeSessions(sessions || [], now)
    .map((s) => s.startMs)
    .filter((ms) => ms >= range.fromMs && ms <= range.toMs)
    .sort((a, b) => a - b);
  if (switchStarts.length < 5) return { gated: true, switchesN: switchStarts.length, need: 5 };

  const checks = (symptomCheckIns || [])
    .map((c) => ({ c, ms: toMs(c.timestamp || c.created_date) }))
    .filter((x) => x.ms != null && inRange(x.ms, range));
  if (checks.length < 5) return { gated: true, switchesN: switchStarts.length, symptomsN: checks.length, need: 5 };

  const windowMs = hoursBefore * HOUR_MS;
  const totalWindowMs = range.toMs - range.fromMs;
  // Union of pre-switch windows (merge overlaps so a burst of switches
  // doesn't over-weight the "before" share of the timeline).
  const intervals = switchStarts.map((s) => [Math.max(range.fromMs, s - windowMs), s]);
  const merged = [];
  for (const [a, b] of intervals) {
    if (merged.length && a <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b);
    } else merged.push([a, b]);
  }
  const preMsTotal = merged.reduce((acc, [a, b]) => acc + (b - a), 0);
  const preShare = preMsTotal / Math.max(1, totalWindowMs);
  const inPre = (ms) => merged.some(([a, b]) => ms >= a && ms <= b);

  const perSymptom = new Map(); // symptom_id -> { pre, total }
  for (const { c, ms } of checks) {
    const id = c.symptom_id || c.label || "unknown";
    if (!perSymptom.has(id)) perSymptom.set(id, { pre: 0, total: 0 });
    const row = perSymptom.get(id);
    row.total++;
    if (inPre(ms)) row.pre++;
  }

  const rows = [];
  for (const [symptomId, { pre, total }] of perSymptom.entries()) {
    if (pre < 3) continue; // too few pre-switch observations to say anything
    const expected = total * preShare;
    const lift = expected > 0 ? pre / expected : null;
    if (lift == null || lift < 1.5) continue; // only clearly elevated
    rows.push({ symptomId, pre, total, lift });
  }
  rows.sort((a, b) => b.lift - a.lift);
  return { gated: false, rows: rows.slice(0, maxResults), switchesN: switchStarts.length, hoursBefore };
}

// ---------- Top symptoms ----------
export function topSymptoms({ symptomCheckIns, range, maxResults = 6 }) {
  const per = new Map(); // symptom_id -> { count, sevSum, sevN }
  for (const c of symptomCheckIns || []) {
    const ms = toMs(c.timestamp || c.created_date);
    if (ms == null || !inRange(ms, range)) continue;
    const id = c.symptom_id;
    if (!id) continue;
    if (!per.has(id)) per.set(id, { count: 0, sevSum: 0, sevN: 0 });
    const row = per.get(id);
    row.count++;
    const sev = Number(c.severity);
    if (Number.isFinite(sev) && sev > 0) { row.sevSum += sev; row.sevN++; }
  }
  return [...per.entries()]
    .map(([symptomId, r]) => ({ symptomId, count: r.count, avgSeverity: r.sevN ? r.sevSum / r.sevN : null }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxResults);
}

// ---------- Trend metric series + annotations ----------

export const WELLBEING_METRICS = [
  { id: "checkins", label: "Check-ins/day", kind: "count" },
  { id: "distress", label: "Distress/day", kind: "count" },
  { id: "intensity", label: "Avg intensity", kind: "value" },
  { id: "sleep", label: "Sleep hours", kind: "value" },
  { id: "symptoms", label: "Symptoms/day", kind: "count" },
];

export function metricSeries({ metric, range, emotionCheckIns, symptomCheckIns, sleepRecords }) {
  const emoMs = (c) => toMs(c.timestamp || c.created_date);
  switch (metric) {
    case "checkins":
      return dailySeries(emotionCheckIns || [], emoMs, range, { kind: "count" });
    case "distress":
      return dailySeries((emotionCheckIns || []).filter((c) => c.is_distress), emoMs, range, { kind: "count" });
    case "intensity":
      return dailySeries(
        (emotionCheckIns || []).filter((c) => Number(c.intensity) > 0),
        emoMs, range,
        { kind: "value", getValue: (items) => items.reduce((a, c) => a + Number(c.intensity), 0) / items.length },
      );
    case "sleep":
      return dailySeries(
        (sleepRecords || []).map((r) => {
          const start = toMs(r.start_time || r.bedtime);
          const end = toMs(r.end_time || r.wake_time);
          let hours = Number(r.duration_minutes) > 0 ? Number(r.duration_minutes) / 60 : null;
          if (hours == null && start != null && end != null && end > start) hours = (end - start) / HOUR_MS;
          return { __ms: end ?? start, __hours: hours };
        }).filter((r) => r.__ms != null && r.__hours != null),
        (r) => r.__ms, range,
        { kind: "value", getValue: (items) => items.reduce((a, r) => a + r.__hours, 0) },
      );
    case "symptoms":
      return dailySeries(symptomCheckIns || [], (c) => toMs(c.timestamp || c.created_date), range, { kind: "count" });
    default:
      return [];
  }
}

const CHANGE_EMOJI = { fusion: "🌀", split: "🌱", dormancy: "🌙", return: "🌅" };

// Lived-event markers for trend charts (SystemChangeEvents in range).
export function trendAnnotations({ systemChangeEvents, range }) {
  const out = [];
  for (const ev of systemChangeEvents || []) {
    const ms = toMs(ev.date);
    if (ms == null || !inRange(ms, range)) continue;
    out.push({
      key: dayKey(ms),
      emoji: CHANGE_EMOJI[ev.type] || "✦",
      label: ev.type ? ev.type.charAt(0).toUpperCase() + ev.type.slice(1) : "Change",
    });
  }
  return out;
}

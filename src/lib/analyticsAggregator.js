// Single source of truth for analytics math. Every analytics
// surface should pull from these functions instead of re-rolling
// its own useMemo aggregation. Centralising here means:
//   - date-range clamping happens in one place (no "5085h in 30d"
//     leak from unclosed sessions),
//   - activity status filtering happens in one place ("scheduled"
//     doesn't count as "done"),
//   - both fronting models (legacy group, new per-alter) are
//     resolved via the session normaliser,
//   - cross-surface numbers stay consistent (Top Emotions and
//     Check-In Intensity Trend can't drift apart),
//   - new charts can compose pre-computed rollups rather than
//     re-scanning every entity.
//
// All inputs are raw arrays from the entity layer; outputs are
// plain JSON-able objects so they're easy to memoise.

import { startOfDay, endOfDay, eachDayOfInterval, format } from "date-fns";
import {
  normalizeSessions,
  sessionsInRange,
  sliceByOverlap,
  staleOpenSessions,
} from "./sessionNormalizer";
import { statusFor, ACTIVITY_STATUSES } from "./activityStatus";

// ── Date helpers ────────────────────────────────────────────────────
// Normalises `from` / `to` Date instances into a stable range
// shape so every helper below can rely on the same windowing.
export function buildRange(from, to) {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();
  return { from, to, fromMs, toMs, now: Date.now() };
}

// ── Activity status filter ──────────────────────────────────────────
// The "did it actually happen" filter — everything that should be
// counted in totals / charts. Excludes scheduled, skipped,
// cancelled. PARTIAL counts (the user got most of it done).
export const COUNTED_ACTIVITY_STATUSES = new Set([
  ACTIVITY_STATUSES.LOGGED,
  ACTIVITY_STATUSES.DONE,
  ACTIVITY_STATUSES.PARTIAL,
]);

export function isCountedActivity(activity) {
  return COUNTED_ACTIVITY_STATUSES.has(statusFor(activity));
}

export function filterActivitiesInRange(activities, range) {
  return (activities || []).filter((a) => {
    if (!isCountedActivity(a)) return false;
    const t = new Date(a.timestamp).getTime();
    return t >= range.fromMs && t <= range.toMs;
  });
}

// ── Per-alter fronting rollup ───────────────────────────────────────
// Solo / co-fronting / total / primary time per alter for the
// window. Sweep-line slice attribution kills double-counting; the
// session normaliser kills the unclosed-session leak.
export function computeAlterFrontingTotals(sessions, alters, range) {
  const normalised = normalizeSessions(sessions, range.now);
  const inRange = sessionsInRange(normalised, range.fromMs, range.toMs, range.now);
  const slices = sliceByOverlap(inRange, range.fromMs, range.toMs, range.now);

  const byAlter = new Map();
  for (const alter of alters || []) {
    byAlter.set(alter.id, {
      alter,
      total: 0,
      solo: 0,
      cofronting: 0,
      primary: 0,
      sessionDurations: [],
      sessionCount: 0,
    });
  }

  // Solo / co-fronting / total via slices.
  for (const slice of slices) {
    const dur = slice.endMs - slice.startMs;
    if (dur <= 0) continue;
    const ids = [...slice.aliveAlterIds];
    const isSolo = ids.length === 1;
    for (const id of ids) {
      const row = byAlter.get(id);
      if (!row) continue;
      row.total += dur;
      if (isSolo) row.solo += dur;
      else row.cofronting += dur;
    }
  }

  // Per-session attribution: count + duration list + primary
  // attribution.
  for (const s of inRange) {
    const start = Math.max(s.startMs, range.fromMs);
    const end = s.endMs != null
      ? Math.min(s.endMs, range.toMs)
      : (s.isStale
          ? Math.min(s.startMs + 48 * 60 * 60 * 1000, range.toMs)
          : Math.min(range.now, range.toMs));
    const dur = Math.max(0, end - start);
    if (dur <= 0) continue;
    for (const id of s.alterIds) {
      const row = byAlter.get(id);
      if (!row) continue;
      row.sessionCount += 1;
      row.sessionDurations.push(dur);
      if (id === s.primaryAlterId) row.primary += dur;
    }
  }

  return {
    byAlter,
    rows: [...byAlter.values()],
    normalised,
    inRange,
    slices,
    stale: staleOpenSessions(inRange),
  };
}

// ── Co-fronting pair rollup ─────────────────────────────────────────
// For every pair of alters, returns the total overlap time and
// number of slice transitions where they co-existed. Multi-alter
// slices contribute to every pair they contain.
export function computeCoFrontingPairs(sessions, range) {
  const normalised = normalizeSessions(sessions, range.now);
  const inRange = sessionsInRange(normalised, range.fromMs, range.toMs, range.now);
  const slices = sliceByOverlap(inRange, range.fromMs, range.toMs, range.now);

  const pairs = new Map();
  for (const slice of slices) {
    const ids = [...slice.aliveAlterIds];
    if (ids.length < 2) continue;
    const dur = slice.endMs - slice.startMs;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const sorted = [ids[i], ids[j]].sort();
        const key = sorted.join("--");
        if (!pairs.has(key)) {
          pairs.set(key, { key, alterIdA: sorted[0], alterIdB: sorted[1], totalOverlap: 0, occurrences: 0 });
        }
        const p = pairs.get(key);
        p.totalOverlap += dur;
        p.occurrences += 1;
      }
    }
  }
  return [...pairs.values()].sort((a, b) => b.totalOverlap - a.totalOverlap);
}

// ── Activity rollups ────────────────────────────────────────────────
// Sum + count + per-category breakdown for the window. Filters
// out scheduled / cancelled / skipped.
export function computeActivityTotals(activities, categories, range) {
  const inRange = filterActivitiesInRange(activities, range);
  const catById = new Map((categories || []).map((c) => [c.id, c]));

  let totalCount = inRange.length;
  let totalMinutes = 0;
  const byCategory = new Map();
  const byDay = new Map();

  for (const a of inRange) {
    const dur = Number(a.actual_duration_minutes || a.duration_minutes || 0) || 0;
    totalMinutes += dur;
    const dayKey = format(new Date(a.timestamp), "yyyy-MM-dd");
    if (!byDay.has(dayKey)) byDay.set(dayKey, { day: dayKey, count: 0, minutes: 0 });
    const dayRow = byDay.get(dayKey);
    dayRow.count += 1;
    dayRow.minutes += dur;
    const catIds = a.activity_category_ids?.length ? a.activity_category_ids : [null];
    for (const id of catIds) {
      const key = id || "__uncategorised";
      if (!byCategory.has(key)) {
        const cat = id ? catById.get(id) : null;
        byCategory.set(key, {
          categoryId: id || null,
          name: cat?.name || a.activity_name || "Uncategorised",
          color: cat?.color || "#8b5cf6",
          count: 0,
          minutes: 0,
        });
      }
      const row = byCategory.get(key);
      row.count += 1;
      row.minutes += dur;
    }
  }

  return {
    inRange,
    totalCount,
    totalMinutes,
    avgMinutes: totalCount ? totalMinutes / totalCount : 0,
    byCategory: [...byCategory.values()].sort((a, b) => b.count - a.count),
    byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

// ── Plan lifecycle rollup ───────────────────────────────────────────
// Breakdown of plan resolutions over the window. Does NOT filter
// by the counted-status set above — the whole point is to surface
// scheduled / skipped / cancelled rates. Useful for "are my
// plans actually getting done?".
export function computePlanLifecycle(activities, range) {
  const counts = {
    [ACTIVITY_STATUSES.SCHEDULED]: 0,
    [ACTIVITY_STATUSES.DONE]: 0,
    [ACTIVITY_STATUSES.PARTIAL]: 0,
    [ACTIVITY_STATUSES.SKIPPED]: 0,
    [ACTIVITY_STATUSES.CANCELLED]: 0,
    [ACTIVITY_STATUSES.LOGGED]: 0,
  };
  let totalPlans = 0;
  for (const a of activities || []) {
    const t = new Date(a.timestamp).getTime();
    if (t < range.fromMs || t > range.toMs) continue;
    // Only count rows the user actually treated as a plan
    // (is_planned flag OR a non-logged lifecycle status).
    const st = statusFor(a);
    if (st === ACTIVITY_STATUSES.LOGGED && !a.is_planned) continue;
    counts[st] = (counts[st] || 0) + 1;
    totalPlans += 1;
  }
  const resolved = totalPlans - counts[ACTIVITY_STATUSES.SCHEDULED];
  const completionRate = resolved > 0
    ? (counts[ACTIVITY_STATUSES.DONE] + counts[ACTIVITY_STATUSES.PARTIAL] * 0.5) / resolved
    : 0;
  return { counts, totalPlans, resolved, completionRate };
}

// ── Goal completion rollup ──────────────────────────────────────────
// For every weekly goal: total minutes actually achieved in the
// window vs target. Goals are weekly so the calling code should
// pass a range covering one ISO week for a meaningful "this
// week" view; or roll multiple weeks for trends.
export function computeGoalProgress(goals, activities, range) {
  const inRange = filterActivitiesInRange(activities, range);
  const out = [];
  for (const goal of goals || []) {
    const catId = goal.category_id || goal.parent_category_id;
    if (!catId) continue;
    const targetMinutes = Number(goal.target_minutes ?? (goal.target_hours || 0) * 60) || 0;
    if (targetMinutes <= 0) continue;
    let achievedMinutes = 0;
    for (const a of inRange) {
      if (!(a.activity_category_ids || []).includes(catId)) continue;
      achievedMinutes += Number(a.actual_duration_minutes || a.duration_minutes || 0) || 0;
    }
    out.push({
      goal,
      categoryId: catId,
      targetMinutes,
      achievedMinutes,
      ratio: targetMinutes > 0 ? achievedMinutes / targetMinutes : 0,
    });
  }
  return out;
}

// ── Emotion check-in rollup ─────────────────────────────────────────
// Top emotions, intensity by day, distress rate. Pulls from both
// EmotionCheckIn rows and any FrontingSession session_emotions
// JSON-array payload (the per-alter check-in entry surface).
export function computeEmotionRollup(checkIns, sessions, range) {
  const filteredCheckIns = (checkIns || []).filter((ci) => {
    const t = ci.timestamp ? new Date(ci.timestamp).getTime() : 0;
    return t >= range.fromMs && t <= range.toMs;
  });

  // Emotion frequency, intensity per day, distress count.
  const emotionFreq = new Map();
  const intensityByDay = new Map();
  let distressCount = 0;
  for (const ci of filteredCheckIns) {
    if (ci.is_distress) distressCount += 1;
    for (const e of ci.emotions || []) {
      emotionFreq.set(e, (emotionFreq.get(e) || 0) + 1);
    }
    if (ci.intensity != null) {
      const day = format(new Date(ci.timestamp), "yyyy-MM-dd");
      if (!intensityByDay.has(day)) intensityByDay.set(day, { day, total: 0, count: 0 });
      const row = intensityByDay.get(day);
      row.total += Number(ci.intensity) || 0;
      row.count += 1;
    }
  }

  // Pull per-alter session_emotions payloads. They're stored as
  // JSON-stringified arrays — parse defensively, treat failures
  // as empty.
  for (const s of sessions || []) {
    if (!s.session_emotions) continue;
    const t = new Date(s.start_time).getTime();
    if (t < range.fromMs || t > range.toMs) continue;
    let arr = [];
    try {
      const parsed = JSON.parse(s.session_emotions);
      if (Array.isArray(parsed)) arr = parsed;
    } catch { /* non-array legacy */ }
    for (const e of arr) {
      if (!e || typeof e !== "string") continue;
      emotionFreq.set(e, (emotionFreq.get(e) || 0) + 1);
    }
  }

  const topEmotions = [...emotionFreq.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([label, count]) => ({ label, count }));

  const intensityTrend = [...intensityByDay.values()]
    .filter((b) => b.count > 0)
    .map((b) => ({ day: b.day, avg: Number((b.total / b.count).toFixed(2)) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    totalCheckIns: filteredCheckIns.length,
    distressCount,
    distressRate: filteredCheckIns.length > 0 ? distressCount / filteredCheckIns.length : 0,
    topEmotions,
    intensityTrend,
  };
}

// ── Symptom rollup ──────────────────────────────────────────────────
// Frequency + average severity per symptom over the window.
// Pulls SymptomCheckIn rows, also includes per-alter session
// session_symptoms JSON payloads.
export function computeSymptomRollup(symptomCheckIns, symptoms, sessions, range) {
  const bySymId = new Map((symptoms || []).map((s) => [s.id, s]));
  const byKey = new Map();
  const bump = (label, severity, color) => {
    if (!label) return;
    if (!byKey.has(label)) byKey.set(label, { label, count: 0, severitySum: 0, severityCount: 0, color });
    const row = byKey.get(label);
    row.count += 1;
    if (typeof severity === "number" && Number.isFinite(severity)) {
      row.severitySum += severity;
      row.severityCount += 1;
    }
  };

  for (const sc of symptomCheckIns || []) {
    const t = sc.timestamp ? new Date(sc.timestamp).getTime() : 0;
    if (t < range.fromMs || t > range.toMs) continue;
    const def = sc.symptom_id ? bySymId.get(sc.symptom_id) : null;
    const label = def?.label || sc.symptom_id || "Unknown";
    bump(label, Number(sc.severity), def?.color);
  }
  for (const s of sessions || []) {
    if (!s.session_symptoms) continue;
    const t = new Date(s.start_time).getTime();
    if (t < range.fromMs || t > range.toMs) continue;
    let arr = [];
    try {
      const parsed = JSON.parse(s.session_symptoms);
      if (Array.isArray(parsed)) arr = parsed;
    } catch { /* non-array legacy */ }
    for (const it of arr) {
      const def = it?.id ? bySymId.get(it.id) : null;
      const label = it?.label || def?.label || it?.id;
      const sev = typeof it?.value === "number" ? it.value : null;
      bump(label, sev, def?.color);
    }
  }

  return [...byKey.values()]
    .map((r) => ({
      label: r.label,
      count: r.count,
      color: r.color,
      avgSeverity: r.severityCount > 0 ? r.severitySum / r.severityCount : null,
    }))
    .sort((a, b) => b.count - a.count);
}

// ── Task / reminder / sleep rollups ─────────────────────────────────
// Lightweight per-day or per-window counts so the new analytics
// cards (Phase 3) can compose them without re-querying.

export function computeTaskCompletion(tasks, range) {
  let createdInWindow = 0;
  let completedInWindow = 0;
  const completionsByDay = new Map();
  for (const t of tasks || []) {
    const created = t.created_date ? new Date(t.created_date).getTime() : null;
    if (created != null && created >= range.fromMs && created <= range.toMs) createdInWindow += 1;
    if (t.completed_date) {
      const d = new Date(t.completed_date).getTime();
      if (d >= range.fromMs && d <= range.toMs) {
        completedInWindow += 1;
        const dayKey = format(new Date(d), "yyyy-MM-dd");
        completionsByDay.set(dayKey, (completionsByDay.get(dayKey) || 0) + 1);
      }
    }
  }
  return {
    createdInWindow,
    completedInWindow,
    completionsByDay: [...completionsByDay.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export function computeReminderAckRate(reminderInstances, range) {
  let scheduled = 0;
  let acted = 0;
  let dismissed = 0;
  let missed = 0;
  for (const ri of reminderInstances || []) {
    const t = ri.scheduled_for ? new Date(ri.scheduled_for).getTime() : null;
    if (t == null || t < range.fromMs || t > range.toMs) continue;
    scheduled += 1;
    if (ri.status === "acted") acted += 1;
    else if (ri.status === "dismissed") dismissed += 1;
    else if (ri.status === "missed") missed += 1;
  }
  return {
    scheduled,
    acted,
    dismissed,
    missed,
    ackRate: scheduled > 0 ? acted / scheduled : 0,
  };
}

export function computeSleepQuality(sleepRecords, range) {
  const filtered = (sleepRecords || []).filter((r) => {
    const t = r.end_time ? new Date(r.end_time).getTime() : (r.start_time ? new Date(r.start_time).getTime() : 0);
    return t >= range.fromMs && t <= range.toMs;
  });
  let totalMin = 0;
  let qualitySum = 0;
  let qualityCount = 0;
  const byNight = [];
  for (const r of filtered) {
    if (!r.start_time || !r.end_time) continue;
    const dur = (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / 60000;
    totalMin += dur;
    if (typeof r.quality === "number" && Number.isFinite(r.quality)) {
      qualitySum += r.quality;
      qualityCount += 1;
    }
    byNight.push({
      day: format(new Date(r.end_time), "yyyy-MM-dd"),
      minutes: dur,
      quality: typeof r.quality === "number" ? r.quality : null,
    });
  }
  return {
    nights: byNight.length,
    totalMinutes: totalMin,
    avgMinutes: byNight.length ? totalMin / byNight.length : 0,
    avgQuality: qualityCount > 0 ? qualitySum / qualityCount : null,
    byNight: byNight.sort((a, b) => a.day.localeCompare(b.day)),
  };
}

// ── Location frequency rollup ───────────────────────────────────────
export function computeLocationRollup(locations, range) {
  const byCategory = new Map();
  const byName = new Map();
  let total = 0;
  for (const loc of locations || []) {
    const t = loc.timestamp ? new Date(loc.timestamp).getTime() : 0;
    if (t < range.fromMs || t > range.toMs) continue;
    total += 1;
    const cat = loc.category || "uncategorised";
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
    const name = (loc.name || "Unnamed").trim();
    byName.set(name, (byName.get(name) || 0) + 1);
  }
  return {
    total,
    byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    byName: [...byName.entries()].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ── Mood ↔ Activity correlation ─────────────────────────────────────
// For each activity category, average emotion intensity within
// N hours after a logged activity in that category. Lets the
// user see which activities precede mood improvements (or dips).
export function computeMoodActivityCorrelation(activities, checkIns, categories, range, windowMinutes = 180) {
  const inRangeActs = filterActivitiesInRange(activities, range);
  const catById = new Map((categories || []).map((c) => [c.id, c]));
  const checkInsSorted = (checkIns || [])
    .filter((ci) => ci.intensity != null && ci.timestamp)
    .map((ci) => ({ t: new Date(ci.timestamp).getTime(), intensity: Number(ci.intensity) }))
    .sort((a, b) => a.t - b.t);

  const byCat = new Map();
  for (const a of inRangeActs) {
    const at = new Date(a.timestamp).getTime();
    const windowEnd = at + windowMinutes * 60000;
    const followingIntensities = checkInsSorted
      .filter((ci) => ci.t >= at && ci.t <= windowEnd)
      .map((ci) => ci.intensity);
    if (followingIntensities.length === 0) continue;
    const avgIntensity = followingIntensities.reduce((s, x) => s + x, 0) / followingIntensities.length;
    const catIds = a.activity_category_ids?.length ? a.activity_category_ids : [null];
    for (const id of catIds) {
      const key = id || "__uncategorised";
      if (!byCat.has(key)) {
        const cat = id ? catById.get(id) : null;
        byCat.set(key, {
          categoryId: id || null,
          name: cat?.name || a.activity_name || "Uncategorised",
          color: cat?.color || "#8b5cf6",
          samples: 0,
          intensitySum: 0,
        });
      }
      const row = byCat.get(key);
      row.samples += 1;
      row.intensitySum += avgIntensity;
    }
  }

  return [...byCat.values()]
    .filter((r) => r.samples >= 2) // ignore single-sample noise
    .map((r) => ({
      categoryId: r.categoryId,
      name: r.name,
      color: r.color,
      samples: r.samples,
      avgIntensity: r.intensitySum / r.samples,
    }))
    .sort((a, b) => b.avgIntensity - a.avgIntensity);
}

// ── Daily activity heatmap helper ───────────────────────────────────
// One row per day in [from, to] with the counts you want to chart.
// Useful for the chart components that draw a heatmap grid.
export function eachDayInRange(range) {
  return eachDayOfInterval({ start: range.from, end: range.to })
    .map((d) => format(d, "yyyy-MM-dd"));
}

// Personal baselines: "vs your usual", never external targets.
//
// Research-derived rules baked in here (see memory: analytics-rebuild-plan):
//   - Baselines are the user's OWN rolling average (Exist/Oura pattern),
//     optionally day-of-week aware ("Sundays usually look like this").
//   - Deviations within ±15% read as "about usual" — only bigger moves are
//     worth a sentence, and even then wording stays descriptive.
//   - HONESTY: two series kinds, because unlogged ≠ zero for this audience:
//       "value" series (sleep hours, avg intensity)  → unlogged day = null.
//         Baselines average non-null days only; charts must show gaps.
//       "count" series (check-ins/day, switches/day) → unlogged day = 0,
//         which is honest for event counts, but consumers should pair any
//         count trend with logging-presence context (presence calendar).
//   - Minimum-n gates: no baseline under MIN_BASELINE_DAYS observations, no
//     trend unless both windows clear MIN_TREND_DAYS. Below the gate,
//     callers render an unlock state, never a bare "not enough data".

import { bucketByDay, weekdayOf } from "./range";

export const MIN_BASELINE_DAYS = 5;   // observations needed before "your usual" exists
export const MIN_TREND_DAYS = 4;      // per-window observations needed for a trend
export const USUAL_BAND_PCT = 0.15;   // ±15% counts as "about usual"

// Build a per-day series over range.dayKeys.
//   kind: "count" → value = reduce over that day's items, absent day = 0
//         "value" → absent day = null (unlogged ≠ 0)
//   getValue: (itemsOfDay) => number | null   (already-bucketed reduce)
export function dailySeries(items, getMs, range, { kind = "count", getValue = null } = {}) {
  const buckets = bucketByDay(items, getMs, range);
  return range.dayKeys.map((key) => {
    const dayItems = buckets.get(key);
    if (!dayItems || dayItems.length === 0) {
      return { key, value: kind === "count" ? 0 : null, n: 0 };
    }
    const value = getValue ? getValue(dayItems) : dayItems.length;
    return { key, value, n: dayItems.length };
  });
}

function meanOf(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Personal baseline over a series (typically the trailing 30d window).
// Returns { mean, n, byWeekday, sufficient } — byWeekday maps 0..6 to that
// weekday's own mean when it has ≥2 observations (else falls back to mean).
export function baseline(series, { byWeekday = true } = {}) {
  const observed = series.filter((p) => p.value != null);
  const mean = meanOf(observed.map((p) => p.value));
  const out = {
    mean,
    n: observed.length,
    sufficient: observed.length >= MIN_BASELINE_DAYS,
    byWeekday: null,
  };
  if (byWeekday && observed.length >= MIN_BASELINE_DAYS) {
    const perDay = new Map();
    for (const p of observed) {
      const wd = weekdayOf(p.key);
      if (!perDay.has(wd)) perDay.set(wd, []);
      perDay.get(wd).push(p.value);
    }
    const map = {};
    for (let wd = 0; wd <= 6; wd++) {
      const vals = perDay.get(wd) || [];
      map[wd] = vals.length >= 2 ? meanOf(vals) : mean;
    }
    out.byWeekday = map;
  }
  return out;
}

// Where does `current` sit against a baseline mean?
// band: "usual" | "above" | "below" | "unknown". Descriptive only — callers
// must NOT map above/below to good/bad (a switch count going up is not
// "worse"; wording stays neutral).
export function deviation(current, baselineMean) {
  if (current == null || baselineMean == null) return { band: "unknown", pct: null };
  if (baselineMean === 0) {
    return current === 0
      ? { band: "usual", pct: 0 }
      : { band: "above", pct: null }; // no meaningful % against a zero baseline
  }
  const pct = (current - baselineMean) / baselineMean;
  if (Math.abs(pct) <= USUAL_BAND_PCT) return { band: "usual", pct };
  return { band: pct > 0 ? "above" : "below", pct };
}

// Recent-vs-prior trend across two same-length windows.
// Returns { direction: "up"|"down"|"flat"|"unknown", pctChange, sufficient,
//           recentMean, priorMean, recentN, priorN }
export function trend(recentSeries, priorSeries) {
  const r = recentSeries.filter((p) => p.value != null);
  const p = priorSeries.filter((q) => q.value != null);
  const recentMean = meanOf(r.map((x) => x.value));
  const priorMean = meanOf(p.map((x) => x.value));
  const sufficient = r.length >= MIN_TREND_DAYS && p.length >= MIN_TREND_DAYS;
  if (!sufficient || recentMean == null || priorMean == null) {
    return { direction: "unknown", pctChange: null, sufficient: false, recentMean, priorMean, recentN: r.length, priorN: p.length };
  }
  const dev = deviation(recentMean, priorMean);
  const direction = dev.band === "usual" ? "flat" : dev.band === "above" ? "up" : "down";
  return { direction, pctChange: dev.pct, sufficient: true, recentMean, priorMean, recentN: r.length, priorN: p.length };
}

// Confidence heuristic shared by every insight (Daylio-style 3 levels),
// keyed on how many observed days back the statement. Documented so the
// "how is this computed?" explainer can state it plainly.
export function confidenceForDays(observedDays) {
  if (observedDays >= 21) return "high";
  if (observedDays >= 10) return "medium";
  return "low";
}

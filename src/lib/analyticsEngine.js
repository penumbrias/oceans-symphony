import { format } from "date-fns";

// ─── Baseline ────────────────────────────────────────────────────────────────

/**
 * Compute personal baseline: mean and stdDev for each rating-type symptom
 * across all available SymptomCheckIn records.
 * Returns: { symptomId: { mean, stdDev, n } }
 */
export function computeSymptomBaseline(symptomCheckIns, symptoms) {
  const ratingIds = new Set(
    symptoms.filter(s => s.type === "rating").map(s => s.id)
  );
  const groups = {};
  symptomCheckIns.forEach(sc => {
    if (!sc.symptom_id || !ratingIds.has(sc.symptom_id)) return;
    if (sc.severity === null || sc.severity === undefined) return;
    if (!groups[sc.symptom_id]) groups[sc.symptom_id] = [];
    groups[sc.symptom_id].push(Number(sc.severity));
  });
  const baseline = {};
  Object.entries(groups).forEach(([id, vals]) => {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    baseline[id] = {
      mean: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(Math.sqrt(variance).toFixed(2)),
      n: vals.length,
    };
  });
  return baseline;
}

/**
 * For a given date range, compute how each symptom deviates from its baseline.
 * Returns: { symptomId: { currentMean, baselineMean, delta, zScore } }
 */
export function computeBaselineDeviation(symptomCheckIns, baseline, fromMs, toMs) {
  const groups = {};
  symptomCheckIns.forEach(sc => {
    if (!sc.timestamp || !sc.symptom_id) return;
    if (sc.severity === null || sc.severity === undefined) return;
    if (!baseline[sc.symptom_id]) return;
    const ts = new Date(sc.timestamp).getTime();
    if (ts < fromMs || ts > toMs) return;
    if (!groups[sc.symptom_id]) groups[sc.symptom_id] = [];
    groups[sc.symptom_id].push(Number(sc.severity));
  });
  const deviation = {};
  Object.entries(groups).forEach(([id, vals]) => {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const b = baseline[id];
    deviation[id] = {
      currentMean: parseFloat(mean.toFixed(2)),
      baselineMean: b.mean,
      delta: parseFloat((mean - b.mean).toFixed(2)),
      zScore: b.stdDev > 0 ? parseFloat(((mean - b.mean) / b.stdDev).toFixed(2)) : 0,
      n: vals.length,
    };
  });
  return deviation;
}

// ─── Trigger → Symptom chains ─────────────────────────────────────────────────

/**
 * For each trigger category, compute average symptom levels in the
 * `windowHoursAfter` hours following a triggered switch, vs the overall baseline.
 *
 * Returns: { triggerCategory: { symptomId: { afterMean, baselineMean, delta, n } } }
 */
export function computeTriggerSymptomChains(
  frontingSessions, symptomCheckIns, baseline, windowHoursAfter = 24
) {
  const triggered = frontingSessions.filter(
    s => s.is_triggered_switch && s.trigger_category && s.start_time
  );
  if (!triggered.length) return {};

  const chains = {};
  triggered.forEach(session => {
    const cat = session.trigger_category;
    const sessionStart = new Date(session.start_time).getTime();
    const windowEnd = sessionStart + windowHoursAfter * 3_600_000;

    symptomCheckIns.forEach(sc => {
      if (!sc.timestamp || !sc.symptom_id) return;
      if (sc.severity === null || sc.severity === undefined) return;
      const ts = new Date(sc.timestamp).getTime();
      if (ts < sessionStart || ts > windowEnd) return;
      if (!chains[cat]) chains[cat] = {};
      if (!chains[cat][sc.symptom_id]) chains[cat][sc.symptom_id] = [];
      chains[cat][sc.symptom_id].push(Number(sc.severity));
    });
  });

  const result = {};
  Object.entries(chains).forEach(([cat, symptomGroups]) => {
    result[cat] = {};
    Object.entries(symptomGroups).forEach(([symptomId, vals]) => {
      const afterMean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const b = baseline[symptomId];
      result[cat][symptomId] = {
        afterMean: parseFloat(afterMean.toFixed(2)),
        baselineMean: b?.mean ?? null,
        delta: b != null ? parseFloat((afterMean - b.mean).toFixed(2)) : null,
        n: vals.length,
      };
    });
  });
  return result;
}

// ─── Pre-switch signature ─────────────────────────────────────────────────────

/**
 * For all triggered switches, compute the average symptom level in the
 * `windowHoursBefore` hours before the switch, vs the overall baseline.
 *
 * Returns: { symptomId: { preMean, baselineMean, elevation, n } }
 */
export function computePreSwitchSignature(
  frontingSessions, symptomCheckIns, baseline, windowHoursBefore = 24
) {
  const triggered = frontingSessions.filter(s => s.is_triggered_switch && s.start_time);
  if (!triggered.length) return {};

  const groups = {};
  triggered.forEach(session => {
    const sessionStart = new Date(session.start_time).getTime();
    const windowStart = sessionStart - windowHoursBefore * 3_600_000;

    symptomCheckIns.forEach(sc => {
      if (!sc.timestamp || !sc.symptom_id) return;
      if (sc.severity === null || sc.severity === undefined) return;
      const ts = new Date(sc.timestamp).getTime();
      if (ts < windowStart || ts >= sessionStart) return;
      if (!groups[sc.symptom_id]) groups[sc.symptom_id] = [];
      groups[sc.symptom_id].push(Number(sc.severity));
    });
  });

  const result = {};
  Object.entries(groups).forEach(([symptomId, vals]) => {
    const preMean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const b = baseline[symptomId];
    result[symptomId] = {
      preMean: parseFloat(preMean.toFixed(2)),
      baselineMean: b?.mean ?? null,
      elevation: b != null ? parseFloat((preMean - b.mean).toFixed(2)) : null,
      n: vals.length,
    };
  });
  return result;
}

// ─── Symptom correlation matrix ───────────────────────────────────────────────

/**
 * Pearson correlation between every pair of rating-type symptoms,
 * computed from daily averages (requires ≥ 3 shared days to be meaningful).
 *
 * Returns: { matrix: { symptomId: { symptomId: r | null } }, symptoms: Symptom[] }
 */
export function computeSymptomCorrelations(symptomCheckIns, symptoms) {
  const ratingSymptoms = symptoms.filter(s => s.type === "rating" && !s.is_archived);
  if (ratingSymptoms.length < 2) return { matrix: {}, symptoms: [] };

  const ratingIds = new Set(ratingSymptoms.map(s => s.id));

  // Daily averages per symptom
  const dailyGroups = {};
  symptomCheckIns.forEach(sc => {
    if (!sc.timestamp || !sc.symptom_id || !ratingIds.has(sc.symptom_id)) return;
    if (sc.severity === null || sc.severity === undefined) return;
    const day = sc.timestamp.substring(0, 10);
    if (!dailyGroups[day]) dailyGroups[day] = {};
    if (!dailyGroups[day][sc.symptom_id]) dailyGroups[day][sc.symptom_id] = [];
    dailyGroups[day][sc.symptom_id].push(Number(sc.severity));
  });

  const days = Object.keys(dailyGroups).sort();
  const ids = ratingSymptoms.map(s => s.id);

  // Build aligned daily-average vectors
  const vectors = {};
  ids.forEach(id => { vectors[id] = []; });
  days.forEach(day => {
    ids.forEach(id => {
      const vals = dailyGroups[day]?.[id];
      vectors[id].push(
        vals?.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
      );
    });
  });

  function pearson(a, b) {
    const pairs = a.map((v, i) => [v, b[i]]).filter(([x, y]) => x !== null && y !== null);
    if (pairs.length < 3) return null;
    const n = pairs.length;
    const ma = pairs.reduce((s, [x]) => s + x, 0) / n;
    const mb = pairs.reduce((s, [, y]) => s + y, 0) / n;
    const num = pairs.reduce((s, [x, y]) => s + (x - ma) * (y - mb), 0);
    const da = Math.sqrt(pairs.reduce((s, [x]) => s + (x - ma) ** 2, 0));
    const db = Math.sqrt(pairs.reduce((s, [, y]) => s + (y - mb) ** 2, 0));
    if (da === 0 || db === 0) return null;
    return parseFloat((num / (da * db)).toFixed(3));
  }

  const matrix = {};
  ids.forEach(idA => {
    matrix[idA] = {};
    ids.forEach(idB => {
      if (idA === idB) {
        matrix[idA][idB] = 1;
      } else if (matrix[idB]?.[idA] !== undefined) {
        matrix[idA][idB] = matrix[idB][idA];
      } else {
        matrix[idA][idB] = pearson(vectors[idA], vectors[idB]);
      }
    });
  });

  return { matrix, symptoms: ratingSymptoms };
}

// ─── Alter × symptom correlation ─────────────────────────────────────────────

/**
 * For each alter, compute average symptom levels during their fronting sessions
 * vs the overall baseline, to reveal which alters front during high/low states.
 *
 * Returns: { alterId: { symptomId: { whileFrontingMean, baselineMean, delta, n } } }
 */
export function computeAlterSymptomCorrelation(
  frontingSessions, alters, symptomCheckIns, baseline
) {
  if (!frontingSessions.length || !alters.length) return {};

  const alterGroups = {};
  alters.forEach(a => { alterGroups[a.id] = {}; });

  frontingSessions.forEach(session => {
    const alterIds = session.alter_id
      ? [session.alter_id]
      : [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
    if (!alterIds.length) return;

    const sessionStart = new Date(session.start_time).getTime();
    const sessionEnd = session.end_time
      ? new Date(session.end_time).getTime()
      : sessionStart + 3_600_000;

    const sessionCheckIns = symptomCheckIns.filter(sc => {
      if (!sc.timestamp || sc.severity === null || sc.severity === undefined) return false;
      const ts = new Date(sc.timestamp).getTime();
      return ts >= sessionStart && ts <= sessionEnd;
    });

    if (!sessionCheckIns.length) return;

    alterIds.forEach(alterId => {
      if (!alterGroups[alterId]) return;
      sessionCheckIns.forEach(sc => {
        if (!sc.symptom_id) return;
        if (!alterGroups[alterId][sc.symptom_id]) alterGroups[alterId][sc.symptom_id] = [];
        alterGroups[alterId][sc.symptom_id].push(Number(sc.severity));
      });
    });
  });

  const result = {};
  Object.entries(alterGroups).forEach(([alterId, symptomGroups]) => {
    const symptomData = {};
    Object.entries(symptomGroups).forEach(([symptomId, vals]) => {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const b = baseline[symptomId];
      symptomData[symptomId] = {
        whileFrontingMean: parseFloat(mean.toFixed(2)),
        baselineMean: b?.mean ?? null,
        delta: b != null ? parseFloat((mean - b.mean).toFixed(2)) : null,
        n: vals.length,
      };
    });
    if (Object.keys(symptomData).length > 0) result[alterId] = symptomData;
  });
  return result;
}

// ─── Monthly trend ────────────────────────────────────────────────────────────

/**
 * Monthly average severity per rating-type symptom across all time.
 * Returns: [{ monthKey: "2025-01", label: "Jan 2025", [symptomId]: avg }]
 */
export function computeMonthlyTrend(symptomCheckIns, symptoms) {
  const ratingSymptoms = symptoms.filter(s => s.type === "rating" && !s.is_archived);
  if (!ratingSymptoms.length || !symptomCheckIns.length) return [];
  const ratingIds = new Set(ratingSymptoms.map(s => s.id));

  const monthMap = {};
  symptomCheckIns.forEach(sc => {
    if (!sc.timestamp || !sc.symptom_id || !ratingIds.has(sc.symptom_id)) return;
    if (sc.severity === null || sc.severity === undefined) return;
    const monthKey = sc.timestamp.substring(0, 7);
    if (!monthMap[monthKey]) monthMap[monthKey] = {};
    if (!monthMap[monthKey][sc.symptom_id]) monthMap[monthKey][sc.symptom_id] = [];
    monthMap[monthKey][sc.symptom_id].push(Number(sc.severity));
  });

  return Object.keys(monthMap).sort().map(monthKey => {
    const [year, month] = monthKey.split("-").map(Number);
    const row = {
      monthKey,
      label: format(new Date(year, month - 1, 1), "MMM yyyy"),
    };
    Object.entries(monthMap[monthKey]).forEach(([id, vals]) => {
      row[id] = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
    });
    return row;
  });
}

// ─── Switch time heatmap ──────────────────────────────────────────────────────

/**
 * Count triggered switches by hour-of-day (0–23) × day-of-week (0=Sun, 6=Sat).
 * Returns: { matrix: number[][], dayLabels, hourLabels, max, total }
 */
export function computeSwitchTimeHeatmap(frontingSessions) {
  // 7 rows (days), 24 cols (hours)
  const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const triggered = frontingSessions.filter(s => s.is_triggered_switch && s.start_time);
  triggered.forEach(s => {
    const d = new Date(s.start_time);
    matrix[d.getDay()][d.getHours()]++;
  });
  const max = Math.max(...matrix.flat());
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hourLabels = Array.from({ length: 24 }, (_, i) => {
    if (i === 0) return "12a";
    if (i === 12) return "12p";
    return i < 12 ? `${i}a` : `${i - 12}p`;
  });
  return { matrix, dayLabels, hourLabels, max, total: triggered.length };
}

// ─── Recovery time ────────────────────────────────────────────────────────────

/**
 * After each triggered switch, estimate how long until symptoms return
 * within one stdDev of baseline. Returns average recovery hours.
 *
 * Returns: { averageHours: number | null, byCategory: { cat: hours } }
 */
export function computeRecoveryTime(frontingSessions, symptomCheckIns, baseline) {
  const triggered = frontingSessions.filter(s => s.is_triggered_switch && s.start_time);
  if (!triggered.length || !Object.keys(baseline).length) return { averageHours: null, byCategory: {} };

  const symptomIds = Object.keys(baseline).filter(id => baseline[id].stdDev > 0);
  if (!symptomIds.length) return { averageHours: null, byCategory: {} };

  const recoveryHours = [];
  const byCategory = {};

  triggered.forEach(session => {
    const switchTime = new Date(session.start_time).getTime();
    // Look at check-ins in the 48h after the switch in 2h buckets
    const recovered = [];
    for (let h = 1; h <= 48; h++) {
      const bucketEnd = switchTime + h * 3_600_000;
      const bucketStart = switchTime + (h - 1) * 3_600_000;
      const bucket = symptomCheckIns.filter(sc => {
        if (!sc.timestamp || !sc.symptom_id || !symptomIds.includes(sc.symptom_id)) return false;
        const ts = new Date(sc.timestamp).getTime();
        return ts >= bucketStart && ts < bucketEnd;
      });
      if (!bucket.length) continue;
      const bySymptom = {};
      bucket.forEach(sc => {
        if (!bySymptom[sc.symptom_id]) bySymptom[sc.symptom_id] = [];
        bySymptom[sc.symptom_id].push(Number(sc.severity));
      });
      const allWithinBaseline = Object.entries(bySymptom).every(([sid, vals]) => {
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const b = baseline[sid];
        return Math.abs(mean - b.mean) <= b.stdDev;
      });
      if (allWithinBaseline) {
        recovered.push(h);
        break;
      }
    }
    if (recovered.length) {
      recoveryHours.push(recovered[0]);
      const cat = session.trigger_category || "unknown";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(recovered[0]);
    }
  });

  const avg = recoveryHours.length
    ? parseFloat((recoveryHours.reduce((a, b) => a + b, 0) / recoveryHours.length).toFixed(1))
    : null;

  const byCategoryAvg = {};
  Object.entries(byCategory).forEach(([cat, hours]) => {
    byCategoryAvg[cat] = parseFloat((hours.reduce((a, b) => a + b, 0) / hours.length).toFixed(1));
  });

  return { averageHours: avg, byCategory: byCategoryAvg };
}

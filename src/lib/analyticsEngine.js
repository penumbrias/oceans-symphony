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

// ─── Habit → symptom outcomes ─────────────────────────────────────────────────

/**
 * For each habit, compute average symptom levels on days it was completed
 * vs days it was missed, and the next-day effect.
 *
 * Returns: { habits: Symptom[], symptoms: Symptom[], result: { habitId: { symptomId: { completedAvg, missedAvg, delta, nextDelta } } } }
 */
export function computeHabitSymptomCorrelation(symptomCheckIns, symptoms) {
  const habitSymptoms = symptoms.filter(s => s.category === "habit" && !s.is_archived);
  const regularSymptoms = symptoms.filter(s => s.category !== "habit" && s.type === "rating" && !s.is_archived);
  if (!habitSymptoms.length || !regularSymptoms.length) return { habits: [], symptoms: [], result: {} };

  const habitIds = new Set(habitSymptoms.map(s => s.id));
  const symptomIds = new Set(regularSymptoms.map(s => s.id));

  const dailyHabits = {};
  const dailySymptoms = {};
  symptomCheckIns.forEach(sc => {
    if (!sc.timestamp || sc.severity === null || sc.severity === undefined) return;
    const day = sc.timestamp.substring(0, 10);
    const val = Number(sc.severity);
    if (habitIds.has(sc.symptom_id)) {
      if (!dailyHabits[day]) dailyHabits[day] = {};
      if (!dailyHabits[day][sc.symptom_id]) dailyHabits[day][sc.symptom_id] = [];
      dailyHabits[day][sc.symptom_id].push(val);
    }
    if (symptomIds.has(sc.symptom_id)) {
      if (!dailySymptoms[day]) dailySymptoms[day] = {};
      if (!dailySymptoms[day][sc.symptom_id]) dailySymptoms[day][sc.symptom_id] = [];
      dailySymptoms[day][sc.symptom_id].push(val);
    }
  });

  const days = Object.keys(dailyHabits).sort();
  const result = {};

  habitSymptoms.forEach(habit => {
    result[habit.id] = {};
    regularSymptoms.forEach(symptom => {
      const comp = [], missed = [], nextComp = [], nextMissed = [];
      days.forEach((day, i) => {
        const habitVals = dailyHabits[day]?.[habit.id];
        if (!habitVals) return;
        const habitAvg = habitVals.reduce((a, b) => a + b, 0) / habitVals.length;
        const completed = habitAvg > 0.5;

        const sameVals = dailySymptoms[day]?.[symptom.id];
        if (sameVals) {
          const avg = sameVals.reduce((a, b) => a + b, 0) / sameVals.length;
          completed ? comp.push(avg) : missed.push(avg);
        }

        const nextDay = days[i + 1];
        if (nextDay) {
          const nextVals = dailySymptoms[nextDay]?.[symptom.id];
          if (nextVals) {
            const avg = nextVals.reduce((a, b) => a + b, 0) / nextVals.length;
            completed ? nextComp.push(avg) : nextMissed.push(avg);
          }
        }
      });

      if (comp.length + missed.length < 4) return;
      const mean = arr => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null;
      const ca = mean(comp), ma = mean(missed), nca = mean(nextComp), nma = mean(nextMissed);
      result[habit.id][symptom.id] = {
        completedAvg: ca,
        missedAvg: ma,
        delta: ca !== null && ma !== null ? parseFloat((ca - ma).toFixed(2)) : null,
        nextCompletedAvg: nca,
        nextMissedAvg: nma,
        nextDelta: nca !== null && nma !== null ? parseFloat((nca - nma).toFixed(2)) : null,
        completedDays: comp.length,
        missedDays: missed.length,
      };
    });
  });

  return { habits: habitSymptoms, symptoms: regularSymptoms, result };
}

// ─── Alter emotion profiles ───────────────────────────────────────────────────

/**
 * For each alter (and system overall), compute emotion frequency distributions
 * from EmotionCheckIn records.
 *
 * Returns: { alterId: { topEmotions: [{emotion, count, pct}], total } }
 * "__system__" key for check-ins with no specific alter.
 */
export function computeAlterEmotionProfiles(emotionCheckIns, alters) {
  const profiles = { __system__: {} };
  alters.forEach(a => { profiles[a.id] = {}; });

  emotionCheckIns.forEach(ci => {
    const alterIds = ci.fronting_alter_ids?.length
      ? ci.fronting_alter_ids
      : ["__system__"];
    alterIds.forEach(alterId => {
      if (!profiles[alterId]) return;
      (ci.emotions || []).forEach(emotion => {
        profiles[alterId][emotion] = (profiles[alterId][emotion] || 0) + 1;
      });
    });
  });

  const result = {};
  Object.entries(profiles).forEach(([alterId, counts]) => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (!total) return;
    result[alterId] = {
      topEmotions: Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([emotion, count]) => ({ emotion, count, pct: Math.round((count / total) * 100) })),
      total,
    };
  });
  return result;
}

// ─── Early warning indicator ──────────────────────────────────────────────────

/**
 * Compare recent symptom check-ins (last `hours`) to the pre-switch signature.
 * Returns a status: "warning" | "elevated" | "stable" | "insufficient_data"
 */
export function computeEarlyWarningStatus(symptomCheckIns, preSwitchSignature, windowHours = 48) {
  if (!Object.keys(preSwitchSignature).length) return { status: "insufficient_data", matchedSymptoms: [], message: null };

  const nowMs = Date.now();
  const windowStart = nowMs - windowHours * 3_600_000;
  const recent = symptomCheckIns.filter(sc => {
    const ts = new Date(sc.timestamp).getTime();
    return ts >= windowStart && ts <= nowMs && sc.severity !== null && sc.symptom_id;
  });
  if (!recent.length) return { status: "no_recent_data", matchedSymptoms: [], message: null };

  const recentBySymptom = {};
  recent.forEach(sc => {
    if (!recentBySymptom[sc.symptom_id]) recentBySymptom[sc.symptom_id] = [];
    recentBySymptom[sc.symptom_id].push(Number(sc.severity));
  });
  const recentMeans = {};
  Object.entries(recentBySymptom).forEach(([id, vals]) => {
    recentMeans[id] = vals.reduce((a, b) => a + b, 0) / vals.length;
  });

  // Only consider symptoms with meaningful pre-switch elevation
  const signatureSymptoms = Object.entries(preSwitchSignature)
    .filter(([, sig]) => sig.elevation !== null && sig.elevation >= 0.3);
  if (!signatureSymptoms.length) return { status: "no_pattern_data", matchedSymptoms: [], message: null };

  const matched = [];
  signatureSymptoms.forEach(([symptomId, sig]) => {
    if (recentMeans[symptomId] === undefined) return;
    const threshold = (sig.baselineMean ?? 0) + sig.elevation * 0.65;
    if (recentMeans[symptomId] >= threshold) matched.push(symptomId);
  });

  const ratio = matched.length / signatureSymptoms.length;

  if (ratio >= 0.6 && matched.length >= 2) {
    return {
      status: "warning",
      matchRatio: ratio,
      matchedSymptoms: matched,
      message: "Your current symptom pattern matches what has historically preceded a switch. Consider grounding tools and checking in with your system.",
    };
  }
  if (ratio >= 0.3 && matched.length >= 1) {
    return {
      status: "elevated",
      matchRatio: ratio,
      matchedSymptoms: matched,
      message: "Some symptoms are elevated in a pattern that can precede switches.",
    };
  }
  return { status: "stable", matchRatio: ratio, matchedSymptoms: [], message: null };
}

// ─── Weekly narrative ─────────────────────────────────────────────────────────

const TRIGGER_LABELS_SHORT = {
  sensory: "sensory", emotional: "emotional", interpersonal: "interpersonal",
  trauma_reminder: "trauma reminder", physical: "physical", internal: "internal", unknown: "unknown",
};

/**
 * Generate a plain-language narrative summary for a date range.
 * Returns an array of sentences/paragraphs.
 */
export function generateWeeklyNarrative({
  sessions, altersById = {}, symptomCheckIns, symptoms,
  baseline, emotionCheckIns, fromMs, toMs,
}) {
  const paragraphs = [];
  const symptomMap = Object.fromEntries(symptoms.filter(s => s.type === "rating").map(s => [s.id, s]));

  // Triggered switches
  const triggered = sessions.filter(s => {
    if (!s.is_triggered_switch || !s.start_time) return false;
    const ts = new Date(s.start_time).getTime();
    return ts >= fromMs && ts <= toMs;
  });
  const allInPeriod = sessions.filter(s => {
    const ts = s.start_time ? new Date(s.start_time).getTime() : 0;
    return ts >= fromMs && ts <= toMs;
  });

  if (triggered.length === 0) {
    paragraphs.push("No triggered switches occurred this period.");
  } else {
    const catCounts = {};
    triggered.forEach(s => {
      const c = s.trigger_category || "unknown";
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([c, n]) => `${n} ${TRIGGER_LABELS_SHORT[c] || c}`);
    paragraphs.push(
      `${triggered.length} triggered switch${triggered.length !== 1 ? "es" : ""} occurred this period` +
      (topCats.length ? ` (${topCats.join(", ")})` : "") + "."
    );
  }

  // Symptoms vs baseline
  const deviation = computeBaselineDeviation(symptomCheckIns, baseline, fromMs, toMs);
  const elevated = Object.entries(deviation).filter(([, d]) => d.zScore > 0.5)
    .sort((a, b) => b[1].zScore - a[1].zScore).slice(0, 3);
  const lowered = Object.entries(deviation).filter(([, d]) => d.zScore < -0.5)
    .sort((a, b) => a[1].zScore - b[1].zScore).slice(0, 2);

  if (elevated.length > 0) {
    const names = elevated.map(([id]) => symptomMap[id]?.label || id).join(", ");
    paragraphs.push(`Elevated above baseline: ${names}.`);
  }
  if (lowered.length > 0) {
    const names = lowered.map(([id]) => (symptomMap[id]?.is_positive ? "↑ " : "↓ ") + (symptomMap[id]?.label || id)).join(", ");
    paragraphs.push(`Below baseline (positive change): ${names}.`);
  }
  if (elevated.length === 0 && lowered.length === 0 && Object.keys(deviation).length > 0) {
    paragraphs.push("Symptom levels were near baseline throughout this period.");
  }

  // Top fronting alters
  const frontingTime = {};
  allInPeriod.forEach(s => {
    const start = new Date(s.start_time).getTime();
    const end = s.end_time ? new Date(s.end_time).getTime() : start + 3_600_000;
    const dur = end - start;
    const ids = s.alter_id ? [s.alter_id] : [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
    ids.forEach(id => { frontingTime[id] = (frontingTime[id] || 0) + dur; });
  });
  const topAlters = Object.entries(frontingTime)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id]) => altersById[id]?.name).filter(Boolean);
  if (topAlters.length > 0) {
    paragraphs.push(`Most active fronters: ${topAlters.join(", ")}.`);
  }

  // Emotions
  const periodEmotions = emotionCheckIns.filter(ci => {
    const ts = new Date(ci.timestamp).getTime();
    return ts >= fromMs && ts <= toMs;
  });
  const emotionCounts = {};
  periodEmotions.forEach(ci => {
    (ci.emotions || []).forEach(e => { emotionCounts[e] = (emotionCounts[e] || 0) + 1; });
  });
  const topEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e]) => e);
  if (topEmotions.length > 0) {
    paragraphs.push(`Most frequent emotions: ${topEmotions.join(", ")}.`);
  }

  return paragraphs;
}

// ─── Curriculum engagement ────────────────────────────────────────────────────

/**
 * Check if symptom levels changed in the weeks following module completions.
 * Returns: [{ moduleId, completedDate, symptomId, beforeMean, afterMean, delta }]
 */
export function computeCurriculumEngagement(learningProgress, symptomCheckIns, symptoms, baseline) {
  const completions = learningProgress.filter(p => p.completed && p.completed_date);
  if (!completions.length || !Object.keys(baseline).length) return [];

  const ratingIds = new Set(symptoms.filter(s => s.type === "rating").map(s => s.id));
  const WINDOW = 14 * 24 * 3_600_000; // 2 weeks

  return completions.map(p => {
    const completedMs = new Date(p.completed_date).getTime();
    const beforeStart = completedMs - WINDOW;
    const afterEnd = completedMs + WINDOW;

    const before = {}, after = {};
    symptomCheckIns.forEach(sc => {
      if (!sc.timestamp || !sc.symptom_id || !ratingIds.has(sc.symptom_id)) return;
      if (sc.severity === null) return;
      const ts = new Date(sc.timestamp).getTime();
      if (ts >= beforeStart && ts < completedMs) {
        if (!before[sc.symptom_id]) before[sc.symptom_id] = [];
        before[sc.symptom_id].push(Number(sc.severity));
      } else if (ts >= completedMs && ts <= afterEnd) {
        if (!after[sc.symptom_id]) after[sc.symptom_id] = [];
        after[sc.symptom_id].push(Number(sc.severity));
      }
    });

    const changes = [];
    Object.keys({ ...before, ...after }).forEach(symptomId => {
      const bVals = before[symptomId];
      const aVals = after[symptomId];
      if (!bVals?.length || !aVals?.length) return;
      const bMean = bVals.reduce((s, v) => s + v, 0) / bVals.length;
      const aMean = aVals.reduce((s, v) => s + v, 0) / aVals.length;
      changes.push({ symptomId, beforeMean: parseFloat(bMean.toFixed(2)), afterMean: parseFloat(aMean.toFixed(2)), delta: parseFloat((aMean - bMean).toFixed(2)) });
    });

    return { topicId: p.topic_id, moduleId: p.module_id, completedDate: p.completed_date, changes };
  }).filter(r => r.changes.length > 0);
}

// ─── Alter Co-fronting Matrix ─────────────────────────────────────────────────

/**
 * Build an N×N co-fronting frequency matrix for all alters.
 * cell[a][b] = number of times alters a and b co-fronted.
 *
 * Handles both data models:
 *  - Individual sessions (alter_id): overlapping time windows count as co-fronting
 *  - Group sessions (primary_alter_id + co_fronter_ids): all listed IDs co-front
 *
 * Returns: { matrix: { alterId: { alterId: count } }, maxCount: number, pairs: [{a, b, count}] }
 */
export function computeAlterCoFrontingMatrix(frontingSessions, alters) {
  const alterIds = alters.map(a => a.id);
  const idSet = new Set(alterIds);

  // Initialize matrix
  const matrix = {};
  alterIds.forEach(a => {
    matrix[a] = {};
    alterIds.forEach(b => { matrix[a][b] = 0; });
  });

  const addPair = (a, b) => {
    if (!idSet.has(a) || !idSet.has(b) || a === b) return;
    matrix[a][b] = (matrix[a][b] || 0) + 1;
    matrix[b][a] = (matrix[b][a] || 0) + 1;
  };

  // Group sessions: all listed IDs are co-fronting for the duration
  const groupSessions = frontingSessions.filter(s => !s.alter_id && s.primary_alter_id);
  groupSessions.forEach(session => {
    const ids = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        addPair(ids[i], ids[j]);
      }
    }
  });

  // Individual sessions: overlapping windows count as co-fronting
  const individual = frontingSessions
    .filter(s => s.alter_id && s.start_time)
    .map(s => ({
      id: s.alter_id,
      start: new Date(s.start_time).getTime(),
      end: s.end_time ? new Date(s.end_time).getTime() : new Date(s.start_time).getTime() + 3_600_000,
    }))
    .sort((a, b) => a.start - b.start);

  for (let i = 0; i < individual.length; i++) {
    const s1 = individual[i];
    for (let j = i + 1; j < individual.length; j++) {
      const s2 = individual[j];
      if (s2.start >= s1.end) break; // sorted by start, no more overlaps possible
      if (s2.id === s1.id) continue;
      if (s2.start < s1.end && s1.start < s2.end) {
        addPair(s1.id, s2.id);
      }
    }
  }

  // Compute max count and top pairs
  let maxCount = 0;
  const pairs = [];
  alterIds.forEach((a, ai) => {
    alterIds.forEach((b, bi) => {
      if (bi <= ai) return;
      const count = matrix[a][b] || 0;
      if (count > 0) pairs.push({ a, b, count });
      if (count > maxCount) maxCount = count;
    });
  });
  pairs.sort((x, y) => y.count - x.count);

  return { matrix, maxCount, pairs };
}

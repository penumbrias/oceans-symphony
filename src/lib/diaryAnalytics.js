/**
 * Aggregates multiple diary card entries for the same date into daily averages
 * Enables tracking of per-alter tendencies and daily trends
 */

export function aggregateDailyMetrics(cards) {
  const byDate = {};

  cards.forEach((card) => {
    if (!card.date) return;

    if (!byDate[card.date]) {
      byDate[card.date] = {
        date: card.date,
        entries: [],
        entryCount: 0,
        alterData: {},
      };
    }

    byDate[card.date].entries.push(card);
    byDate[card.date].entryCount += 1;

    // Track per-alter metrics
    const alterId = card.fronting_alter_ids?.[0] || "unknown";
    if (!byDate[card.date].alterData[alterId]) {
      byDate[card.date].alterData[alterId] = {
        entryCount: 0,
        entries: [],
      };
    }
    byDate[card.date].alterData[alterId].entryCount += 1;
    byDate[card.date].alterData[alterId].entries.push(card);
  });

  // Calculate aggregates for each date
  const aggregated = Object.values(byDate).map((dayData) => {
    const agg = {
      date: dayData.date,
      entryCount: dayData.entryCount,
      entries: dayData.entries,
    };

    // Average body/mind metrics
    const bodyMindMetrics = ["emotional_misery", "physical_misery", "joy"];
    bodyMindMetrics.forEach((metric) => {
      const values = dayData.entries
        .map((e) => e.body_mind?.[metric])
        .filter((v) => v !== undefined);
      if (values.length > 0) {
        agg[`avg_${metric}`] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
      }
    });

    // Average urge metrics
    const urgeMetrics = ["suicidal", "self_harm", "alcohol_drugs"];
    urgeMetrics.forEach((metric) => {
      const values = dayData.entries
        .map((e) => e.urges?.[metric])
        .filter((v) => v !== undefined);
      if (values.length > 0) {
        agg[`avg_urge_${metric}`] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
      }
    });

    // Medication & safety flags
    agg.rx_meds_taken = dayData.entries.some((e) => e.medication_safety?.rx_meds_taken);
    agg.self_harm_occurred = dayData.entries.some((e) => e.medication_safety?.self_harm_occurred);
    const substanceCounts = dayData.entries
      .map((e) => e.medication_safety?.substances_count)
      .filter((v) => v !== undefined);
    if (substanceCounts.length > 0) {
      agg.total_substances = substanceCounts.reduce((a, b) => a + b, 0);
    }

    // Total skills practiced
    const skillsValues = dayData.entries
      .map((e) => e.skills_practiced)
      .filter((v) => v !== undefined);
    if (skillsValues.length > 0) {
      agg.total_skills = skillsValues.reduce((a, b) => a + b, 0);
    }

    // Aggregate checklist (symptoms & habits)
    const checklist = { symptoms: {}, habits: {} };
    dayData.entries.forEach((entry) => {
      const entryChecklist = entry.checklist || {};
      // Merge symptoms
      Object.entries(entryChecklist.symptoms || {}).forEach(([key, value]) => {
        if (checklist.symptoms[key] === undefined) {
          checklist.symptoms[key] = [];
        }
        if (value !== undefined && value !== null) {
          checklist.symptoms[key].push(value);
        }
      });
      // Merge habits
      Object.entries(entryChecklist.habits || {}).forEach(([key, value]) => {
        if (checklist.habits[key] === undefined) {
          checklist.habits[key] = [];
        }
        if (value !== undefined && value !== null) {
          checklist.habits[key].push(value);
        }
      });
    });
    
    // Average the collected values
    Object.keys(checklist.symptoms).forEach((key) => {
      if (checklist.symptoms[key].length > 0) {
        const values = checklist.symptoms[key];
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        checklist.symptoms[key] = Math.round(avg * 10) / 10;
      }
    });
    Object.keys(checklist.habits).forEach((key) => {
      if (checklist.habits[key].length > 0) {
        const values = checklist.habits[key];
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        checklist.habits[key] = Math.round(avg * 10) / 10;
      }
    });
    agg.checklist = checklist;

    // Per-alter breakdown
    agg.alterBreakdown = Object.entries(dayData.alterData).map(([alterId, alterDay]) => ({
      alterId,
      entryCount: alterDay.entryCount,
      avg_emotional_misery: calcAverage(alterDay.entries, (e) => e.body_mind?.emotional_misery),
      avg_joy: calcAverage(alterDay.entries, (e) => e.body_mind?.joy),
      avg_physical_misery: calcAverage(alterDay.entries, (e) => e.body_mind?.physical_misery),
    }));

    return agg;
  });

  return aggregated;
}

/**
 * Helper to calculate average from entry values
 */
function calcAverage(entries, accessor) {
  const values = entries.map(accessor).filter((v) => v !== undefined);
  if (values.length === 0) return undefined;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/**
 * Get per-alter aggregate stats across a date range
 * Shows tendencies (e.g., "Alter X tends to rate emotional_misery 7/10")
 */
export function getAlterTendencies(cards) {
  const byAlter = {};

  cards.forEach((card) => {
    const alters = card.fronting_alter_ids || [];
    alters.forEach((alterId) => {
      if (!byAlter[alterId]) {
        byAlter[alterId] = {
          alterId,
          entryCount: 0,
          entries: [],
        };
      }
      byAlter[alterId].entryCount += 1;
      byAlter[alterId].entries.push(card);
    });
  });

  return Object.values(byAlter).map((alterData) => ({
    alterId: alterData.alterId,
    entryCount: alterData.entryCount,
    avg_emotional_misery: calcAverage(alterData.entries, (e) => e.body_mind?.emotional_misery),
    avg_joy: calcAverage(alterData.entries, (e) => e.body_mind?.joy),
    avg_physical_misery: calcAverage(alterData.entries, (e) => e.body_mind?.physical_misery),
    avg_urge_self_harm: calcAverage(alterData.entries, (e) => e.urges?.self_harm),
    total_skills: alterData.entries
      .reduce((sum, e) => sum + (e.skills_practiced || 0), 0),
  }));
}
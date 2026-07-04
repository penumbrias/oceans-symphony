// Clinician summary (Phase 5): a computed, "readable in seconds" block for
// the Therapy Report, powered by the SAME engine as the Analytics page —
// so the numbers a therapist sees match the numbers the system sees.
//
// eMoods-style: short factual sentences, descriptive language, an explicit
// method footnote. No judgment words, no causal claims.

import { buildRange, priorRange } from "./range";
import { frontingRollup, emotionRollup, sleepRollup } from "./rollups";
import { frontShare } from "./fronting";
import { topSymptoms, afterDistress, preSwitchSignature } from "./wellbeing";
import { formatHoursMs } from "./insights";

const rate = (n, of) => (of > 0 ? Math.round((n / of) * 100) : null);
const perWeek = (total, days) => (days > 0 ? (total / days) * 7 : 0);

// Parse a "YYYY-MM-DD" report-boundary string as a LOCAL day. `new Date(str)`
// would parse it as UTC midnight, silently shifting the window by a day in
// any timezone behind UTC — which is exactly the report-vs-page drift this
// module exists to eliminate.
function parseLocalDay(str, endOfDay = false) {
  const [y, m, d] = String(str).split("-").map(Number);
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d);
}

export function buildClinicianParagraphs({
  sessions = [],
  emotionCheckIns = [],
  symptomCheckIns = [],
  symptoms = [],
  sleepRecords = [],
  dateFrom,
  dateTo,
}) {
  const range = buildRange(parseLocalDay(dateFrom), parseLocalDay(dateTo, true));
  const prior = priorRange(range);
  const out = [];

  const fronting = frontingRollup({ sessions, range, priorRangeObj: prior });
  const priorFronting = frontingRollup({ sessions, range: prior });
  const share = frontShare({ sessions, range, mode: "flat" });
  const emotions = emotionRollup({ emotionCheckIns, range, priorRangeObj: prior });
  const priorEmotions = emotionRollup({ emotionCheckIns, range: prior });
  const sleep = sleepRollup({ sleepRecords, range });
  const symTop = topSymptoms({ symptomCheckIns, range, maxResults: 3 });
  const recovery = afterDistress({ emotionCheckIns, range });
  const preSwitch = preSwitchSignature({ sessions, symptomCheckIns, range });

  // Switching
  if (fronting.switchesTotal > 0) {
    let s = `Switching: ${fronting.switchesTotal} tracked switches (~${perWeek(fronting.switchesTotal, range.days).toFixed(1)}/week)`;
    if (priorFronting.switchesTotal > 0) {
      s += `; the preceding period of equal length had ${priorFronting.switchesTotal} (~${perWeek(priorFronting.switchesTotal, prior.days).toFixed(1)}/week)`;
    }
    s += `. ${fronting.distinctFronters} member${fronting.distinctFronters === 1 ? "" : "s"} fronted; total tracked fronting time ${formatHoursMs(fronting.frontedMs)} (${rate(share.trackedMs, share.windowMs) ?? 0}% of the period — the remainder is untracked, not absence).`;
    out.push(s);
  }

  // Distress frequency
  if (emotions.checkInsTotal > 0) {
    let s = `Distress: ${emotions.distressCount} of ${emotions.checkInsTotal} emotion check-ins carried a distress flag (${rate(emotions.distressCount, emotions.checkInsTotal)}%)`;
    if (priorEmotions.checkInsTotal > 0) {
      s += `; the preceding period: ${priorEmotions.distressCount} of ${priorEmotions.checkInsTotal} (${rate(priorEmotions.distressCount, priorEmotions.checkInsTotal)}%)`;
    }
    s += ".";
    if (!recovery.gated) {
      s += ` After a distress-flagged check-in, the next check-in within ${recovery.windowHours}h was calmer ${recovery.calmerN} of ${recovery.pairsN} times.`;
    }
    out.push(s);
  }

  // Sleep
  if (sleep.nightsLogged > 0 && sleep.avgHours != null) {
    let s = `Sleep: ${sleep.avgHours.toFixed(1)}h average across ${sleep.nightsLogged} logged night${sleep.nightsLogged === 1 ? "" : "s"}`;
    if (sleep.avgQuality != null) s += `, self-rated quality ${sleep.avgQuality.toFixed(1)}`;
    s += ". Unlogged nights are excluded, not counted as zero.";
    out.push(s);
  }

  // Symptoms
  if (symTop.length > 0) {
    const symptomsById = {};
    for (const sy of symptoms) symptomsById[sy.id] = sy;
    const parts = symTop.map((r) => {
      const label = symptomsById[r.symptomId]?.label || symptomsById[r.symptomId]?.name || "symptom";
      return `${label} ${r.count}×${r.avgSeverity != null ? ` (avg severity ${r.avgSeverity.toFixed(1)})` : ""}`;
    });
    out.push(`Most-logged symptoms: ${parts.join("; ")}.`);
  }

  // Pre-switch observation
  if (!preSwitch.gated && preSwitch.rows.length > 0) {
    const symptomsById = {};
    for (const sy of symptoms) symptomsById[sy.id] = sy;
    const top = preSwitch.rows[0];
    const label = symptomsById[top.symptomId]?.label || symptomsById[top.symptomId]?.name || "a symptom";
    out.push(`Observation: ${label} was logged in the ${preSwitch.hoursBefore}h before a tracked switch at ~${top.lift.toFixed(1)}× its overall rate (${top.pre} of ${top.total} logs), across ${preSwitch.switchesN} switches. Co-occurrence only — not a causal or predictive claim.`);
  }

  if (out.length === 0) return [];

  return [
    `Clinician summary (computed): the following figures are derived from tracked entries between ${dateFrom} and ${dateTo}, using the same calculations as the in-app Analytics.`,
    ...out,
    `Method note: all counts describe what was logged; days without entries are treated as unknown rather than zero, open-ended sessions are clamped to the report window, and comparative statements describe co-occurrence, not causation.`,
  ];
}

// reportSections.js — data extraction and formatting for each report section
// All logic is pure: takes raw entity arrays, returns structured data for the PDF generator.

import { format, differenceInMinutes, parseISO, isWithinInterval } from "date-fns";

// ── helpers ──────────────────────────────────────────────────────────────────

export function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= new Date(from) && d <= new Date(to + "T23:59:59");
}

function msToHm(ms) {
  if (!ms || ms <= 0) return "0m";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(str) {
  try { return format(parseISO(str), "MMM d, yyyy"); } catch { return str || ""; }
}

function fmtDateTime(str) {
  try { return format(parseISO(str), "MMM d, yyyy h:mm a"); } catch { return str || ""; }
}

function alterName(alterId, alters, includeAlterInfo) {
  if (!includeAlterInfo) return "a system member";
  const a = alters.find(x => x.id === alterId);
  return a ? a.name : "unknown";
}

// ── DEFAULT THRESHOLDS ────────────────────────────────────────────────────────

export const DEFAULT_THRESHOLDS = {
  urge_min: 3,
  symptom_severity_min: 4,
  symptom_session_min_minutes: 120,
  rapid_switch_count: 3,
  rapid_switch_window_minutes: 60,
  mood_avg_below: 3,
};

// ── SECTION: OVERVIEW ─────────────────────────────────────────────────────────

export function buildOverview({ dateFrom, dateTo, frontingSessions, emotionCheckIns, journalEntries, symptoms, diaryCards, alters, thresholds, mode }) {
  const sessions = frontingSessions.filter(s => inRange(s.start_time, dateFrom, dateTo));
  const checkins = emotionCheckIns.filter(c => inRange(c.timestamp || c.created_date, dateFrom, dateTo));
  const journals = journalEntries.filter(j => inRange(j.created_date, dateFrom, dateTo));
  const cards = diaryCards.filter(d => inRange(d.date, dateFrom, dateTo));

  return {
    dateFrom,
    dateTo,
    frontingCount: sessions.length,
    checkInCount: checkins.length,
    journalCount: journals.length,
    diaryCardCount: cards.length,
    alterCount: alters.filter(a => !a.is_archived).length,
  };
}

// ── SECTION: FRONTING HISTORY ─────────────────────────────────────────────────

export function buildFrontingSection({ dateFrom, dateTo, frontingSessions, alters, includeAlterInfo, thresholds, mode }) {
  const sessions = frontingSessions
    .filter(s => inRange(s.start_time, dateFrom, dateTo))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  // Per-alter totals
  const alterTotals = {};
  sessions.forEach(s => {
    const id = s.alter_id || s.primary_alter_id;
    if (!id) return;
    const start = new Date(s.start_time);
    const end = s.end_time ? new Date(s.end_time) : new Date();
    const ms = end - start;
    if (!alterTotals[id]) alterTotals[id] = { ms: 0, sessions: 0, primary: 0, cofronting: 0 };
    alterTotals[id].ms += ms;
    alterTotals[id].sessions += 1;
    if (s.is_primary) alterTotals[id].primary += 1;
  });

  const summaryTable = Object.entries(alterTotals).map(([id, t]) => ({
    name: alterName(id, alters, includeAlterInfo),
    total: msToHm(t.ms),
    sessions: t.sessions,
    primary: t.primary,
  })).sort((a, b) => b.sessions - a.sessions);

  // Flag notable events
  const noteworthy = [];
  // Rapid switching: >N switches in window
  const switchTimes = sessions.map(s => new Date(s.start_time).getTime()).sort((a, b) => a - b);
  for (let i = 0; i < switchTimes.length; i++) {
    const window = switchTimes.filter(t => t >= switchTimes[i] && t <= switchTimes[i] + thresholds.rapid_switch_window_minutes * 60000);
    if (window.length >= thresholds.rapid_switch_count) {
      noteworthy.push({
        type: "rapid_switching",
        label: "Rapid switching",
        date: fmtDateTime(sessions[i].start_time),
        detail: `${window.length} switches within ${thresholds.rapid_switch_window_minutes} min`,
      });
      break; // only flag once per cluster
    }
  }

  const sessionList = sessions.map(s => {
    const id = s.alter_id || s.primary_alter_id;
    const start = new Date(s.start_time);
    const end = s.end_time ? new Date(s.end_time) : null;
    const ms = end ? end - start : null;
    const coFronters = (s.co_fronter_ids || [])
      .map(cid => alterName(cid, alters, includeAlterInfo))
      .filter(Boolean);
    return {
      date: fmtDateTime(s.start_time),
      who: alterName(id, alters, includeAlterInfo),
      coFronters: coFronters.length > 0 ? coFronters.join(", ") : null,
      duration: ms ? msToHm(ms) : "ongoing",
      note: s.note || "",
      isPrimary: s.is_primary,
    };
  });

  return { summaryTable, sessionList, noteworthy, totalSessions: sessions.length };
}

// ── SECTION: EMOTION CHECK-INS ────────────────────────────────────────────────

export function buildEmotionSection({ dateFrom, dateTo, emotionCheckIns, alters, includeAlterInfo, thresholds, mode }) {
  const checkins = emotionCheckIns
    .filter(c => inRange(c.timestamp || c.created_date, dateFrom, dateTo))
    .sort((a, b) => new Date(a.timestamp || a.created_date) - new Date(b.timestamp || b.created_date));

  // Emotion frequency
  const emotionFreq = {};
  checkins.forEach(c => {
    (c.emotions || []).forEach(e => { emotionFreq[e] = (emotionFreq[e] || 0) + 1; });
  });
  const topEmotions = Object.entries(emotionFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([e, n]) => ({ emotion: e, count: n }));

  const noteworthy = checkins
    .filter(c => (c.emotions || []).some(e => e.toLowerCase().includes("crisis") || e.toLowerCase().includes("suicid") || e.toLowerCase().includes("harm")))
    .map(c => ({
      date: fmtDateTime(c.timestamp || c.created_date),
      emotions: (c.emotions || []).join(", "),
      note: c.note || "",
      who: alterName(c.fronting_alter_id, alters, includeAlterInfo),
      label: "Crisis check-in",
    }));

  const checkInList = checkins.map(c => ({
    date: fmtDateTime(c.timestamp || c.created_date),
    emotions: (c.emotions || []).join(", "),
    note: c.note || "",
    who: includeAlterInfo ? alterName(c.fronting_alter_id, alters, includeAlterInfo) : null,
  }));

  return { topEmotions, checkInList, noteworthy, totalCheckIns: checkins.length };
}

// ── SECTION: SYMPTOMS ─────────────────────────────────────────────────────────

export function buildSymptomsSection({ dateFrom, dateTo, symptoms, symptomCheckIns, symptomSessions, thresholds, mode }) {
  const checkIns = symptomCheckIns.filter(c => inRange(c.timestamp, dateFrom, dateTo));
  const sessions = symptomSessions.filter(s => inRange(s.start_time, dateFrom, dateTo));

  const symptomMap = Object.fromEntries(symptoms.map(s => [s.id, s]));

  // Per-symptom summary
  const bySymptom = {};
  checkIns.forEach(c => {
    const sym = symptomMap[c.symptom_id];
    if (!sym) return;
    if (!bySymptom[c.symptom_id]) bySymptom[c.symptom_id] = { label: sym.label, count: 0, severities: [], sessions: 0, sessionMs: 0 };
    bySymptom[c.symptom_id].count += 1;
    if (c.severity != null) bySymptom[c.symptom_id].severities.push(c.severity);
  });

  sessions.forEach(s => {
    if (!bySymptom[s.symptom_id]) {
      const sym = symptomMap[s.symptom_id];
      if (!sym) return;
      bySymptom[s.symptom_id] = { label: sym.label, count: 0, severities: [], sessions: 0, sessionMs: 0 };
    }
    bySymptom[s.symptom_id].sessions += 1;
    if (s.end_time) {
      bySymptom[s.symptom_id].sessionMs += new Date(s.end_time) - new Date(s.start_time);
    }
  });

  const summaryTable = Object.values(bySymptom).map(s => ({
    label: s.label,
    count: s.count,
    avgSeverity: s.severities.length > 0 ? (s.severities.reduce((a, b) => a + b, 0) / s.severities.length).toFixed(1) : "—",
    activeSessions: s.sessions,
    totalDuration: s.sessionMs > 0 ? msToHm(s.sessionMs) : "—",
  })).sort((a, b) => b.count - a.count);

  // Noteworthy
  const noteworthy = [];
  checkIns.forEach(c => {
    if (c.severity >= thresholds.symptom_severity_min) {
      const sym = symptomMap[c.symptom_id];
      noteworthy.push({
        date: fmtDateTime(c.timestamp),
        label: sym?.label || "Symptom",
        severity: c.severity,
        flag: `Severity ${c.severity}`,
      });
    }
  });
  sessions.forEach(s => {
    if (s.end_time) {
      const mins = differenceInMinutes(new Date(s.end_time), new Date(s.start_time));
      if (mins >= thresholds.symptom_session_min_minutes) {
        const sym = symptomMap[s.symptom_id];
        noteworthy.push({
          date: fmtDateTime(s.start_time),
          label: sym?.label || "Symptom",
          detail: msToHm((new Date(s.end_time) - new Date(s.start_time))),
          flag: `Long session (${msToHm(mins * 60000)})`,
        });
      }
    }
  });

  return { summaryTable, noteworthy };
}

// ── SECTION: ACTIVITIES ────────────────────────────────────────────────────────

export function buildActivitiesSection({ dateFrom, dateTo, activities }) {
  const acts = activities.filter(a => inRange(a.timestamp || a.start_time || a.created_date, dateFrom, dateTo));

  const freq = {};
  acts.forEach(a => {
    const key = a.activity_name || a.name || "Activity";
    if (!freq[key]) freq[key] = { count: 0, ms: 0 };
    freq[key].count += 1;
    if (a.duration_minutes) freq[key].ms += a.duration_minutes * 60000;
  });

  const list = Object.entries(freq)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, d]) => ({ name, count: d.count, duration: d.ms > 0 ? msToHm(d.ms) : "—" }));

  return { list, total: acts.length };
}

// ── SECTION: JOURNALS ─────────────────────────────────────────────────────────

export function buildJournalsSection({ dateFrom, dateTo, journalEntries, journalDetail }) {
  const entries = journalEntries
    .filter(j => inRange(j.created_date, dateFrom, dateTo))
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  return entries.map(j => {
    const base = { date: fmtDate(j.created_date), title: j.title || "Untitled" };
    if (journalDetail === "full") return { ...base, content: j.content || "" };
    if (journalDetail === "excerpts") return { ...base, excerpt: (j.content || "").slice(0, 400) };
    return base; // summaries only
  });
}

// ── SECTION: DIARY CARDS ──────────────────────────────────────────────────────

export function buildDiarySection({ dateFrom, dateTo, diaryCards, alters, includeAlterInfo, thresholds, mode }) {
  const cards = diaryCards
    .filter(d => inRange(d.date, dateFrom, dateTo))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const isNoteworthy = (card) => {
    const urges = card.urges || {};
    const bm = card.body_mind || {};
    return (
      Object.values(urges).some(v => v >= thresholds.urge_min) ||
      bm.emotional_misery >= 4 || bm.physical_misery >= 4 || bm.joy <= 2
    );
  };

  const toInclude = mode === "smart" ? cards.filter(isNoteworthy) : cards;

  return toInclude.map(card => {
    const fronters = (card.fronting_alter_ids || [])
      .map(id => alterName(id, alters, includeAlterInfo))
      .join(", ") || null;
    const urges = card.urges || {};
    const bm = card.body_mind || {};
    const flags = [];
    if (Object.values(urges).some(v => v >= thresholds.urge_min)) flags.push("High urge rating");
    if (bm.emotional_misery >= 4) flags.push("High emotional misery");
    if (bm.physical_misery >= 4) flags.push("High physical misery");
    return {
      date: fmtDate(card.date),
      emotions: (card.emotions || []).join(", ") || "—",
      urges: Object.entries(urges).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(", ") || "—",
      bodyMind: Object.entries(bm).filter(([, v]) => v != null).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ") || "—",
      fronters,
      flags,
    };
  });
}

// ── SECTION: CUSTOM STATUS NOTES ─────────────────────────────────────────────

export function buildStatusNotesSection({ dateFrom, dateTo, emotionCheckIns }) {
  const notes = emotionCheckIns
    .filter(c => {
      if (!c.note || !c.note.trim()) return false;
      return inRange(c.timestamp || c.created_date, dateFrom, dateTo);
    })
    .sort((a, b) => new Date(a.timestamp || a.created_date) - new Date(b.timestamp || b.created_date));

  return notes.flatMap(c => {
    let entries = [];
    try {
      const parsed = JSON.parse(c.note);
      entries = Array.isArray(parsed)
        ? parsed.map(n => ({ text: n.text || "", timestamp: n.timestamp || c.timestamp || c.created_date }))
        : [{ text: c.note, timestamp: c.timestamp || c.created_date }];
    } catch {
      entries = [{ text: c.note, timestamp: c.timestamp || c.created_date }];
    }
    return entries
      .filter(n => n.text.trim())
      .map(n => ({
        date: fmtDateTime(n.timestamp),
        note: n.text.trim(),
        emotions: (c.emotions || []).join(", ") || null,
      }));
  });
}

// ── SECTION: PATTERNS SUMMARY ─────────────────────────────────────────────────

export function buildPatternsSummary({ systemName, dateFrom, dateTo, overview, frontingData, emotionData, symptomsData, diaryData }) {
  const name = systemName || "The system";
  const dayCount = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;
  const topEmotions = (emotionData?.topEmotions || []).slice(0, 3).map(e => e.emotion);
  const topSymptoms = (symptomsData?.summaryTable || []).slice(0, 3).map(s => s.label);
  const crisisCount = (emotionData?.noteworthy || []).length;

  let text = `During this ${dayCount}-day period (${fmtDate(dateFrom)} to ${fmtDate(dateTo)}), ${name} recorded ${overview.frontingCount} fronting session${overview.frontingCount !== 1 ? "s" : ""}.`;

  if (topEmotions.length > 0) {
    text += ` The most frequently logged emotions were ${topEmotions.join(", ")}.`;
  }
  if (topSymptoms.length > 0) {
    text += ` The most tracked symptoms or habits were ${topSymptoms.join(", ")}.`;
  }
  if (overview.checkInCount > 0) {
    text += ` There were ${overview.checkInCount} emotion check-in${overview.checkInCount !== 1 ? "s" : ""} recorded.`;
  }
  if (crisisCount > 0) {
    text += ` ${crisisCount} check-in${crisisCount !== 1 ? "s" : ""} included crisis-level distress.`;
  }
  if (overview.journalCount > 0) {
    text += ` ${overview.journalCount} journal entr${overview.journalCount !== 1 ? "ies were" : "y was"} written.`;
  }
  if (frontingData?.noteworthy?.length > 0) {
    text += ` ${frontingData.noteworthy.length} notable fronting event${frontingData.noteworthy.length !== 1 ? "s were" : " was"} flagged.`;
  }

  return text;
}

// ── SECTION: ALTER APPENDIX ───────────────────────────────────────────────────

export function buildAlterAppendix({ alters, alterIdsInReport }) {
  const ids = new Set(alterIdsInReport);
  return alters
    .filter(a => ids.has(a.id) && !a.is_archived)
    .map(a => ({
      name: a.name,
      pronouns: a.pronouns || null,
      role: a.role || null,
      bio: a.description ? a.description.slice(0, 200) : null,
    }));
}

// ── SECTION: BULLETINS ────────────────────────────────────────────────────────

export function buildBulletinsSection({ dateFrom, dateTo, bulletins, alters, includeAlterInfo }) {
  const items = bulletins
    .filter(b => inRange(b.created_date, dateFrom, dateTo))
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  return items.map(b => ({
    date: fmtDateTime(b.created_date),
    title: b.title || "Bulletin",
    content: b.content ? b.content.slice(0, 500) : "",
    author: includeAlterInfo ? (alterName(b.author_alter_id, alters, true) || null) : null,
    isPinned: !!b.is_pinned,
  }));
}

// ── SECTION: SYSTEM CHECK-INS ─────────────────────────────────────────────────

export function buildSystemCheckInsSection({ dateFrom, dateTo, systemCheckIns, alters, includeAlterInfo }) {
  const items = systemCheckIns
    .filter(c => inRange(c.created_date, dateFrom, dateTo))
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  return items.map(c => {
    const responses = c.responses || c.answers || {};
    const summaryParts = Object.entries(responses)
      .filter(([, v]) => v != null && v !== "")
      .slice(0, 5)
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
    return {
      date: fmtDateTime(c.created_date),
      title: c.title || "System Check-In",
      summary: summaryParts.join(" · ") || null,
      overallRating: c.overall_rating ?? c.rating ?? null,
    };
  });
}

// ── SECTION: TASKS SUMMARY ────────────────────────────────────────────────────

export function buildTasksSummarySection({ dateFrom, dateTo, tasks, dailyProgress }) {
  const periodTasks = tasks.filter(t => {
    if (!t.frequency || t.frequency === "daily") return true;
    return true; // include all tasks that were active in period
  });

  const completedInPeriod = (dailyProgress || [])
    .filter(p => inRange(p.date || p.period_key, dateFrom, dateTo));

  const completionByFreq = {};
  completedInPeriod.forEach(p => {
    const freq = p.frequency || "daily";
    if (!completionByFreq[freq]) completionByFreq[freq] = { periods: 0, totalCompleted: 0, totalTasks: 0 };
    completionByFreq[freq].periods += 1;
    completionByFreq[freq].totalCompleted += (p.completed_task_ids || []).length;
  });

  const frequencySummary = Object.entries(completionByFreq).map(([freq, data]) => ({
    frequency: freq,
    periods: data.periods,
    avgCompleted: data.periods > 0 ? (data.totalCompleted / data.periods).toFixed(1) : "0",
  }));

  const taskList = periodTasks.slice(0, 20).map(t => ({
    title: t.title,
    frequency: t.frequency || "daily",
  }));

  return { taskList, frequencySummary, totalTasks: periodTasks.length };
}
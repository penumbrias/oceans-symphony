// Per-alter fingerprint (Phase 4): one alter's footprint across every data
// family, for the Analytics → Alters tab and the alter-profile link.
//
// Attribution here is EXPLICIT ONLY (alter_id / fronting_alter_ids /
// author fields) — a fingerprint says "what this alter logged / was tagged
// in", so session-overlap inference is deliberately not applied. The
// component states that plainly.

import { normalizeSessions, sessionsInRange } from "@/lib/sessionNormalizer";
import { whKey } from "@/components/analytics/primitives/WeekHourHeatmap";
import { toMs, inRange } from "./range";
import { TEXTURE_BUCKETS } from "./fronting";

function taggedToAlter(record, alterId) {
  if (!record) return false;
  if (record.alter_id === alterId) return true;
  if (Array.isArray(record.fronting_alter_ids) && record.fronting_alter_ids.includes(alterId)) return true;
  if (record.author_alter_id === alterId) return true;
  if (Array.isArray(record.author_alter_ids) && record.author_alter_ids.includes(alterId)) return true;
  return false;
}

export function alterFingerprint({
  alterId,
  sessions = [],
  emotionCheckIns = [],
  symptomCheckIns = [],
  journals = [],
  bulletins = [],
  chatMessages = [],
  activities = [],
  range,
}) {
  const now = range.now;

  // ---- Fronting (range-clipped) + last fronted (all time) ----
  const normalized = normalizeSessions(sessions, now);
  const mine = normalized.filter((s) => s.alterIds.includes(alterId));
  let lastFrontedMs = null;
  for (const s of mine) {
    const seenAt = s.endMs != null ? s.endMs : now;
    if (lastFrontedMs == null || seenAt > lastFrontedMs) lastFrontedMs = seenAt;
  }
  const inWin = sessionsInRange(mine, range.fromMs, range.toMs, now);
  const durations = [];
  const startCells = new Map();
  let totalMs = 0;
  for (const s of inWin) {
    const start = Math.max(s.startMs, range.fromMs);
    const end = s.endMs != null ? Math.min(s.endMs, range.toMs) : Math.min(now, range.toMs);
    const dur = end - start;
    if (dur <= 0) continue;
    durations.push(dur);
    totalMs += dur;
    const d = new Date(s.startMs);
    const key = whKey(d.getDay(), d.getHours());
    startCells.set(key, (startCells.get(key) || 0) + 1);
  }
  durations.sort((a, b) => a - b);
  const buckets = TEXTURE_BUCKETS.map(() => 0);
  for (const d of durations) {
    const idx = TEXTURE_BUCKETS.findIndex((b) => d <= b.maxMs);
    buckets[idx === -1 ? TEXTURE_BUCKETS.length - 1 : idx]++;
  }

  // ---- Emotions tagged to them ----
  // Per-emotion assignment (emotion_alters: { label: [alterIds] }) wins
  // over whole-record tagging: an emotion explicitly assigned to someone
  // else doesn't count here even if this alter was fronting; one assigned
  // to this alter counts even when they weren't in fronting_alter_ids.
  const emotionCounts = new Map();
  let distressCount = 0;
  let emotionN = 0;
  for (const c of emotionCheckIns) {
    const ms = toMs(c.timestamp || c.created_date);
    if (ms == null || !inRange(ms, range)) continue;
    const recordTagged = taggedToAlter(c, alterId);
    let countedAny = false;
    for (const e of c.emotions || []) {
      if (!e) continue;
      const assigned = c.emotion_alters?.[e];
      const mine = Array.isArray(assigned) && assigned.length > 0
        ? assigned.includes(alterId)
        : recordTagged;
      if (!mine) continue;
      countedAny = true;
      emotionCounts.set(e, (emotionCounts.get(e) || 0) + 1);
    }
    if (countedAny || (recordTagged && (c.emotions || []).length === 0)) {
      emotionN++;
      if (c.is_distress) distressCount++;
    }
  }
  const topEmotions = [...emotionCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ---- Symptoms tagged to them ----
  // SymptomCheckIn rows now carry fronting_alter_ids (per-item assignment
  // or the check-in's fronters at save time) — taggedToAlter covers both
  // that and the legacy alter_id field, reviving this previously-dead
  // branch (old rows had no attribution at all and simply don't match).
  const symptomCounts = new Map();
  for (const c of symptomCheckIns) {
    const ms = toMs(c.timestamp || c.created_date);
    if (ms == null || !inRange(ms, range)) continue;
    if (!taggedToAlter(c, alterId)) continue;
    const id = c.symptom_id;
    if (!id) continue;
    if (!symptomCounts.has(id)) symptomCounts.set(id, { count: 0, sevSum: 0, sevN: 0 });
    const row = symptomCounts.get(id);
    row.count++;
    const sev = Number(c.severity);
    if (Number.isFinite(sev) && sev > 0) { row.sevSum += sev; row.sevN++; }
  }
  const topSymptoms = [...symptomCounts.entries()]
    .map(([symptomId, r]) => ({ symptomId, count: r.count, avgSeverity: r.sevN ? r.sevSum / r.sevN : null }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ---- Footprint counts ----
  const countTagged = (items, msField = "created_date") => {
    let n = 0;
    for (const it of items) {
      const ms = toMs(it[msField] || it.timestamp || it.created_date);
      if (ms == null || !inRange(ms, range)) continue;
      if (taggedToAlter(it, alterId)) n++;
    }
    return n;
  };

  return {
    fronting: {
      totalMs,
      count: durations.length,
      medianMs: durations.length ? durations[Math.floor(durations.length / 2)] : null,
      longestMs: durations.length ? durations[durations.length - 1] : null,
      buckets,
      startCells,
      lastFrontedMs,
    },
    emotions: { topEmotions, distressCount, checkInsN: emotionN },
    symptoms: topSymptoms,
    footprint: {
      journals: countTagged(journals),
      bulletins: countTagged(bulletins),
      chatMessages: countTagged(chatMessages, "timestamp"),
      activities: countTagged(activities, "timestamp"),
    },
  };
}

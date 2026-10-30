// Counting feelings and symptoms over a window (v0.324.0). The Feelings
// analytics section and the look-back widgets read the same numbers from
// here, so "Anxious × 12" on a widget matches the analytics page.
//
// A feeling event is { ts, labels[], alterIds[], emotionAlters? }: every
// EmotionCheckIn plus the per-alter `session_emotions` on fronting
// sessions. `emotionAlters` ({ label: [alterIds] }) overrides who a single
// feeling belongs to; [] means nobody.

import { parseSessionEmotions } from "@/lib/perAlterSessionEntries";
import { recordMentionsAlters } from "@/lib/boardSubject";

export function emotionEvents({ checkIns = [], sessions = [], from, to, inferAlters = () => [] }) {
  const lo = +from;
  const hi = +to;
  const inRange = (ts) => Number.isFinite(ts) && ts >= lo && ts <= hi;
  const out = [];
  for (const c of checkIns) {
    const ts = +new Date(c.timestamp);
    if (!inRange(ts)) continue;
    const labels = Array.isArray(c.emotions) ? c.emotions.filter(Boolean) : [];
    if (labels.length === 0) continue;
    // The recorded fronters; with none, whoever authored something near
    // this time, so the feeling is still attributed.
    const explicit = Array.isArray(c.fronting_alter_ids) ? c.fronting_alter_ids.filter(Boolean) : [];
    out.push({
      ts, labels,
      alterIds: explicit.length ? explicit : inferAlters(ts),
      emotionAlters: c.emotion_alters && typeof c.emotion_alters === "object" ? c.emotion_alters : null,
    });
  }
  for (const s of sessions) {
    const labels = parseSessionEmotions(s.session_emotions);
    if (labels.length === 0) continue;
    const ts = +new Date(s.start_time || s.timestamp);
    if (!inRange(ts)) continue;
    const alterId = s.alter_id || s.primary_alter_id;
    out.push({ ts, labels, alterIds: alterId ? [alterId] : [] });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

// Who a single feeling in an event belongs to.
export function feelingAlterIds(event, label) {
  const assigned = event.emotionAlters?.[label];
  return Array.isArray(assigned) ? assigned : event.alterIds;
}

// { label: count }. `scopeIds` null counts everyone's; otherwise only
// feelings that belong to one of those alters.
export function countEmotions(events, scopeIds = null) {
  const counts = {};
  for (const e of events) {
    for (const l of e.labels) {
      if (scopeIds && !feelingAlterIds(e, l).some((id) => scopeIds.includes(id))) continue;
      counts[l] = (counts[l] || 0) + 1;
    }
  }
  return counts;
}

// { symptomId: count } of symptom check-ins in the window.
export function countSymptomCheckIns(checkIns = [], from, to, scopeIds = null) {
  const lo = +from;
  const hi = +to;
  const counts = {};
  for (const c of checkIns) {
    const ts = +new Date(c.timestamp);
    if (!Number.isFinite(ts) || ts < lo || ts > hi || !c.symptom_id) continue;
    if (scopeIds && !recordMentionsAlters(c, scopeIds)) continue;
    counts[c.symptom_id] = (counts[c.symptom_id] || 0) + 1;
  }
  return counts;
}

// Rows sorted by count, each with the previous window's count beside it.
export function rankCounts(current, previous = null) {
  return Object.entries(current)
    .map(([key, count]) => ({ key, count, prev: previous ? previous[key] || 0 : null }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

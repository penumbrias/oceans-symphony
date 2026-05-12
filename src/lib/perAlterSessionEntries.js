// Per-alter session entries — read-only surfacing helper.
//
// FrontingSession stores three per-alter payloads as JSON-stringified arrays:
//   - note            : [{ text, timestamp }]    — each note has its own timestamp
//   - session_emotions: ["happy", "anxious", …]   — replaced wholesale on save
//   - session_symptoms: [{ id, label, value, type }] — same, replaced wholesale
//
// This helper flattens those into individual entries so the Check-In Log and
// the alter Board can render them without duplicating the underlying records.

export function parseSessionNote(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function parseSessionEmotions(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function parseSessionSymptoms(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Returns flattened entries:
//   { id, kind, ts (ISO), sessionId, alterId, payload }
// kinds: 'note' | 'emotion' | 'symptom'
//
// Notes use their own per-entry timestamp; emotions/symptoms share the
// session's start_time since they're stored as a set, not a log.
export function extractPerAlterEntries(sessions, { alterId } = {}) {
  const out = [];
  for (const s of sessions || []) {
    const sessionAlter = s.alter_id || s.primary_alter_id;
    if (!sessionAlter) continue;
    if (alterId && sessionAlter !== alterId) continue;
    const sessionTs = s.start_time || s.timestamp;
    if (!sessionTs) continue;

    for (const [i, n] of parseSessionNote(s.note).entries()) {
      out.push({
        id: `pa-note-${s.id}-${i}`,
        kind: "note",
        ts: n.timestamp || sessionTs,
        sessionId: s.id,
        alterId: sessionAlter,
        payload: { text: n.text || "" },
      });
    }

    for (const [i, em] of parseSessionEmotions(s.session_emotions).entries()) {
      out.push({
        id: `pa-emo-${s.id}-${i}`,
        kind: "emotion",
        ts: sessionTs,
        sessionId: s.id,
        alterId: sessionAlter,
        payload: { label: em },
      });
    }

    for (const [i, sym] of parseSessionSymptoms(s.session_symptoms).entries()) {
      out.push({
        id: `pa-sym-${s.id}-${i}`,
        kind: "symptom",
        ts: sessionTs,
        sessionId: s.id,
        alterId: sessionAlter,
        payload: sym,
      });
    }
  }
  return out;
}

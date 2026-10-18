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
// Notes use their own per-entry timestamp.
// Emotions + symptoms are grouped per-session: one entry per session
// whose payload is the full array. Previously this function exploded
// them into one entry PER emotion / PER symptom, which made a
// 22-emotion Quick Check-In render as 22 separate rows on the
// Check-In Log — definitely not the intent.
export function extractPerAlterEntries(sessions, { alterId } = {}) {
  const out = [];
  for (const s of sessions || []) {
    // Legacy: pre-per-alter-model rows can't distinguish per-alter attribution —
    // keep attributing to primary only. Changing this would retroactively
    // re-bucket old notes/emotions/symptoms onto co-fronters, which could
    // surprise users who thought those entries belonged to the primary alone.
    const sessionAlter = s.alter_id || s.primary_alter_id;
    if (!sessionAlter) continue;
    if (alterId && sessionAlter !== alterId) continue;
    const sessionTs = s.start_time || s.timestamp;
    if (!sessionTs) continue;

    // Notes carry their OWN emotions/trigger (stamped when written), so an
    // older note never inherits what was set later. Session-level trigger
    // is only shown on the emotion/symptom row when the session has no notes.
    const trigger = s.is_triggered_switch
      ? { category: s.trigger_category || "", label: s.trigger_label || "" }
      : null;
    const noteList = parseSessionNote(s.note);
    const rowTrigger = noteList.length === 0 ? trigger : null;
    // Legacy sessions (no note carries its own stamp): the session-level
    // emotions/trigger most plausibly belong to the LATEST note only, so
    // older notes in that session stay clean. Once any note is stamped the
    // per-note data is authoritative and there is no fallback.
    // Notes written by the app always carry an `emotions` array (possibly
    // empty) and a `trigger` key, so "legacy" = no emotions array at all.
    const sessionEmotions = parseSessionEmotions(s.session_emotions);
    for (const [i, n] of noteList.entries()) {
      const legacyLast = !Array.isArray(n?.emotions) && i === noteList.length - 1;
      out.push({
        id: `pa-note-${s.id}-${i}`,
        kind: "note",
        ts: n.timestamp || sessionTs,
        sessionId: s.id,
        alterId: sessionAlter,
        payload: { text: n.text || "", emotions: Array.isArray(n.emotions) ? n.emotions : (legacyLast ? sessionEmotions : []) },
        // Per-note only: older notes without a stamp show nothing.
        trigger: n.trigger || (legacyLast ? trigger : null),
      });
    }

    const emotions = parseSessionEmotions(s.session_emotions);
    if (emotions.length > 0) {
      out.push({
        id: `pa-emo-${s.id}`,
        kind: "emotion",
        ts: sessionTs,
        sessionId: s.id,
        alterId: sessionAlter,
        // Always plural; consumers iterate. Keeping `label` for the
        // first item too is a compat shim for older render code.
        payload: { labels: emotions, label: emotions[0] },
        trigger: rowTrigger,
      });
    }

    const symptoms = parseSessionSymptoms(s.session_symptoms);
    if (symptoms.length > 0) {
      out.push({
        id: `pa-sym-${s.id}`,
        kind: "symptom",
        ts: sessionTs,
        sessionId: s.id,
        alterId: sessionAlter,
        // Keep the first-symptom fields at the root as a compat
        // shim so render code that hasn't been updated still has
        // something to show.
        payload: { items: symptoms, ...(symptoms[0] || {}) },
        // Only on the symptom row when no note/emotion row already shows it.
        trigger: emotions.length === 0 ? rowTrigger : null,
      });
    }
  }
  return out;
}

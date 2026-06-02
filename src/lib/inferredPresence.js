// Inferred presence from authored content.
//
// When an alter publishes something (a chat message, bulletin, comment,
// reply, or journal), that's strong evidence they were "present" around
// then — the same way a fronting session is. Analytics can use this so that:
//   - systems that DON'T track fronting still get per-alter attribution, and
//   - attribution is truer to life for everyone.
//
// Each authored "moment" is treated as a presence window centered on the
// publish time (default ±1h = a 2h window). This is used two ways:
//   1. buildInferredSessions(): synthetic FrontingSession-shaped rows so the
//      session normalizer / overlap analytics treat authorship as presence.
//   2. inferAlterIdsAt(): "who was present at this timestamp?" — used as a
//      FALLBACK when a record (activity/emotion/symptom) has no explicit
//      fronting alter recorded, so explicit fronting data is never overridden.
//
// Toggle: on by default; users can turn it off (it shifts analytics numbers).

const HOUR_MS = 60 * 60 * 1000;

// Total presence window per authored moment (centered on the publish time).
export const INFERRED_WINDOW_MS = 2 * HOUR_MS;
const HALF = INFERRED_WINDOW_MS / 2;

const TOGGLE_KEY = "symphony_infer_presence_from_authorship";

// Default ON. Stored as "1"/"0" in localStorage (a UI preference, like the
// analytics-grouping mode).
export function getInferPresenceEnabled() {
  try { return localStorage.getItem(TOGGLE_KEY) !== "0"; } catch { return true; }
}
export function setInferPresenceEnabled(on) {
  try { localStorage.setItem(TOGGLE_KEY, on ? "1" : "0"); } catch { /* quota / unavailable */ }
}

// Flatten authored content into presence moments: { alterId, ts }.
//   - MentionLog rows with log_type "authored" (chat / bulletins / comments /
//     replies — written by saveAuthoredLog), via author_alter_id + source_date.
//   - JournalEntry, via author_alter_id + (created_date | timestamp).
// Journals aren't in MentionLog, so there's no double counting.
export function buildAuthoredEvents({ mentionLogs = [], journals = [] }) {
  const out = [];
  for (const l of mentionLogs) {
    if (l?.log_type !== "authored" || !l.author_alter_id) continue;
    const ts = new Date(l.source_date).getTime();
    if (Number.isFinite(ts)) out.push({ alterId: l.author_alter_id, ts });
  }
  for (const j of journals) {
    if (!j?.author_alter_id) continue;
    const ts = new Date(j.created_date || j.timestamp).getTime();
    if (Number.isFinite(ts)) out.push({ alterId: j.author_alter_id, ts });
  }
  return out;
}

// Alter ids "present" (via authorship) at a given time — those whose authored
// moment falls within ±HALF of the timestamp. Used as a fallback for records
// with no explicit fronting alter.
export function inferAlterIdsAt(tsMs, authoredEvents = []) {
  if (!Number.isFinite(tsMs) || !authoredEvents.length) return [];
  const ids = new Set();
  for (const e of authoredEvents) {
    if (Math.abs(e.ts - tsMs) <= HALF) ids.add(e.alterId);
  }
  return [...ids];
}

// Synthetic FrontingSession-shaped rows (one per authored moment) so the
// session normalizer + overlap-based analytics treat authorship as presence.
// Marked `_inferred` so callers can distinguish them if needed.
export function buildInferredSessions(authoredEvents = []) {
  return authoredEvents.map((e, i) => ({
    id: `inferred-${i}-${e.alterId}-${e.ts}`,
    alter_id: e.alterId,
    is_primary: false,
    start_time: new Date(e.ts - HALF).toISOString(),
    end_time: new Date(e.ts + HALF).toISOString(),
    _inferred: true,
  }));
}

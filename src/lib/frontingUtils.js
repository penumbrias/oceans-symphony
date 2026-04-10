// src/lib/frontingUtils.js

/**
 * Given a list of FrontingSession records (mixed old + new format),
 * returns a normalized flat list of { alterId, start_time, end_time, is_active, note, sessionId }
 * Old grouped records are expanded into one entry per alter.
 * New individual records (has alter_id) are used directly.
 */
export function normalizeSessions(sessions) {
  const result = [];
  for (const s of sessions) {
    if (s.alter_id) {
      // New individual format
      result.push({
        alterId: s.alter_id,
        start_time: s.start_time,
        end_time: s.end_time,
        is_active: s.is_active,
        note: s.note,
        sessionId: s.id,
        isLegacy: false,
        raw: s,
      });
    } else {
      // Legacy grouped format — expand into one entry per alter
      const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
      for (const alterId of ids) {
        result.push({
          alterId,
          start_time: s.start_time,
          end_time: s.end_time,
          is_active: s.is_active,
          note: s.note,
          sessionId: s.id,
          isLegacy: true,
          isPrimary: s.primary_alter_id === alterId,
          raw: s,
        });
      }
    }
  }
  return result;
}

/**
 * Create a new-format session for a single alter.
 */
export async function createIndividualSession(db, { alterId, startTime, endTime, isActive, note }) {
  return db.FrontingSession.create({
    alter_id: alterId,
    start_time: startTime,
    end_time: endTime || null,
    is_active: isActive ?? true,
    note: note || null,
  });
}

/**
 * Get currently active fronters from a normalized session list.
 */
export function getActiveFronters(normalizedSessions) {
  return normalizedSessions
    .filter(s => s.is_active)
    .map(s => s.alterId);
}

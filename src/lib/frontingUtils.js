import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";

// Get the right db depending on mode
function getDb() {
  if (isLocalMode()) {
    const { localEntities } = require("@/api/base44Client");
    return localEntities;
  }
  return base44.entities;
}

/**
 * Normalizes a list of FrontingSession records into a flat per-alter list.
 * Legacy records (no alter_id) are expanded into one entry per alter.
 * New records (has alter_id) are passed through directly.
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
 * Creates a new individual session for a single alter.
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
 * Returns currently active alter IDs from a normalized session list.
 */
export function getActiveFronters(normalizedSessions) {
  return [...new Set(
    normalizedSessions
      .filter(s => s.is_active)
      .map(s => s.alterId)
  )];
}

/**
 * Ends all currently active sessions for the given alter IDs.
 * Handles both legacy and new format.
 */
export async function endActiveSessions(db, now) {
  const activeSessions = await db.FrontingSession.filter({ is_active: true });
  for (const s of activeSessions) {
    await db.FrontingSession.update(s.id, { is_active: false, end_time: now });
  }
}

/**
 * frontingUtils.js — New individual-session model helpers.
 * Each FrontingSession record belongs to ONE alter (via alter_id).
 * Co-fronting is derived by overlapping time ranges, not stored in a single record.
 */

/**
 * Normalizes a list of FrontingSession records.
 * Handles both new (alter_id) and legacy (primary_alter_id) formats for backward compat.
 * Returns flat per-alter entries for display/analytics.
 */
export function normalizeSessions(sessions) {
  const result = [];
  for (const s of sessions) {
    if (s.alter_id) {
      result.push({
        alterId: s.alter_id,
        isPrimary: s.is_primary ?? false,
        start_time: s.start_time,
        end_time: s.end_time,
        is_active: s.is_active,
        sessionId: s.id,
        isLegacy: false,
        raw: s,
      });
    } else if (s.primary_alter_id) {
      // Legacy fallback
      const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
      for (const alterId of ids) {
        result.push({
          alterId,
          isPrimary: s.primary_alter_id === alterId,
          start_time: s.start_time,
          end_time: s.end_time,
          is_active: s.is_active,
          sessionId: s.id,
          isLegacy: true,
          raw: s,
        });
      }
    }
  }
  return result;
}

/**
 * Returns alter IDs that are currently active from a list of raw sessions.
 */
export function getActiveFronterIds(sessions) {
  return [...new Set(
    sessions
      .filter(s => s.is_active)
      .map(s => s.alter_id || s.primary_alter_id)
      .filter(Boolean)
  )];
}

/**
 * Returns the active primary alter ID from a list of raw sessions.
 */
export function getActivePrimaryId(sessions) {
  const active = sessions.filter(s => s.is_active);
  // New model
  const primary = active.find(s => s.alter_id && s.is_primary);
  if (primary) return primary.alter_id;
  // Legacy fallback
  const legacyPrimary = active.find(s => s.primary_alter_id);
  return legacyPrimary?.primary_alter_id || null;
}

/**
 * Finds co-fronters for a given alter at a given time by overlapping sessions.
 */
export function getCoFronters(alterId, sessions) {
  const mySessions = sessions.filter(s => (s.alter_id || s.primary_alter_id) === alterId);
  const coFronterIds = new Set();

  for (const mine of mySessions) {
    const myStart = new Date(mine.start_time).getTime();
    const myEnd = mine.end_time ? new Date(mine.end_time).getTime() : Date.now();

    for (const other of sessions) {
      const otherId = other.alter_id || other.primary_alter_id;
      if (!otherId || otherId === alterId) continue;
      const otherStart = new Date(other.start_time).getTime();
      const otherEnd = other.end_time ? new Date(other.end_time).getTime() : Date.now();
      if (myStart < otherEnd && myEnd > otherStart) {
        coFronterIds.add(otherId);
      }
    }
  }
  return [...coFronterIds];
}

/**
 * Ends all currently active sessions.
 */
export async function endActiveSessions(db, now) {
  const activeSessions = await db.FrontingSession.filter({ is_active: true });
  for (const s of activeSessions) {
    await db.FrontingSession.update(s.id, { is_active: false, end_time: now });
  }
}
// THE writer for editing a fronting session after the fact (v0.279.6,
// roadmap step 3). The timeline's session card and editor, its split
// handle, the profile history's "Edit session" (which opens the same
// timeline editor) and the stale-sessions review all write here.
//
// setFront.js owns who is in front NOW; this file owns one recorded
// session: its times, its level, ending it, splitting it, removing it.
//
// Legacy grouped rows (primary_alter_id + co_fronter_ids, one row for
// several members) are never written in that shape again. Editing one
// member's part first CARVES that member into their own row (same times,
// their level) and takes them off the group row; the group row keeps
// everyone else and its notes/feelings, so nothing is re-bucketed.

import { base44 } from "@/api/base44Client";
import { getSessionLevel } from "@/lib/frontLevels";
import { recomputePrimaryFromLevels } from "@/lib/setFront";
import { levelChangesOf, levelAt, changesAfter } from "@/lib/frontLevelSpans";

const membersOf = (s) => [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);

export class SessionEditError extends Error {}

// The row that is only this member's. A per-alter row is returned as is.
export async function ownSessionFor(session, alterId, levelCfg = null) {
  if (!session) throw new SessionEditError("That session couldn't be found.");
  if (session.alter_id) return session;
  const members = membersOf(session);
  const wasPrimary = session.primary_alter_id === alterId;
  const level = getSessionLevel({ ...session, is_primary: wasPrimary }, levelCfg);
  if (members.length <= 1) {
    // Only member: the row is already theirs. Name them on it so every
    // later write is the per-alter shape; the old fields stay as they were.
    return base44.entities.FrontingSession.update(session.id, {
      alter_id: alterId,
      is_primary: wasPrimary,
      ...(level ? { front_level: level.id } : {}),
    });
  }
  const others = members.filter((id) => id !== alterId);
  const nextPrimary = wasPrimary ? others[0] : session.primary_alter_id;
  await base44.entities.FrontingSession.update(session.id, {
    primary_alter_id: nextPrimary,
    co_fronter_ids: others.filter((id) => id !== nextPrimary),
  });
  return base44.entities.FrontingSession.create({
    alter_id: alterId,
    is_primary: wasPrimary,
    ...(level ? { front_level: level.id } : {}),
    start_time: session.start_time,
    end_time: session.end_time || null,
    is_active: !!session.is_active && !session.end_time,
  });
}

// Times and level. `end` left empty keeps the recorded end (an edit never
// quietly reopens a finished session).
export async function editFrontSession({ session, alterId, start, end, levelId, levelCfg = null }) {
  const startIso = start || session.start_time;
  const endIso = end || session.end_time || null;
  if (Number.isNaN(ms(startIso))) throw new SessionEditError("Pick a start time.");
  if (endIso && ms(endIso) <= ms(startIso)) throw new SessionEditError("The end has to be after the start.");
  const own = await ownSessionFor(session, alterId, levelCfg);
  const topLevel = levelCfg?.levels?.[0]?.id;
  const patch = { start_time: startIso, end_time: endIso, is_active: !endIso };
  if (levelId) {
    patch.front_level = levelId;
    patch.is_primary = levelId === topLevel;
  }
  const saved = await base44.entities.FrontingSession.update(own.id, patch);
  if (!endIso) await recomputePrimaryFromLevels({ cfg: levelCfg, queryClient: null });
  return saved;
}

// End this member's session. Older rows of theirs that were never ended
// (12h+, no end) are ended with it — the person is resolving stuck state.
export async function endFrontSession({ session, alterId = null, at = null }) {
  const atIso = new Date(at || Date.now()).toISOString();
  if (ms(atIso) < ms(session.start_time)) throw new SessionEditError("The end can't be before the start.");
  // No member named (the stale-sessions review): close the whole row.
  const own = alterId ? await ownSessionFor(session, alterId) : session;
  const saved = await base44.entities.FrontingSession.update(own.id, { end_time: atIso, is_active: false });
  if (alterId) {
    try {
      const cutoff = Date.now() - 12 * 3600e3;
      const others = await base44.entities.FrontingSession.filter({ alter_id: alterId });
      for (const o of others || []) {
        if (o.id === own.id || o.end_time) continue;
        if ((ms(o.start_time) || 0) < cutoff) {
          await base44.entities.FrontingSession.update(o.id, { end_time: atIso, is_active: false });
        }
      }
    } catch { /* best-effort sweep */ }
  }
  return saved;
}

// Take this member's session away (to the trash). On a group row only
// this member comes off; everyone else's history stays.
export async function removeFrontSession({ session, alterId }) {
  if (session.alter_id || membersOf(session).length <= 1) {
    await base44.entities.FrontingSession.delete(session.id);
    return;
  }
  const others = membersOf(session).filter((id) => id !== alterId);
  const nextPrimary = session.primary_alter_id === alterId ? others[0] : session.primary_alter_id;
  await base44.entities.FrontingSession.update(session.id, {
    primary_alter_id: nextPrimary,
    co_fronter_ids: others.filter((id) => id !== nextPrimary),
  });
}

// Split at `at`: "end" stops the session there; "level" stops it there
// and continues at `levelId` until the old end (or still going).
export async function splitFrontSession({ session, alterId, at, action, levelId = null, levelCfg = null }) {
  const atMs = ms(at);
  if (Number.isNaN(atMs) || atMs <= ms(session.start_time)) throw new SessionEditError("Pick a time after the start.");
  if (session.end_time && atMs >= ms(session.end_time)) throw new SessionEditError("Pick a time before the end.");
  const own = await ownSessionFor(session, alterId, levelCfg);
  const atIso = new Date(atMs).toISOString();
  // With recorded level changes, the first part ends at the level it was
  // at when split (its changes after that stay on it, past its end, where
  // nothing reads them); the second part carries those changes on.
  const hasChanges = levelChangesOf(own).length > 0;
  const levelThen = hasChanges ? levelAt(own, atMs) : null;
  await base44.entities.FrontingSession.update(own.id, {
    end_time: atIso, is_active: false,
    ...(levelThen ? { front_level: levelThen } : {}),
  });
  if (action !== "level") return;
  const stillGoing = !own.end_time && !!own.is_active;
  const startLevel = levelId || levelThen || own.front_level || null;
  const carried = hasChanges ? changesAfter(own, atMs, startLevel) : [];
  await base44.entities.FrontingSession.create({
    alter_id: alterId,
    is_primary: levelId ? levelId === levelCfg?.levels?.[0]?.id : !!own.is_primary,
    ...(levelId ? { front_level: levelId } : {}),
    // The part after the split ends at the level the original ended at.
    ...(carried.length ? { level_changes: carried, front_level: own.front_level } : {}),
    start_time: atIso,
    end_time: own.end_time || null,
    is_active: stillGoing,
  });
  if (stillGoing) await recomputePrimaryFromLevels({ cfg: levelCfg, queryClient: null });
}

// Record fronting that already happened (the timeline's long-press
// picker): one row per member at their level. With no end the members are
// still in front from `start`; anyone already in front keeps the session
// they have rather than getting a second live one.
export async function addPastFrontSessions({ start, end = null, selections = [], levelCfg = null }) {
  if (!selections.length) return [];
  const startMs = ms(start);
  if (Number.isNaN(startMs)) throw new SessionEditError("Pick a start time.");
  if (end && ms(end) <= startMs) throw new SessionEditError("The end has to be after the start.");
  if (!end && startMs > Date.now() + 60000) throw new SessionEditError("A session that's still going can't start in the future.");
  const idxOf = (levelId) => (levelId && levelCfg?.levels ? Math.max(0, levelCfg.levels.findIndex((l) => l.id === levelId)) : 0);
  const topIdx = Math.min(...selections.map((x) => idxOf(x.levelId)));
  let rows = selections;
  if (!end) {
    const live = await base44.entities.FrontingSession.filter({ is_active: true });
    const liveIds = new Set(live.flatMap((s) => [s.alter_id, ...membersOf(s)]).filter(Boolean));
    rows = selections.filter((x) => !liveIds.has(x.alterId));
  }
  if (!rows.length) return [];
  const created = await base44.entities.FrontingSession.bulkCreate(rows.map(({ alterId, levelId }) => ({
    alter_id: alterId,
    ...(levelId ? { front_level: levelId } : {}),
    is_primary: idxOf(levelId) === topIdx && topIdx === 0,
    start_time: new Date(startMs).toISOString(),
    end_time: end ? new Date(end).toISOString() : null,
    is_active: !end,
  })));
  if (!end) await recomputePrimaryFromLevels({ cfg: levelCfg, queryClient: null });
  return created;
}

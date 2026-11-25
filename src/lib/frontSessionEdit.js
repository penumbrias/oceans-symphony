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
import { withTrashBatch } from "@/lib/localDb";
import { getSessionLevel } from "@/lib/frontLevels";
import { recomputePrimaryFromLevels } from "@/lib/setFront";
import { levelChangesOf, levelAt, changesAfter, isJoinSettle } from "@/lib/frontLevelSpans";

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
// quietly reopens a finished session). `wholeSession`: the level holds for
// the whole session — the recorded level changes stay in their log (sync
// keeps every entry) but stop counting (`levels_reset_at`, frontLevelSpans).
export async function editFrontSession({ session, alterId, start, end, levelId, levelCfg = null, wholeSession = false }) {
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
    if (wholeSession && levelChangesOf(own).length) patch.levels_reset_at = new Date().toISOString();
  }
  // Moving the start must not turn the level they joined at back into a
  // change: settle entries (isJoinSettle, judged on the row as it was) are
  // superseded for good before the start moves.
  if (!patch.levels_reset_at && startIso !== own.start_time && Array.isArray(own.level_changes)) {
    const settled = own.level_changes
      .map((c) => ms(c?.timestamp))
      .filter((t) => Number.isFinite(t) && isJoinSettle(own, t));
    const reset = ms(own.levels_reset_at);
    if (settled.length) {
      const last = Math.max(...settled);
      if (!(Number.isFinite(reset) && reset >= last)) patch.levels_reset_at = new Date(last).toISOString();
    }
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
// Returns { first, second } (second is null for "end").
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
  const first = await base44.entities.FrontingSession.update(own.id, {
    end_time: atIso, is_active: false,
    ...(levelThen ? { front_level: levelThen } : {}),
  });
  if (action !== "level") return { first, second: null };
  const stillGoing = !own.end_time && !!own.is_active;
  const startLevel = levelId || levelThen || own.front_level || null;
  const carried = hasChanges ? changesAfter(own, atMs, startLevel) : [];
  const second = await base44.entities.FrontingSession.create({
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
  return { first, second };
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

// ── It was someone else (house 3.3) ───────────────────────────────────
// reassignFrontSession hands all or part of a recorded session to another
// member, or adds / removes someone for that stretch.
//
//   mode "move"   (default) `fromAlterId`'s session from `start` to `end`
//                  becomes `toAlterId`'s. Outside the stretch it stays
//                  theirs: the session is split at `start` and `end` with
//                  splitFrontSession, so the level history carries on
//                  exactly as a split does, and only the middle piece
//                  changes hands.
//   mode "add"    `toAlterId` was in front too for that stretch: a new
//                  session at the member's level then (addPastFrontSessions).
//                  `fromAlterId`'s session is not touched.
//   mode "remove" `fromAlterId` wasn't in front for that stretch: the
//                  middle piece goes to the trash (restorable).
//
// `start` / `end` default to the session's own; an `end` left empty on a
// session still going hands over from `start` onward (they're in front
// now). A legacy grouped row is carved with ownSessionFor first, so the
// grouped shape is never written. `toAlterId` must not already have a
// session overlapping the stretch (that would double-count their time).
//
// Payloads (`carryPayload`, default true — the recommendation to the
// owner, 3.3 question 3): notes whose own timestamp falls inside the handed
// stretch go with it, and the session-level feelings, symptoms and trigger
// (which belong to the session's start) go with it when the stretch begins
// at the start. With `carryPayload: false` they stay on the original
// member's remaining part; when the whole session is handed over there is
// no such part, so they travel anyway (nothing is ever dropped). In
// "remove" mode they stay on the remaining part, or go to the trash with
// the row when the whole session is removed. Other records that point at
// the session (a switch journal's fronting_session_id) keep pointing at the
// original row, which is the part before the stretch when there is one.
//
// The session as it was is kept in Recent changes, and the result carries
// what `undoFrontReassign(result)` needs to put everything back.

const SESSION_LEVEL_FIELDS = ["session_emotions", "session_symptoms", "is_triggered_switch", "trigger_category", "trigger_label"];
const CLEARED_SESSION_LEVEL = { session_emotions: null, session_symptoms: null, is_triggered_switch: false, trigger_category: null, trigger_label: null };
const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function readLevelCfg(levelCfg) {
  if (levelCfg) return levelCfg;
  try {
    const [{ resolveFrontLevels }, { pickPrimarySystemSettings }] = await Promise.all([
      import("@/lib/frontLevels"), import("@/lib/systemSettingsSingleton"),
    ]);
    const rows = await base44.entities.SystemSettings.list();
    return resolveFrontLevels(pickPrimarySystemSettings(rows) || rows?.[0] || null);
  } catch { return null; }
}

async function overlapsFor(alterId, aMs, bMs, ignoreId = null) {
  const all = await base44.entities.FrontingSession.list();
  return (all || []).some((s) => {
    if (s.id === ignoreId) return false;
    const members = s.alter_id ? [s.alter_id] : membersOf(s);
    if (!members.includes(alterId)) return false;
    const sStart = ms(s.start_time);
    const sEnd = s.end_time ? ms(s.end_time) : (s.is_active ? Infinity : sStart);
    const end = bMs == null ? Infinity : bMs;
    return sStart < end && sEnd > aMs;
  });
}

export async function reassignFrontSession({
  session, fromAlterId = null, toAlterId = null, start = null, end = null,
  mode = "move", carryPayload = true, levelCfg = null,
}) {
  if (!session?.id) throw new SessionEditError("That session couldn't be found.");
  if (!["move", "add", "remove"].includes(mode)) throw new SessionEditError("Unknown change.");
  const fresh = (await base44.entities.FrontingSession.get(session.id)) || null;
  if (!fresh) throw new SessionEditError("That session couldn't be found.");
  const from = fromAlterId || fresh.alter_id || fresh.primary_alter_id;
  if (mode !== "remove" && !toAlterId) throw new SessionEditError("Pick who it was.");
  if (mode === "move" && toAlterId === from) throw new SessionEditError("That's who it already is.");
  const cfg = await readLevelCfg(levelCfg);

  const startMs = ms(fresh.start_time);
  const endMs = fresh.end_time ? ms(fresh.end_time) : null;
  const aMs = start ? ms(start) : startMs;
  let bMs = end ? ms(end) : endMs;
  if (Number.isNaN(aMs) || (bMs != null && Number.isNaN(bMs))) throw new SessionEditError("Pick a time.");
  if (aMs < startMs) throw new SessionEditError("Pick a start inside the session.");
  if (endMs != null && bMs > endMs) throw new SessionEditError("Pick an end inside the session.");
  if (bMs != null && bMs <= aMs) throw new SessionEditError("The end has to be after the start.");
  if (endMs == null && !fresh.is_active && bMs == null) throw new SessionEditError("Pick an end.");
  if (endMs == null && bMs != null && bMs > Date.now() + 60000) throw new SessionEditError("Pick an end that isn't in the future.");
  if (bMs != null && endMs == null && !fresh.is_active) bMs = null;
  const aIso = new Date(aMs).toISOString();
  const bIso = bMs == null ? null : new Date(bMs).toISOString();

  if (mode !== "remove" && await overlapsFor(toAlterId, aMs, bMs)) {
    throw new SessionEditError("They already have fronting recorded in that stretch. Edit that session first.");
  }

  if (mode === "add") {
    const own = fresh.alter_id ? fresh : null;
    const levelId = own ? (levelAt(own, aMs) || own.front_level || null) : null;
    const created = await addPastFrontSessions({
      start: aIso, end: bIso, selections: [{ alterId: toAlterId, levelId }], levelCfg: cfg,
    });
    return { mode, snapshot: null, createdIds: created.map((r) => r.id), trashedIds: [], sessionId: fresh.id };
  }

  // Carve, then keep the version before in Recent changes.
  const own = await ownSessionFor(fresh, from, cfg);
  const snapshot = JSON.parse(JSON.stringify(own));
  const { keepEditRestorePoint } = await import("@/lib/editRestorePoint");
  keepEditRestorePoint("FrontingSession", own);

  const createdIds = [];
  const keepLevel = async (piece, src) => {
    if (piece && !levelChangesOf(src).length && src.front_level && piece.front_level !== src.front_level) {
      return base44.entities.FrontingSession.update(piece.id, { front_level: src.front_level });
    }
    return piece;
  };
  let before = null;
  let mid = own;
  let after = null;
  if (aMs > startMs) {
    const r = await splitFrontSession({ session: own, alterId: from, at: aIso, action: "level", levelCfg: cfg });
    before = r.first;
    mid = await keepLevel(r.second, own);
    createdIds.push(mid.id);
  }
  const midEnd = mid.end_time ? ms(mid.end_time) : null;
  if (bMs != null && (midEnd == null || bMs < midEnd)) {
    const src = mid;
    const r = await splitFrontSession({ session: mid, alterId: from, at: bIso, action: "level", levelCfg: cfg });
    mid = r.first;
    after = await keepLevel(r.second, src);
    createdIds.push(after.id);
  }

  // Where each payload ends up.
  const { parseSessionNote } = await import("@/lib/perAlterSessionEntries");
  const notes = parseSessionNote(own.note);
  const lastMs = endMs == null ? Infinity : endMs - 1;
  const handOver = mode === "move" && carryPayload;
  const pieceAt = (t) => {
    const at = Math.min(Math.max(Number.isFinite(t) ? t : startMs, startMs), lastMs);
    if (at < aMs) return "before";
    if (bMs != null && at >= bMs) return "after";
    if (handOver) return "mid";
    return before ? "before" : after ? "after" : "mid";
  };
  const pieces = { before, mid, after };
  const notesFor = { before: [], mid: [], after: [] };
  for (const n of notes) notesFor[pieceAt(ms(n?.timestamp))].push(n);
  const levelTarget = pieceAt(startMs);
  const ownKey = before ? "before" : "mid";
  const sessionLevel = {};
  for (const k of SESSION_LEVEL_FIELDS) if (own[k] !== undefined && own[k] !== null) sessionLevel[k] = own[k];
  const hasSessionLevel = Object.keys(sessionLevel).length > 0;

  const patches = { before: {}, mid: {}, after: {} };
  for (const key of ["before", "mid", "after"]) {
    const p = pieces[key];
    if (!p) continue;
    const isOwn = key === ownKey;
    const want = notesFor[key];
    if (isOwn ? !sameJson(want, notes) : want.length) patches[key].note = JSON.stringify(want);
    if (hasSessionLevel && levelTarget !== ownKey) {
      if (key === levelTarget) Object.assign(patches[key], sessionLevel);
      if (isOwn) Object.assign(patches[key], CLEARED_SESSION_LEVEL);
    }
  }
  if (mode === "move") patches.mid.alter_id = toAlterId;

  // The new pieces take their notes and feelings BEFORE the original row
  // gives them up, so a crash between two writes can only leave a copy
  // twice, never nowhere.
  for (const key of ["before", "mid", "after"].sort((x, y) => (x === ownKey) - (y === ownKey))) {
    const p = pieces[key];
    if (p && Object.keys(patches[key]).length) pieces[key] = await base44.entities.FrontingSession.update(p.id, patches[key]);
  }

  const trashedIds = [];
  if (mode === "remove") {
    await withTrashBatch(() => base44.entities.FrontingSession.delete(pieces.mid.id));
    trashedIds.push(pieces.mid.id);
  }
  if (!bIso && fresh.is_active) await recomputePrimaryFromLevels({ cfg, queryClient: null });
  return {
    mode, snapshot, createdIds, trashedIds, sessionId: own.id,
    pieces: { before: pieces.before?.id || null, mid: pieces.mid?.id || null, after: pieces.after?.id || null },
  };
}

// Put a reassignment back: the pieces it made go to the trash, anything it
// trashed comes back, and the original row gets its earlier fields again.
//
// Safe to run twice, and safe after a sync:
//   - Notes written onto any piece AFTER the reassignment are kept: they
//     join the original row's notes instead of being overwritten or going
//     to the trash with their piece.
//   - A row that has ENDED is never reopened. When the session was still
//     going, the split ended the original row and the live part carries on
//     in a new piece; reopening the original would be undone by the next
//     sync ("an end is a fact") and the live piece would already be in the
//     trash, leaving nobody in front. So for a live session the pieces stay
//     and are handed back to the original member instead.
//   - The row as it was before the undo is kept in Recent changes.
const UNDO_KEEP = new Set(["id", "created_date", "updated_date", "created_by", "_ft", "trashed_at", "trash_batch", "removed_at", "origin_device"]);
const STATE_FIELDS = ["is_active", "end_time", "front_level", "level_changes", "levels_reset_at", "is_primary"];
const noteKey = (n) => JSON.stringify(n ?? null);

export async function undoFrontReassign(result) {
  if (!result) return;
  const { restoreFromTrash } = await import("@/lib/trash");
  const { parseSessionNote } = await import("@/lib/perAlterSessionEntries");
  const { keepEditRestorePoint } = await import("@/lib/editRestorePoint");
  const FS = base44.entities.FrontingSession;
  const snap = result.snapshot;
  const snapNotes = snap ? parseSessionNote(snap.note) : [];
  const snapKeys = new Set(snapNotes.map(noteKey));
  const laterNotes = (row) => parseSessionNote(row?.note).filter((n) => !snapKeys.has(noteKey(n)));

  if (result.trashedIds?.length) {
    await restoreFromTrash(result.trashedIds.map((id) => ({ entity: "FrontingSession", id })));
  }
  const current = snap?.id ? await FS.get(snap.id) : null;
  const pieceIds = [...new Set([...(result.createdIds || []), ...(result.trashedIds || [])])].filter((id) => id !== snap?.id);
  const pieces = (await Promise.all(pieceIds.map((id) => FS.get(id)))).filter(Boolean);
  const wasLive = !!snap?.is_active && !snap?.end_time;
  const keepPieces = !!current && wasLive && !!current.end_time && result.mode !== "add";
  const extra = [];

  if (keepPieces) {
    // Hand every piece back; the original's notes and feelings go home to
    // the original row, anything written on a piece since stays on it.
    const from = snap.alter_id;
    for (const p of pieces) {
      const patch = {};
      if (from && p.alter_id !== from) patch.alter_id = from;
      const own = parseSessionNote(p.note);
      const kept = laterNotes(p);
      if (kept.length !== own.length) patch.note = JSON.stringify(kept);
      for (const k of SESSION_LEVEL_FIELDS) {
        if (snap[k] != null && sameJson(p[k], snap[k]) && !sameJson(p[k], CLEARED_SESSION_LEVEL[k])) patch[k] = CLEARED_SESSION_LEVEL[k];
      }
      if (Object.keys(patch).length) {
        keepEditRestorePoint("FrontingSession", p);
        await FS.update(p.id, patch);
      }
    }
  } else if (pieces.length) {
    for (const p of pieces) extra.push(...laterNotes(p));
    if (result.mode === "add" && extra.length) {
      // Nothing to fold them into: the added session keeps its notes.
      extra.length = 0;
    } else {
      await withTrashBatch(async () => {
        for (const p of pieces) await FS.delete(p.id);
      });
    }
  }

  if (current) {
    const patch = {};
    for (const [k, v] of Object.entries(snap)) {
      if (UNDO_KEEP.has(k) || (keepPieces && STATE_FIELDS.includes(k))) continue;
      if (!sameJson(v, current[k])) patch[k] = v;
    }
    for (const k of Object.keys(current)) {
      if (k in snap || UNDO_KEEP.has(k) || (keepPieces && STATE_FIELDS.includes(k))) continue;
      if (current[k] != null) patch[k] = null;
    }
    // A legacy plain-text note (not a JSON array) is kept as the first entry
    // when later notes have to join it, never dropped.
    const legacy = !snapNotes.length && typeof snap.note === "string" && snap.note.trim()
      ? [{ text: snap.note, timestamp: snap.start_time }] : [];
    const merged = [...legacy, ...snapNotes, ...laterNotes(current).filter((n) => !legacy.length || noteKey(n) !== noteKey(legacy[0])), ...extra];
    const seen = new Set();
    const notes = merged.filter((n) => { const key = noteKey(n); if (seen.has(key)) return false; seen.add(key); return true; });
    if (notes.length > snapNotes.length + legacy.length) patch.note = JSON.stringify(notes);
    if (Object.keys(patch).length) {
      keepEditRestorePoint("FrontingSession", current);
      await FS.update(snap.id, patch);
    }
  }
  if (wasLive) await recomputePrimaryFromLevels({ cfg: await readLevelCfg(null), queryClient: null });
}

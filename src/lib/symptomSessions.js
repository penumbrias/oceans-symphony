// THE write paths for active symptom sessions (owner bug report,
// 2026-08-06: ending an "active" symptom didn't stick, and weeks-old
// sessions haunted the Active list).
//
// Two root causes, both fixed here at the source:
//   1. Ending a session only closed the FIRST active row for that symptom.
//      With duplicates present, each end revealed the next one — "it's
//      active again after refresh". Ending now closes EVERY active row.
//   2. Nothing stopped a second active session from being created for a
//      symptom that already had one, so duplicates quietly accumulated.
//      Starting now refetches (refetch-before-write, the house pattern)
//      and reuses the existing session instead of stacking another.
//
// Sessions live under BOTH `symptom_id` (current) and
// `symptom_definition_id` (legacy rows) — every match here checks both.

import { base44 } from "@/api/base44Client";

const idsOf = (s) => [s.symptom_id, s.symptom_definition_id].filter(Boolean);

export async function activeSessionsFor(symptomId) {
  const active = await base44.entities.SymptomSession.filter({ is_active: true });
  return active.filter((s) => idsOf(s).includes(symptomId));
}

// End every active session for a symptom. Returns how many were closed.
export async function endSymptomSessions(symptomId, { endTime = null } = {}) {
  const mine = await activeSessionsFor(symptomId);
  const end = endTime || new Date().toISOString();
  for (const s of mine) {
    await base44.entities.SymptomSession.update(s.id, { is_active: false, end_time: end });
  }
  return mine.length;
}

// Start (or reuse) the active session for a symptom. Never creates a
// duplicate: an existing active session is returned as-is, optionally
// gaining a severity snapshot.
export async function startSymptomSession(symptomId, {
  startTime = null,
  severity = null,
  notes = null,
  legacyDefinitionField = false,
} = {}) {
  const existing = (await activeSessionsFor(symptomId))
    .sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
  const now = new Date().toISOString();
  if (existing.length > 0) {
    const keep = existing[0];
    if (severity !== null) {
      const snaps = keep.severity_snapshots || [];
      await base44.entities.SymptomSession.update(keep.id, {
        severity_snapshots: [...snaps, { severity, timestamp: now }],
      });
    }
    // Housekeeping: if duplicates already exist from before this fix,
    // fold them — keep the OLDEST (longest-running) one, close the rest.
    for (const extra of existing.slice(1)) {
      await base44.entities.SymptomSession.update(extra.id, { is_active: false, end_time: now });
    }
    return { session: keep, reused: true };
  }
  const session = await base44.entities.SymptomSession.create({
    [legacyDefinitionField ? "symptom_definition_id" : "symptom_id"]: symptomId,
    start_time: startTime || now,
    is_active: true,
    severity_snapshots: severity !== null ? [{ severity, timestamp: startTime || now }] : [],
    ...(notes ? { notes } : {}),
  });
  return { session, reused: false };
}

// ── Editing and deleting one episode (house 3.3) ──────────────────────
// Times are validated; a session given an end is ENDED (is_active off), or
// it lingers as a ghost-active symptom. Notes run through the caller's
// authored-text grammar and arrive here as text + author ids. Read fresh,
// only changed fields written, the version before kept in Recent changes.
export class SymptomSessionEditError extends Error {}

export async function editSymptomSession(id, { start, end, notes, authorIds, baseline = null, ...fields } = {}) {
  const { readFresh, editRecord } = await import("@/lib/recordEdit");
  const fresh = await readFresh("SymptomSession", id);
  const patch = { ...fields };
  if (start && Number.isNaN(new Date(start).getTime())) throw new SymptomSessionEditError("Pick a valid start time");
  if (end && Number.isNaN(new Date(end).getTime())) throw new SymptomSessionEditError("Pick a valid end time");
  const startIso = start ? new Date(start).toISOString() : null;
  const endIso = end ? new Date(end).toISOString() : null;
  const s = startIso || fresh.start_time;
  const e = endIso || fresh.end_time;
  if (startIso && e && new Date(startIso) > new Date(e)) throw new SymptomSessionEditError("Start can't be after the end time");
  if (endIso && s && new Date(endIso) < new Date(s)) throw new SymptomSessionEditError("End can't be before the start time");
  if (startIso) patch.start_time = startIso;
  if (endIso) { patch.end_time = endIso; patch.is_active = false; }
  if (notes !== undefined) patch.notes = (typeof notes === "string" && notes.trim()) || null;
  if (Array.isArray(authorIds)) patch.author_alter_ids = authorIds;
  return editRecord("SymptomSession", id, patch, { baseline, fresh });
}

// End one episode (not every one of its symptom — that's endSymptomSessions).
export function endSymptomSession(id, { endTime = null } = {}) {
  return editSymptomSession(id, { end: endTime || new Date().toISOString() });
}

// An episode goes to the trash. The point check-ins rated during it stay:
// they are their own entries on the Day.
export async function deleteSymptomSession(id) {
  const { trashRecords } = await import("@/lib/recordEdit");
  return trashRecords([{ entity: "SymptomSession", id }]);
}

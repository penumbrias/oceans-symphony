// THE save paths for feeling and symptom check-ins (v0.279.0, roadmap
// step 2).
//
// Before this, eight places saved a symptom check-in and five saved a
// feeling, and each decided "who was this" its own way: the check-in used
// everyone in front, the widgets used one "lead" fronter, ~commands,
// reminders and the severity menus recorded nobody. Per-alter charts
// silently missed most entries, and nothing recorded whether a feeling
// was distressing, so every distress count read zero.
//
// Every door now saves through here:
//   • logEmotionCheckIn  — one EmotionCheckIn. Stamps `is_distress` from
//     the distress set, and fills `fronting_alter_ids` with everyone in
//     front unless the caller passes who it was.
//   • logSymptomCheckIn  — one SymptomCheckIn, same "who" rule.
//   • logSymptomCheckIns — several at once (the check-in's own save).
//   • rateSymptomSession — a severity rating during a running episode:
//     appends the episode's snapshot (read fresh, so two quick ratings
//     can't drop one) and saves the point check-in beside it, attributed.
//
// "Who" when the caller doesn't say: everyone currently in front, at
// every level (owner decision, 2026-10-24). An explicit list, even an
// empty one, always wins.

import { base44 } from "@/api/base44Client";
import { emotionsAreDistressing } from "@/lib/emotionDistress";

// Alter ids in front from a list of active sessions. Handles the current
// per-alter rows and the legacy grouped rows (primary_alter_id +
// co_fronter_ids).
export function frontersOf(sessions) {
  const ids = [];
  for (const s of sessions || []) {
    if (!s || s.is_active === false) continue;
    if (s.alter_id) ids.push(s.alter_id);
    else if (s.primary_alter_id) ids.push(s.primary_alter_id, ...(s.co_fronter_ids || []));
  }
  return [...new Set(ids.filter(Boolean))];
}

// Read fresh, never from a cached query: a switch made a moment ago must
// count (refetch-before-write, the house rule).
export async function currentFronterIds() {
  try {
    return frontersOf(await base44.entities.FrontingSession.filter({ is_active: true }));
  } catch {
    return [];
  }
}

async function whoFor(frontingAlterIds) {
  return Array.isArray(frontingAlterIds) ? frontingAlterIds : currentFronterIds();
}

export async function logEmotionCheckIn({ emotions = [], frontingAlterIds, timestamp, customEmotions, ...rest } = {}) {
  const labels = (Array.isArray(emotions) ? emotions : []).filter((e) => typeof e === "string" && e);
  return base44.entities.EmotionCheckIn.create({
    ...rest,
    timestamp: timestamp || new Date().toISOString(),
    emotions: labels,
    fronting_alter_ids: await whoFor(frontingAlterIds),
    is_distress: emotionsAreDistressing(labels, customEmotions),
  });
}

function symptomRow({ symptomId, severity = null, timestamp, checkInId, ...rest }, who) {
  return {
    ...rest,
    symptom_id: symptomId,
    timestamp: timestamp || new Date().toISOString(),
    severity: severity ?? null,
    fronting_alter_ids: who,
    ...(checkInId ? { check_in_id: checkInId } : {}),
  };
}

export async function logSymptomCheckIn({ frontingAlterIds, ...fields } = {}) {
  if (!fields.symptomId) return null;
  return base44.entities.SymptomCheckIn.create(symptomRow(fields, await whoFor(frontingAlterIds)));
}

// rows: [{ symptomId, severity, frontingAlterIds? }]; `defaults` fills
// timestamp / checkInId / frontingAlterIds for rows that don't set them.
export async function logSymptomCheckIns(rows, defaults = {}) {
  const list = (rows || []).filter((r) => r?.symptomId);
  if (!list.length) return [];
  const fallback = await whoFor(defaults.frontingAlterIds);
  return base44.entities.SymptomCheckIn.bulkCreate(list.map((r) => symptomRow(
    { timestamp: defaults.timestamp, checkInId: defaults.checkInId, ...r },
    Array.isArray(r.frontingAlterIds) ? r.frontingAlterIds : fallback,
  )));
}

// Ratings are queued so two quick taps each read the other's snapshot.
let ratingChain = Promise.resolve();
export function rateSymptomSession(session, severity, opts = {}) {
  const run = ratingChain.then(() => doRateSymptomSession(session, severity, opts));
  ratingChain = run.catch(() => {});
  return run;
}

async function doRateSymptomSession(session, severity, { frontingAlterIds } = {}) {
  if (!session?.id) return null;
  const now = new Date().toISOString();
  const fresh = (await base44.entities.SymptomSession.get(session.id).catch(() => null)) || session;
  await base44.entities.SymptomSession.update(session.id, {
    severity_snapshots: [...(fresh.severity_snapshots || []), { severity, timestamp: now }],
  });
  return logSymptomCheckIn({
    symptomId: fresh.symptom_id || fresh.symptom_definition_id,
    severity,
    timestamp: now,
    frontingAlterIds,
  });
}

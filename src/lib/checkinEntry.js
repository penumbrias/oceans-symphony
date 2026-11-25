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
// every level (owner decision, 2026-10-24), unless the person narrowed it
// in Manage Check-In ("Entries belong to": leave out some levels, or
// nobody). An explicit list, even an empty one, always wins.

import { base44 } from "@/api/base44Client";
import { emotionsAreDistressing } from "@/lib/emotionDistress";
import { getCategoryMeta } from "@/lib/locationCategories";
import { hasDiaryData, diaryDataToPatch } from "@/lib/diaryData";
import { format } from "date-fns";
import { attributionPolicy, applyAttributionPolicy } from "@/lib/emotionAttribution";
import { resolveFrontLevels, getSessionLevel } from "@/lib/frontLevels";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

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

// Everyone in front with their level id (fresh read).
function frontersWithLevels(sessions, cfg) {
  const out = new Map();
  for (const s of sessions || []) {
    if (!s || s.is_active === false) continue;
    if (s.alter_id) {
      if (!out.has(s.alter_id)) out.set(s.alter_id, getSessionLevel(s, cfg)?.id || null);
    } else if (s.primary_alter_id) {
      // Legacy grouped row: the lead sits at the top level, the rest one out.
      if (!out.has(s.primary_alter_id)) out.set(s.primary_alter_id, cfg.levels[0]?.id || null);
      for (const id of s.co_fronter_ids || []) {
        if (id && !out.has(id)) out.set(id, (cfg.levels[1] || cfg.levels[0])?.id || null);
      }
    }
  }
  return out;
}

// Who an entry belongs to when the caller doesn't say: everyone in front,
// filtered by the person's "Entries belong to" setting (attributionPolicy).
export async function defaultAttributionIds() {
  try {
    const [sessions, settingsList] = await Promise.all([
      base44.entities.FrontingSession.filter({ is_active: true }),
      base44.entities.SystemSettings.list().catch(() => []),
    ]);
    const settings = pickPrimarySystemSettings(settingsList) || settingsList?.[0] || null;
    const cfg = resolveFrontLevels(settings);
    const levels = frontersWithLevels(sessions, cfg);
    return applyAttributionPolicy({
      fronterIds: [...levels.keys()],
      policy: attributionPolicy(settings, cfg),
      levelOf: (id) => levels.get(id),
    });
  } catch {
    return currentFronterIds();
  }
}

async function whoFor(frontingAlterIds) {
  return Array.isArray(frontingAlterIds) ? frontingAlterIds : defaultAttributionIds();
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

// ── Status notes ──────────────────────────────────────────────────────
// Six doors saved a status (the status card, the fronters panel, the quick
// note sheet, two widgets, a quick action, the check-in log); two skipped
// the ~command / signpost / @mention grammar and each signed it its own
// way. They all save through here now.
//
// The note is signed (`author_alter_id` + `author_alter_ids`) only when the
// text signposts someone, or the caller passes an explicit author (the
// log's "Written by" picker). Mentions notify as usual. Statuses render as
// plain text, so commands become plain labels and whispers are off.
// Returns the saved row, or null when there was nothing to save. A broken
// ~command throws (isLogCommandError) so the text stays editable.

const STATUS_TEXT_OPTS = { whisper: false, chips: false, surfaceLabel: "status" };

async function authoredText() {
  return import("@/lib/authoredText");
}

export async function saveStatusNote(text, { alters = [], terms = {}, timestamp, authorAlterId = null } = {}) {
  if (typeof text !== "string" || !text.trim()) return null;
  const { prepareAuthoredText, recordAuthoredText } = await authoredText();
  const prepared = await prepareAuthoredText(text.trim(), { alters, terms, ...STATUS_TEXT_OPTS });
  if (prepared === null) return null;
  const note = prepared.content.trim();
  if (!note) return null;
  const authors = prepared.authorIds?.length ? prepared.authorIds : [authorAlterId].filter(Boolean);
  const created = await base44.entities.StatusNote.create({
    timestamp: timestamp || new Date().toISOString(),
    note,
    ...(authors.length ? { author_alter_id: authors[0], author_alter_ids: authors } : {}),
  });
  await recordAuthoredText({
    ...prepared, content: note, alters, authorIds: authors,
    sourceType: "status", sourceId: created?.id, sourceLabel: "Status", navigatePath: "/checkin-log",
  });
  return created;
}

// Editing a status runs the same grammar. Only people newly mentioned in
// the edit are notified, and a signpost in the edit re-signs the note.
export async function updateStatusNote(statusNote, text, { alters = [], terms = {}, timestamp } = {}) {
  if (!statusNote?.id || typeof text !== "string" || !text.trim()) return null;
  const [{ prepareAuthoredText }, { saveMentions, extractMentionedIds }] = await Promise.all([
    authoredText(), import("@/lib/mentionUtils"),
  ]);
  const prepared = await prepareAuthoredText(text.trim(), { alters, terms, ...STATUS_TEXT_OPTS });
  if (prepared === null) return null;
  const note = prepared.content.trim();
  if (!note) return null;
  const patch = { note };
  if (timestamp) patch.timestamp = timestamp;
  if (prepared.authorIds?.length) {
    patch.author_alter_id = prepared.authorIds[0];
    patch.author_alter_ids = prepared.authorIds;
  }
  const updated = await base44.entities.StatusNote.update(statusNote.id, patch);
  try {
    await saveMentions({
      content: note, alters, sourceType: "status", sourceId: statusNote.id, sourceLabel: "Status",
      navigatePath: "/checkin-log", authorAlterId: patch.author_alter_id || statusNote.author_alter_id || null,
      excludeIds: extractMentionedIds(statusNote.note || "", alters),
    });
  } catch { /* notifications are best-effort */ }
  return updated;
}

// ── Locations ─────────────────────────────────────────────────────────
// The check-in, the quick action and the Locations page each built the
// record by hand. One shape now: a name (the category's label when none
// was typed), GPS only when coordinates came with it, and who was in
// front, by the same "who" rule as the check-ins above.
export async function logLocation({ category, name, lat, lng, timestamp, frontingAlterIds, ...rest } = {}) {
  const hasGps = lat != null && lng != null;
  return base44.entities.Location.create({
    ...rest,
    timestamp: timestamp || new Date().toISOString(),
    name: (typeof name === "string" && name.trim()) || getCategoryMeta(category || "other").label,
    category: category || "other",
    latitude: hasGps ? lat : null,
    longitude: hasGps ? lng : null,
    source: hasGps ? "gps" : "manual",
    fronting_alter_ids: await whoFor(frontingAlterIds),
  });
}

// ── Diary cards ───────────────────────────────────────────────────────
// The check-in (create and edit), the diary widget and the diary quick
// action each built a card by hand. The widget and the quick action
// dropped the groups the person added to their template, and every door
// kept only three of the safety fields. One shape now, from
// diaryDataToPatch, with the same "who" rule as the check-ins.
// data: DiarySection's { groupKey: { fieldKey: value } }.
export async function logDiaryCard(data, { timestamp, emotions = [], note = "", frontingAlterIds } = {}) {
  if (!hasDiaryData(data)) return null;
  const at = timestamp ? new Date(timestamp) : new Date();
  const text = typeof note === "string" ? note.trim() : "";
  return base44.entities.DiaryCard.create({
    card_type: "daily",
    date: format(at, "yyyy-MM-dd"),
    name: `Daily — ${format(at, "MMM d, yyyy")}`,
    fronting_alter_ids: await whoFor(frontingAlterIds),
    emotions: Array.isArray(emotions) ? emotions : [],
    ...diaryDataToPatch(data),
    notes: text ? { optional: text } : null,
  });
}

// ── Editing and deleting what was logged (house 3.3) ──────────────────
// The Day edits entries from their Info. Every edit reads the row fresh and
// writes only what the person changed (recordEdit.js), keeps the version
// before in Recent changes, and every delete goes to the trash in one batch
// with what belongs to it, so Undo brings it all back.

// A check-in note: long notes (over 50 words) live in a JournalEntry and
// the check-in keeps a 300-character preview + the link, the same rule the
// check-in's create path uses. Returns the two fields to write.
export async function checkInNoteFields(text, { journalEntryId = null, at, title } = {}) {
  const next = typeof text === "string" ? text.trim() : "";
  const wc = next ? next.split(/\s+/).filter(Boolean).length : 0;
  let linked = journalEntryId || null;
  if (next && wc > 50) {
    const { saveCheckInJournal } = await import("@/lib/journalEntry");
    linked = await saveCheckInJournal({ journalEntryId: linked, content: next, title, at });
  }
  return { note: next ? (wc <= 50 ? next : next.substring(0, 300) + "...") : null, journal_entry_id: linked };
}

// fields: any EmotionCheckIn fields the form edits (timestamp, intensity,
// note, journal_entry_id, emotion_alters, contact_ids, author_alter_ids…).
// `emotions` restamps `is_distress` through the distress set;
// `frontingAlterIds` (an array) says who it was for. `baseline`: the row the
// form opened with, so a field the person didn't touch is never written.
export async function editEmotionCheckIn(id, { emotions, frontingAlterIds, customEmotions, baseline = null, ...fields } = {}) {
  const { editRecord } = await import("@/lib/recordEdit");
  const patch = { ...fields };
  if (Array.isArray(emotions)) {
    const labels = emotions.filter((e) => typeof e === "string" && e);
    patch.emotions = labels;
    patch.is_distress = emotionsAreDistressing(labels, customEmotions);
  }
  if (Array.isArray(frontingAlterIds)) patch.fronting_alter_ids = frontingAlterIds;
  return editRecord("EmotionCheckIn", id, patch, { baseline });
}

// The Check-in log's inline note edit: the full grammar (~commands,
// whispers, signposts, @mentions). A signpost re-says who it was for.
// Returns the saved row, or null when the person backed out of a whisper
// warning. A broken ~command throws (isLogCommandError).
export async function editEmotionCheckInNote(checkIn, text, { alters = [], terms = {}, title, navigatePath } = {}) {
  if (!checkIn?.id) return null;
  const [{ prepareAuthoredText, recordAuthoredText }, { parseSignpostAuthors }] = await Promise.all([
    authoredText(), import("@/lib/signpostAuthors"),
  ]);
  const prepared = await prepareAuthoredText(text || "", {
    alters, terms, surfaceLabel: "check-in note", baseAuthorIds: checkIn.fronting_alter_ids || [],
  });
  if (prepared === null) return null;
  const signposted = parseSignpostAuthors(text || "", alters, terms?.system ? [terms.system] : undefined).length > 0;
  const noteFields = await checkInNoteFields(prepared.content, { journalEntryId: checkIn.journal_entry_id, at: checkIn.timestamp, title });
  const saved = await editEmotionCheckIn(checkIn.id, {
    ...noteFields,
    author_alter_ids: prepared.authorIds,
    ...(signposted ? { frontingAlterIds: prepared.authorIds } : {}),
  });
  if (noteFields.note) {
    await recordAuthoredText({ ...prepared, alters, sourceType: "checkin", sourceId: checkIn.id, sourceLabel: "Check-in note", navigatePath });
  }
  return saved;
}

// A check-in and the symptoms logged with it go to the trash together.
// A long note's JournalEntry stays (journals outlive the check-in).
export async function deleteEmotionCheckIn(id) {
  const { trashRecords } = await import("@/lib/recordEdit");
  const linked = await base44.entities.SymptomCheckIn.filter({ check_in_id: id }).catch(() => []);
  return trashRecords([
    ...(linked || []).map((r) => ({ entity: "SymptomCheckIn", id: r.id })),
    { entity: "EmotionCheckIn", id },
  ]);
}

// fields: severity, timestamp, notes…; `frontingAlterIds` says who it was for.
export async function editSymptomCheckIn(id, { frontingAlterIds, baseline = null, ...fields } = {}) {
  const { editRecord } = await import("@/lib/recordEdit");
  const patch = { ...fields };
  if (Array.isArray(frontingAlterIds)) patch.fronting_alter_ids = frontingAlterIds;
  return editRecord("SymptomCheckIn", id, patch, { baseline });
}

export async function deleteSymptomCheckIns(ids) {
  const { trashRecords } = await import("@/lib/recordEdit");
  return trashRecords((ids || []).map((id) => ({ entity: "SymptomCheckIn", id })));
}

// Editing a check-in restates its symptoms. rows: [{ symptomId, severity,
// frontingAlterIds? }]. Symptoms no longer listed go to the trash (one
// batch), listed ones are edited in place, new ones are logged with the
// check-in's link. Read fresh.
export async function syncCheckInSymptoms(checkInId, rows, { timestamp, frontingAlterIds } = {}) {
  if (!checkInId) return { updated: 0, created: 0, removed: 0 };
  const existing = await base44.entities.SymptomCheckIn.filter({ check_in_id: checkInId });
  const wanted = new Map((rows || []).filter((r) => r?.symptomId).map((r) => [r.symptomId, r]));
  const gone = (existing || []).filter((r) => !wanted.has(r.symptom_id)).map((r) => r.id);
  let updated = 0;
  for (const row of existing || []) {
    const want = wanted.get(row.symptom_id);
    if (!want) continue;
    await editSymptomCheckIn(row.id, {
      severity: want.severity ?? null,
      ...(timestamp ? { timestamp } : {}),
      frontingAlterIds: Array.isArray(want.frontingAlterIds) ? want.frontingAlterIds : frontingAlterIds,
    });
    updated++;
  }
  const have = new Set((existing || []).map((r) => r.symptom_id));
  const fresh = [...wanted.values()].filter((r) => !have.has(r.symptomId));
  const created = fresh.length
    ? await logSymptomCheckIns(fresh, { timestamp, checkInId, frontingAlterIds })
    : [];
  const removed = gone.length ? await deleteSymptomCheckIns(gone) : 0;
  return { updated, created: created.length, removed };
}

// ── Places ────────────────────────────────────────────────────────────
// Same shape rules as logLocation: a name (the category's label when none
// was typed), GPS fields only when coordinates came with it.
export async function editLocation(id, { category, name, lat, lng, frontingAlterIds, baseline = null, ...fields } = {}) {
  const { editRecord } = await import("@/lib/recordEdit");
  const patch = { ...fields };
  if (category !== undefined || name !== undefined) {
    patch.category = category || "other";
    patch.name = (typeof name === "string" && name.trim()) || getCategoryMeta(category || "other").label;
  }
  if (lat !== undefined || lng !== undefined) {
    const hasGps = lat != null && lng != null;
    patch.latitude = hasGps ? lat : null;
    patch.longitude = hasGps ? lng : null;
    patch.source = hasGps ? "gps" : "manual";
  }
  if (Array.isArray(frontingAlterIds)) patch.fronting_alter_ids = frontingAlterIds;
  return editRecord("Location", id, patch, { baseline });
}

export async function deleteLocation(id) {
  const { trashRecords } = await import("@/lib/recordEdit");
  return trashRecords([{ entity: "Location", id }]);
}

// ── Diary cards ───────────────────────────────────────────────────────
// Only the diary fields are rewritten (diaryDataToPatch keeps the template's
// groups and every safety field); the card's date, notes, emotions and who
// stay as they were unless the caller passes them.
export async function editDiaryCard(id, data, { frontingAlterIds, baseline = null, ...fields } = {}) {
  const { editRecord } = await import("@/lib/recordEdit");
  const patch = { ...(data ? diaryDataToPatch(data) : {}), ...fields };
  if (Array.isArray(frontingAlterIds)) patch.fronting_alter_ids = frontingAlterIds;
  return editRecord("DiaryCard", id, patch, { baseline });
}

export async function deleteDiaryCardRecord(id) {
  const { trashRecords } = await import("@/lib/recordEdit");
  return trashRecords([{ entity: "DiaryCard", id }]);
}

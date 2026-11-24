// THE Learn write path (house step 0.6, "plumbing out of the walls"):
// reflections (SupportJournalEntry) and topic progress (LearningProgress).
//
// Callers: InteractiveExercise (reflection prompts: autosave and Save),
// NeedsCheckIn (the healthy-needs sliders), MyReflections (edit, delete) and
// TopicView (a topic's notes and its done mark).
//
// Rules kept from the pages:
//   - Reflections autosave; autosave never runs the ~command grammar
//     (CLAUDE.md), and neither does this file.
//   - "Keep history" makes each session its own entry; otherwise the
//     latest entry for that exercise is updated in place.
//   - Deleting a reflection goes to the trash. LearningProgress rows are
//     "instant" in the trash rules (they're progress marks), so this file
//     never deletes one: a topic's notes live there.
//
// Record shapes are exactly what the pages wrote before this file existed;
// scripts/test-reflection-entry.mjs pins them.

import { base44 } from "@/api/base44Client";

const SJ = () => base44.entities.SupportJournalEntry;
const LP = () => base44.entities.LearningProgress;

// ── Reflections ────────────────────────────────────────────────────────

// Saves an exercise's answers: into `entryId` when given (this session's
// entry, or the latest one when not keeping history), else a new entry.
// Returns the saved record.
export async function saveReflection({ entryId = null, exerciseId, exerciseTitle, responses, keepHistory = false }) {
  if (entryId) {
    return SJ().update(entryId, { responses, exercise_title: exerciseTitle });
  }
  return SJ().create({
    exercise_id: exerciseId,
    exercise_title: exerciseTitle,
    responses,
    keep_history: keepHistory,
  });
}

// Which entry a save writes into: this session's, or (without "keep
// history") the latest one; null means a new entry.
export function reflectionTarget({ sessionEntryId = null, keepHistory = false, latestEntry = null }) {
  return sessionEntryId || (!keepHistory && latestEntry ? latestEntry.id : null);
}

export function hasReflectionContent(responses) {
  return Object.values(responses || {}).some((v) => String(v ?? "").trim().length > 0);
}

export const NEEDS_CHECKIN_ID = "needs_checkin";

// The healthy-needs check-in keeps one entry, updated in place.
export async function saveNeedsCheckIn({ latestEntry = null, ratings, exerciseId = NEEDS_CHECKIN_ID }) {
  if (latestEntry) return SJ().update(latestEntry.id, { responses: ratings });
  return SJ().create({ exercise_id: exerciseId, exercise_title: "Healthy Needs Check-In", responses: ratings });
}

// An edit from My Reflections.
export async function editReflection(id, responses) {
  return SJ().update(id, { responses, updated_date: new Date().toISOString() });
}

export async function trashReflection(id) {
  if (!id) return;
  await SJ().delete(id);
}

// ── Topic progress ─────────────────────────────────────────────────────

// A topic's notes (autosaved). Empty notes are never written over saved
// ones.
export async function saveTopicNotes(progress, { moduleId, topicId, notes }) {
  if (!String(notes || "").trim()) return null;
  if (progress) return LP().update(progress.id, { notes });
  return LP().create({ module_id: moduleId, topic_id: topicId, completed: false, notes });
}

export async function toggleTopicComplete(progress, { moduleId, topicId }) {
  const now = new Date().toISOString();
  if (progress) {
    return LP().update(progress.id, { completed: !progress.completed, completed_date: !progress.completed ? now : null });
  }
  return LP().create({ module_id: moduleId, topic_id: topicId, completed: true, completed_date: now });
}

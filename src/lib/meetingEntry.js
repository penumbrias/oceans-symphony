// THE system meeting write path (house step 0.6, "plumbing out of the walls").
//
// A meeting is one SystemCheckIn record (the five steps, participants and
// the date). The meetings page (src/pages/SystemCheckIn.jsx) saves, edits
// and deletes through here. A meeting saved to a chat channel writes its
// dialogue through chatEntry.js; the meeting record itself only holds the
// steps.
//
// What a save does:
//   1. Each step's notes run the shared grammar (prepareAuthoredText:
//      ~commands, /w whispers, signposts). A malformed command throws
//      LogCommandFormatError and nothing is saved; backing out of a
//      whisper warning returns null and nothing is saved.
//   2. The record is created, or updated in place when editing.
//   3. @mentions in steps 3–5 notify (best-effort). When any step holds a
//      whisper, the notice preview is WHISPER_PREVIEW, never the text.
//   4. A NEW meeting logs its feelings through checkinEntry.js: one
//      EmotionCheckIn per participant with feelings, and one for step 2's
//      "feelings noticed" across everyone present. Editing a past meeting
//      never logs feelings again and never touches the live front.
//
// Record shapes are exactly what the page wrote before this file existed;
// scripts/test-meeting-entry.mjs pins them.

import { base44 } from "@/api/base44Client";
import { prepareAuthoredText } from "@/lib/authoredText";
import { logEmotionCheckIn } from "@/lib/checkinEntry";
import { saveMentions } from "@/lib/mentionUtils";
import { WHISPER_PREVIEW } from "@/lib/whisperRedact";

const SCI = () => base44.entities.SystemCheckIn;

export const MEETING_STEPS = ["step1_arrive", "step2_notice", "step3_greet", "step4_share", "step5_closing"];

export function todayLocalDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// The participants who name someone (same rule as normalizeParticipants
// in MeetingParticipantsSection.jsx).
export function normalizeMeetingParticipants(list) {
  return (Array.isArray(list) ? list : []).filter((p) => p && p.alter_id);
}

// Step 1 of a save (pure apart from the grammar's own records). Returns
// { dataToSave, meetingAuthorId, hasWhisper } or null when the person
// backed out. Throws LogCommandFormatError for a broken command.
export async function prepareMeetingSteps(formData, { alters = [], terms } = {}) {
  const dataToSave = { ...formData };
  if (!dataToSave.date) dataToSave.date = todayLocalDate();
  let meetingAuthorId = null;
  let hasWhisper = false;
  for (const key of MEETING_STEPS) {
    const step = dataToSave[key];
    if (!step?.notes) continue;
    const prepared = await prepareAuthoredText(step.notes, { alters, terms, surfaceLabel: "check-in note" });
    if (prepared === null) return null;
    dataToSave[key] = { ...step, notes: prepared.content, author_alter_ids: prepared.authorIds };
    if (!meetingAuthorId && prepared.authorIds[0]) meetingAuthorId = prepared.authorIds[0];
    if (prepared.isWhisper) hasWhisper = true;
  }
  return { dataToSave, meetingAuthorId, hasWhisper };
}

async function notifyMeetingMentions({ formData, meeting, alters, meetingAuthorId, hasWhisper }) {
  // The original text: the /w recipients' @names are still in it, so they
  // are notified too.
  const text = [formData.step3_greet?.notes, formData.step4_share?.notes, formData.step5_closing?.notes].filter(Boolean).join(" ");
  if (!text || !alters.length) return;
  try {
    await saveMentions({
      content: text,
      alters,
      sourceType: "checkin",
      sourceId: meeting.id,
      sourceLabel: "System Check-In",
      navigatePath: `/system-checkin?id=${meeting.id}`,
      authorAlterId: meetingAuthorId,
      ...(hasWhisper ? { previewText: WHISPER_PREVIEW } : {}),
    });
  } catch { /* notices are best-effort; the meeting is saved */ }
}

// Step 2's feelings as a list of labels (older meetings stored a
// comma/semicolon string).
export function stepTwoFeelings(formData) {
  const feelings = formData?.step2_notice?.feelings;
  if (Array.isArray(feelings)) return feelings.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
  if (typeof feelings === "string" && feelings.trim()) return feelings.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

// A new meeting's feelings → EmotionCheckIns. Returns
// { participantFailures, stepTwoFailed, logged } for the page to report.
export async function logMeetingFeelings(formData, alters = []) {
  let logged = 0;
  let participantFailures = 0;
  for (const p of Array.isArray(formData.participants) ? formData.participants : []) {
    const emos = Array.isArray(p?.emotions) ? p.emotions.filter((s) => typeof s === "string" && s.trim()) : [];
    if (!p?.alter_id || emos.length === 0) continue;
    const noteBits = ["From system meeting"];
    if ((p.note || "").trim()) noteBits.push(p.note.trim());
    try {
      await logEmotionCheckIn({ emotions: emos, frontingAlterIds: [p.alter_id], alter_id: p.alter_id, note: noteBits.join(". ") });
      logged++;
    } catch (e) {
      console.error("Failed to save a participant's emotions", e);
      participantFailures++;
    }
  }
  // Who's near: the participants, plus step2_notice.alters_present from
  // older drafts; only people who still exist.
  const participantIds = normalizeMeetingParticipants(formData.participants).map((p) => p.alter_id);
  const legacyPresent = formData.step2_notice?.alters_present || [];
  const presentIds = [...new Set([...participantIds, ...legacyPresent])].filter((id) => alters.some((a) => a.id === id));
  let stepTwoFailed = false;
  const labels = stepTwoFeelings(formData);
  if (labels.length) {
    const sensations = (formData.step2_notice?.sensations || "").trim();
    const stepNotes = (formData.step2_notice?.notes || "").trim();
    const noteParts = ["From system check-in"];
    if (sensations) noteParts.push(`Sensations: ${sensations}`);
    if (stepNotes) noteParts.push(`Notes: ${stepNotes}`);
    try {
      await logEmotionCheckIn({ emotions: labels, frontingAlterIds: presentIds, note: noteParts.join(". ") });
      logged++;
    } catch (e) {
      console.error("Failed to save check-in emotions", e);
      stepTwoFailed = true;
    }
  }
  return { logged, participantFailures, stepTwoFailed };
}

// The whole save. `existing` edits that meeting in place. Returns null when
// the person backed out, else { meeting, isNew, feelings }.
export async function saveMeeting({ existing = null, formData, alters = [], terms }) {
  const prep = await prepareMeetingSteps(formData, { alters, terms });
  if (!prep) return null;
  const { dataToSave, meetingAuthorId, hasWhisper } = prep;
  const meeting = existing?.id ? await SCI().update(existing.id, dataToSave) : await SCI().create(dataToSave);
  await notifyMeetingMentions({ formData, meeting, alters, meetingAuthorId, hasWhisper });
  if (existing?.id) return { meeting, isNew: false, feelings: null };
  const feelings = await logMeetingFeelings(formData, alters);
  return { meeting, isNew: true, feelings };
}

// To the trash (restorable; the page offers Undo).
export async function trashMeeting(id) {
  if (!id) return;
  await SCI().delete(id);
}

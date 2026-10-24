// The written parts of a System Meeting (SystemCheckIn), for the therapy
// report and global search. Meetings store their text per step
// (step1_arrive … step5_closing) and per participant; the old readers
// looked for `responses` / `notes` fields that meetings never had, so
// both showed every meeting as empty. The dialogue is left out on
// purpose: it can live in a chat channel with its own privacy.

const STEPS = [
  ["step1_arrive", "Arrive"],
  ["step2_notice", "Notice"],
  ["step3_greet", "Greet"],
  ["step4_share", "Share"],
  ["step5_closing", "Closing"],
];

const plain = (v) => (typeof v === "string" ? v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "");

// [{ label, text }] in meeting order, empty parts skipped.
export function meetingTextParts(meeting) {
  const out = [];
  if (!meeting || typeof meeting !== "object") return out;
  for (const [key, label] of STEPS) {
    const step = meeting[key];
    if (!step || typeof step !== "object") continue;
    const feelings = Array.isArray(step.feelings) ? step.feelings.join(", ") : plain(step.feelings);
    if (feelings) out.push({ label: `${label} (feelings)`, text: feelings });
    const sensations = plain(step.sensations);
    if (sensations) out.push({ label: `${label} (sensations)`, text: sensations });
    const notes = plain(step.notes);
    if (notes) out.push({ label, text: notes });
  }
  for (const p of Array.isArray(meeting.participants) ? meeting.participants : []) {
    const note = plain(p?.note);
    if (note) out.push({ label: "Participant", text: note, alterId: p.alter_id || null });
  }
  return out;
}

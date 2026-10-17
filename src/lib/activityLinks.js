// Links between activities and the people / feelings around them (System
// Needs, step 3). Two record types, both user-set — suggested links are
// never stored (they get worked out on request and only become records
// when confirmed):
//
//   AlterActivityLink — { alter_id, category_id, relation, strength (1–5), note, author_alter_ids }
//   FeelingLink       — { category_id, emotion (wheel label), effect, note }
//
// Both are backed up with ActivityCategory ("settings" export category).

import { base44 } from "@/api/base44Client";

// Plain-language relations. "interrupts" is worded as a need, never as
// blame (design rule: interrupting is a need not yet met).
export const ALTER_RELATIONS = [
  { id: "enjoys",     label: "Enjoys",            tone: "good" },
  { id: "needs",      label: "Needs",             tone: "good" },
  { id: "obligated",  label: "Feels obligated",   tone: "mixed" },
  { id: "dislikes",   label: "Dislikes",          tone: "hard" },
  { id: "avoids",     label: "Avoids",            tone: "hard" },
  { id: "interrupts", label: "Tends to interrupt", tone: "mixed" },
];

export const FEELING_EFFECTS = [
  { id: "helps",     label: "Helps us feel" },
  { id: "brings_up", label: "Can bring up" },
];

export const relationLabel = (id) => ALTER_RELATIONS.find((r) => r.id === id)?.label || id;

export function clampStrength(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : 3;
}

// Every link for one category, split by kind. Never throws — a broken read
// shows as "no links" rather than blanking the details page.
export async function listLinksFor(categoryId) {
  const safe = async (p) => { try { return (await p) || []; } catch { return []; } };
  const [alterLinks, feelingLinks] = await Promise.all([
    safe(base44.entities.AlterActivityLink.filter({ category_id: categoryId })),
    safe(base44.entities.FeelingLink.filter({ category_id: categoryId })),
  ]);
  return { alterLinks, feelingLinks };
}

// Toggle one emotion on one effect: adds a FeelingLink, or removes the one
// that exists. Removing is the user's own explicit act (tapping the chip
// off), so a delete is right here.
export async function toggleFeelingLink({ categoryId, emotion, effect, existing }) {
  const match = (existing || []).find((l) => l.emotion === emotion && l.effect === effect);
  if (match) {
    await base44.entities.FeelingLink.delete(match.id);
    return null;
  }
  return base44.entities.FeelingLink.create({ category_id: categoryId, emotion, effect });
}

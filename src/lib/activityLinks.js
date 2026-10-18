// Links between activities and the people / feelings around them (System
// Needs, step 3). Two record types, both user-set — suggested links are
// never stored (they get worked out on request and only become records
// when confirmed):
//
//   AlterActivityLink — { alter_id, category_id, relation, strength (1–5), note, author_alter_ids }
//   FeelingLink       — { category_id, emotion (wheel label), effect, note }
//   ActivityLinkType  — the user's own relations beside the presets:
//                       { label, counts_as (null | "needs" | "interrupts"),
//                         removed_at }. A link stores the type's id as its
//                       `relation`. Removing a type is a soft mark, so links
//                       that use it keep their label.
//
// All three are backed up with ActivityCategory ("settings" export category).

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

export const LINK_TYPES_QUERY_KEY = ["activityLinkTypes"];

// What a user-made type can count as elsewhere in the app: on the Needs
// balance (like "Needs") or for the start-of-activity note (like "Tends to
// interrupt").
export const COUNTS_AS = [
  { id: null,         label: "Just a label" },
  { id: "needs",      label: "Counts as a need" },
  { id: "interrupts", label: "Counts as interrupting" },
];

// Presets first, then the user's own types (removed ones only when asked —
// links that still use them need their label).
export function allRelations(customTypes = [], { includeRemoved = false } = {}) {
  const custom = (customTypes || [])
    .filter((ct) => ct && (includeRemoved || !ct.removed_at))
    .sort((a, b) => String(a.created_date || "").localeCompare(String(b.created_date || "")))
    .map((ct) => ({ id: ct.id, label: ct.label || "Untitled", tone: "custom", custom: true, counts_as: ct.counts_as || null, removed: !!ct.removed_at }));
  return [...ALTER_RELATIONS, ...custom];
}

export const relationLabel = (id, customTypes = []) =>
  ALTER_RELATIONS.find((r) => r.id === id)?.label
  || (customTypes || []).find((ct) => ct.id === id)?.label
  || id;

// The preset a relation behaves like: itself for presets, counts_as for
// the user's own types.
export function relationBehavesAs(id, customTypes = []) {
  if (ALTER_RELATIONS.some((r) => r.id === id)) return id;
  return (customTypes || []).find((ct) => ct.id === id)?.counts_as || null;
}

export function createLinkType(label, countsAs = null) {
  return base44.entities.ActivityLinkType.create({ label: String(label || "").trim(), counts_as: countsAs || null });
}

export function updateLinkType(type, fields) {
  return base44.entities.ActivityLinkType.update(type.id, fields);
}

export function removeLinkType(type) {
  return base44.entities.ActivityLinkType.update(type.id, { removed_at: new Date().toISOString() });
}

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

// THE grounding technique write path (house step 0.6, "plumbing out of the
// walls"). A technique's rating, note and favourite already have theirs
// (groundingPreferences.js); this file owns the GroundingTechnique rows:
// the person's own techniques (CustomTechniqueForm) and the built-in ones
// the Grounding page seeds (seedDefaultTechniques).
//
// Seeding only ever ADDS built-ins that are missing by name. Its one
// clean-up folds duplicate built-in rows (is_default, a known built-in
// name — backups before v0.17.23 exported them, so repeated restores made
// 2–5 copies): the oldest stays, the others go to the trash, where they can
// be restored. A person's own techniques are never touched.
//
// Record shapes are exactly what the pages wrote before this file existed;
// scripts/test-grounding-entry.mjs pins them.

import { base44 } from "@/api/base44Client";
import { DEFAULT_TECHNIQUES } from "@/utils/groundingDefaults";

const GT = () => base44.entities.GroundingTechnique;

export async function createCustomTechnique({ name, description = "", category, steps = [], durationMinutes = "", suggestedFor = [] }) {
  return GT().create({
    name: name.trim(),
    description: description.trim(),
    category,
    steps: steps.filter((s) => s.trim()),
    duration_seconds: durationMinutes ? parseInt(durationMinutes) * 60 : null,
    suggested_for: suggestedFor,
    is_default: false,
    is_archived: false,
    order: 100,
  });
}

// The duplicate built-in rows to fold: every is_default row with a
// built-in name except the oldest of each name. Pure.
export function duplicateDefaultTechniques(existing, defaults = DEFAULT_TECHNIQUES) {
  const defaultNames = new Set(defaults.map((t) => t.name));
  const groups = new Map();
  for (const t of existing || []) {
    if (!t || !defaultNames.has(t.name) || !t.is_default) continue;
    if (!groups.has(t.name)) groups.set(t.name, []);
    groups.get(t.name).push(t);
  }
  const dups = [];
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => {
      const ta = a.created_date ? new Date(a.created_date).getTime() : 0;
      const tb = b.created_date ? new Date(b.created_date).getTime() : 0;
      return ta - tb;
    });
    dups.push(...group.slice(1));
  }
  return dups;
}

export async function seedDefaultTechniques(defaults = DEFAULT_TECHNIQUES) {
  const existing = await GT().list();
  for (const dup of duplicateDefaultTechniques(existing, defaults)) {
    try { await GT().delete(dup.id); } catch { /* one failure doesn't stop seeding */ }
  }
  const fresh = await GT().list();
  const existingNames = new Set(fresh.map((t) => t.name));
  const toAdd = defaults.filter((t) => !existingNames.has(t.name));
  if (toAdd.length > 0) await GT().bulkCreate(toAdd);
  return toAdd.length;
}

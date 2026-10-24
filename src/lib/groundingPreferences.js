// One save path for a grounding technique's rating, note and favourite
// (v0.277.1). The Grounding page and the home-screen grounding widget both
// open the same GuidedTechniqueView; before this the widget passed no save
// handlers, so a note written there looked saved and was thrown away.
//
// Reads the technique's preference fresh before writing, so two quick
// saves never make two rows for one technique.

import { base44 } from "@/api/base44Client";

async function currentPreference(techniqueId) {
  const rows = await base44.entities.GroundingPreference.filter({ technique_id: techniqueId });
  return rows?.[0] || null;
}

export async function saveGroundingPreference(techniqueId, patch) {
  if (!techniqueId) throw new Error("No technique to save to");
  const pref = await currentPreference(techniqueId);
  if (pref) return base44.entities.GroundingPreference.update(pref.id, patch);
  return base44.entities.GroundingPreference.create({ technique_id: techniqueId, ...patch });
}

export async function toggleGroundingFavorite(techniqueId) {
  const pref = await currentPreference(techniqueId);
  return saveGroundingPreference(techniqueId, { is_favorited: !pref?.is_favorited });
}

// The handler set GuidedTechniqueView takes, ready to spread onto it.
export function groundingPreferenceHandlers(onSaved) {
  const done = () => { try { onSaved?.(); } catch { /* refresh only */ } };
  return {
    onRate: async (technique, rating, alterId) => {
      await saveGroundingPreference(technique.id, { rating, alter_id: alterId || null });
      done();
    },
    onSaveNote: async (technique, notes, alterId) => {
      await saveGroundingPreference(technique.id, { notes, alter_id: alterId || null });
      done();
    },
    onToggleFavorite: async (technique) => {
      await toggleGroundingFavorite(technique.id);
      done();
    },
  };
}

// Tidy up duplicated symptoms / habits — the storage half of the "Tidy up
// duplicates" tool (SymptomDuplicatesModal). Groups come from
// findDuplicateGroups / planGroup in symptomDuplicates.js.
//
// Nothing is ever deleted (user-data invariant):
//   • MERGE (same scale): every reference to the copy anywhere in the
//     database — check-ins, symptom sessions, fronting-session payloads,
//     reminders, quick actions — is re-pointed at the kept row via
//     replaceIdReferences. The copy is then ARCHIVED with `merged_into`,
//     not deleted, so a synced device's older copy can't bring it back
//     live and a widget that chose it can follow the link.
//   • HIDE (different scale): the copy is only archived. Its own logs stay
//     on it, readable in history and analytics, numbers untouched.
// The whole run is one disk write (withBatch).

import { localEntities } from "@/api/base44Client";
import { replaceIdReferences, withBatch } from "./localDb";

const SLIDER_KEY = "symphony_quickcheckin_slider_symptom_v1";

// `steps` = [{ keeperId, items: [{ row, action: "merge" | "hide" }] }]
export function applySymptomCleanup(steps) {
  return withBatch(async () => {
    let merged = 0, hidden = 0, moved = 0;
    for (const { keeperId, items } of steps || []) {
      if (!keeperId) continue;
      const keeper = await localEntities.Symptom.get(keeperId);
      if (!keeper) continue;
      if (keeper.is_archived) await localEntities.Symptom.update(keeperId, { is_archived: false });
      for (const { row, action } of items || []) {
        if (!row?.id || row.id === keeperId) continue;
        const live = await localEntities.Symptom.get(row.id);
        if (!live) continue;
        if (action === "merge") {
          moved += await replaceIdReferences(row.id, keeperId, { skipEntities: ["Symptom"] });
          await localEntities.Symptom.update(row.id, { is_archived: true, merged_into: keeperId });
          try { if (localStorage.getItem(SLIDER_KEY) === row.id) localStorage.setItem(SLIDER_KEY, keeperId); } catch { /* no storage */ }
          merged++;
        } else {
          await localEntities.Symptom.update(row.id, { is_archived: true });
          hidden++;
        }
      }
    }
    return { merged, hidden, moved };
  });
}

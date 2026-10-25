// THE delete for an alter (v0.279.8, roadmap step 4).
//
// The edit sheet, the profile tab and the options tab each had their own
// delete button; only the alter row went to the trash, so restoring an
// alter brought back an empty board with its notes and relationships gone
// for good after the purge. Now one batch carries the alter and what
// belongs only to them, and restoring the batch puts it all back at once:
//
//   • AlterNote      — notes on their profile (alter_id)
//   • AlterMessage   — their board (alter_id) and their private inbox
//                      (to_alter_id); messages they wrote elsewhere stay
//   • AlterRelationship — every relationship with them on either end
//
// Group memberships are left as they are: readers only list alters that
// exist, so a trashed alter drops out of every group, and comes back in on
// restore. Fronting history and check-ins keep the alter's id.

import { base44 } from "@/api/base44Client";
import { withTrashBatch } from "@/lib/localDb";

async function safeFilter(entity, query) {
  try { return (await base44.entities[entity].filter(query)) || []; } catch { return []; }
}

export async function deleteAlter(alter) {
  if (!alter?.id) return;
  const id = alter.id;
  await withTrashBatch(async () => {
    const [notes, board, inbox, relA, relB, relSrc, relTgt] = await Promise.all([
      safeFilter("AlterNote", { alter_id: id }),
      safeFilter("AlterMessage", { alter_id: id }),
      safeFilter("AlterMessage", { to_alter_id: id }),
      safeFilter("AlterRelationship", { alter_id_a: id }),
      safeFilter("AlterRelationship", { alter_id_b: id }),
      // Imported relationships use the other pair of names.
      safeFilter("AlterRelationship", { source_alter_id: id }),
      safeFilter("AlterRelationship", { target_alter_id: id }),
    ]);
    const seen = new Set();
    const dependents = [
      ...notes.map((r) => ["AlterNote", r]),
      ...[...board, ...inbox].map((r) => ["AlterMessage", r]),
      ...[...relA, ...relB, ...relSrc, ...relTgt].map((r) => ["AlterRelationship", r]),
    ].filter(([entity, r]) => {
      const key = `${entity}:${r.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // The alter first: if anything after it fails, the person still sees
    // the delete they asked for and the rest stays visible, never lost.
    await base44.entities.Alter.delete(id);
    for (const [entity, r] of dependents) {
      try { await base44.entities[entity].delete(r.id); } catch { /* stays visible */ }
    }
  });
}

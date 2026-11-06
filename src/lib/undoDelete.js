// Delete now, offer Undo (UI critique H3, v0.364.8).
//
// Deletes go to the trash (v0.278.0), so a recoverable delete needs no
// "Are you sure?": it happens at once and a toast offers Undo for about
// ten seconds, saying how long the trash keeps it. Confirmation dialogs
// are kept for the things that skip the trash.
//
//   await deleteWithUndo({
//     label: "Check-in deleted",
//     run: () => localEntities.EmotionCheckIn.delete(id),
//     refresh: () => queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] }),
//   });
//
// Everything `run` deletes shares one trash batch, so Undo brings all of
// it back together (a check-in and the symptoms logged with it).

import { toast } from "sonner";
import { withTrashBatch, listTrashedRecords, TRASH_BATCH } from "@/lib/localDb";
import { getTrashSettings, restoreFromTrash } from "@/lib/trash";

export const UNDO_DELETE_MS = 10000;

export function trashKeepsText(days) {
  if (days === 0) return "In the trash until you empty it";
  return `In the trash for ${days} day${days === 1 ? "" : "s"}`;
}

// Put back everything one batch trashed. Returns how many came back.
export async function restoreTrashBatch(batch) {
  if (!batch) return 0;
  const items = listTrashedRecords()
    .filter(({ record }) => record[TRASH_BATCH] === batch)
    .map(({ entity, record }) => ({ entity, id: record.id }));
  if (!items.length) return 0;
  return restoreFromTrash(items);
}

export async function deleteWithUndo({ label = "Deleted", run, refresh } = {}) {
  let batch = null;
  try {
    await withTrashBatch(async (id) => { batch = id; await run(); });
  } catch (e) {
    toast.error(e?.message || "Couldn't delete that.");
    try { refresh?.(); } catch { /* ignore */ }
    return false;
  }
  try { refresh?.(); } catch { /* ignore */ }
  let days = 30;
  try { days = (await getTrashSettings()).days; } catch { /* default */ }
  toast(label, {
    description: trashKeepsText(days),
    duration: UNDO_DELETE_MS,
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          const n = await restoreTrashBatch(batch);
          try { refresh?.(); } catch { /* ignore */ }
          if (!n) toast.error("Couldn't bring it back here. Look in Recent Changes → Trash.");
        } catch (e) {
          toast.error(e?.message || "Couldn't undo. It's still in Recent Changes → Trash.");
        }
      },
    },
  });
  return true;
}

// For a removal the trash doesn't cover (an entry inside a record's own
// list, like a note on a fronting session): it happens at once and Undo
// writes the old value back.
export function offerUndo({ label = "Deleted", description, undo } = {}) {
  toast(label, {
    description,
    duration: UNDO_DELETE_MS,
    action: {
      label: "Undo",
      onClick: async () => {
        try { await undo?.(); } catch (e) { toast.error(e?.message || "Couldn't undo."); }
      },
    },
  });
}

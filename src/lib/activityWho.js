// Who did a logged activity: the one writer for changing it afterwards
// (the house's Notebook ledger, "Tap By to change who did it").
//
// An activity says who did it in `fronting_alter_ids` (what the timer,
// the editor and the page timer write). Older rows may carry only the
// single `alter_id`; when the row has one, it moves with the list (its
// first name, or none), so readers of either field agree.
//
// Goes through editRecord (src/lib/recordEdit.js): a fresh read, only the
// fields that changed against what the sheet opened with, the version
// before kept in Recent changes (restorable), `_ft` stamped by the proxy.

import { editRecord } from "@/lib/recordEdit";

export const activityWhoIds = (a) => {
  if (Array.isArray(a?.fronting_alter_ids) && a.fronting_alter_ids.length) return a.fronting_alter_ids.filter(Boolean);
  return a?.alter_id ? [a.alter_id] : [];
};

/** The patch that says `ids` did activity `a` (pure). */
export function activityWhoPatch(a, ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  const patch = { fronting_alter_ids: list };
  if (a && Object.prototype.hasOwnProperty.call(a, "alter_id") && a.alter_id != null) patch.alter_id = list[0] || null;
  return patch;
}

/**
 * @param {object} activity  the row as the sheet opened it (the baseline)
 * @param {string[]} ids     who did it ([] = not signed)
 */
export async function setActivityWho(activity, ids) {
  if (!activity?.id) throw new Error("That activity couldn't be found.");
  return editRecord("Activity", activity.id, activityWhoPatch(activity, ids), { baseline: activity });
}

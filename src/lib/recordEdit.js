// The shared edit and delete step behind the Day's writers (house 3.3,
// docs/house/write-paths.md): check-ins, symptom check-ins and episodes,
// nights, places and diary cards.
//
//   editRecord(entity, id, patch, { baseline })
//     Reads the record FRESH, then writes only the fields the person
//     actually changed: a field is written when it differs from what the
//     form loaded (`baseline`, the record the form opened with) AND from
//     what is stored now. So a field another device changed while the form
//     was open, and that the person didn't touch, keeps the other device's
//     value. Without a baseline the fresh record is the baseline. The
//     version before the edit is kept in Recent changes (keepEditRestorePoint)
//     and the write goes through the entity proxy, so `_ft` and
//     `updated_date` stamp as usual. Nothing changed → nothing is written.
//
//   trashRecords([{ entity, id }])
//     Deletes go to the trash (restorable) in ONE batch, so Undo or Recent
//     changes brings everything back together.

import { base44 } from "@/api/base44Client";
import { withTrashBatch } from "@/lib/localDb";
import { keepEditRestorePoint } from "@/lib/editRestorePoint";

export class RecordEditError extends Error {}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// The fields of `patch` worth writing (see above).
export function changedFields(patch, fresh, baseline = fresh) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined) continue;
    if (same(v, baseline?.[k]) && baseline !== fresh) continue;
    if (same(v, fresh?.[k])) continue;
    out[k] = v;
  }
  return out;
}

export async function readFresh(entity, id) {
  const fresh = id ? await base44.entities[entity].get(id).catch(() => null) : null;
  if (!fresh) throw new RecordEditError("That entry couldn't be found. It may have been deleted.");
  return fresh;
}

export async function editRecord(entity, id, patch, { baseline = null, fresh = null } = {}) {
  const current = fresh || await readFresh(entity, id);
  const out = changedFields(patch, current, baseline || current);
  if (!Object.keys(out).length) return current;
  keepEditRestorePoint(entity, current);
  return base44.entities[entity].update(id, out);
}

export async function trashRecords(items) {
  const list = (items || []).filter((x) => x?.entity && x?.id);
  if (!list.length) return 0;
  return withTrashBatch(async () => {
    let n = 0;
    for (const { entity, id } of list) {
      await base44.entities[entity].delete(id);
      n++;
    }
    return n;
  });
}

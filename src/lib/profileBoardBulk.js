// The only bulk writes to profile layouts (v0.292.0):
//   applyLayoutToAll — this board onto every profile of the type
//   setDefaultLayout / clearDefaultLayout — the type's default row
//   resetLayout — a profile back to the default (or the seed)
// Each goes through the profile board store (fresh row, stamped), so sync
// treats the copies like any edit, and every board a write replaces is
// snapshotted into Recent changes by the entity layer (ProfileBoard.update
// records the previous board; a delete records the row). Callers confirm
// with the person first.
import { base44, localEntities } from "@/api/base44Client";
import { profileBoardStore, listProfileBoardRows, profileBoardQueryKey } from "@/lib/boardStore";
import { DEFAULT_OWNER_ID, layoutForCopy, pickProfileBoardRows, isProfileOwnerType } from "@/lib/profileBoard";

const OWNER_ENTITY = { alter: "Alter", group: "Group", contact: "Contact", location: "InnerWorldLocation" };

export async function listOwners(ownerType) {
  const entity = OWNER_ENTITY[ownerType];
  if (!entity) return [];
  try { return await base44.entities[entity].list(); } catch { return []; }
}

export async function defaultLayoutFor(ownerType) {
  const rows = await listProfileBoardRows(ownerType, DEFAULT_OWNER_ID);
  return pickProfileBoardRows(rows);
}

// Writes `board` (as a copy) onto one owner's row, creating it if needed.
async function writeCopy(ownerType, ownerId, copy, qc) {
  const store = profileBoardStore({ ownerType, ownerId, rows: [], qc });
  await store.update(() => copy);
  if (qc) qc.invalidateQueries({ queryKey: profileBoardQueryKey(ownerType, ownerId) });
}

export async function applyLayoutToAll(ownerType, board, { qc = null, exceptId = null } = {}) {
  if (!isProfileOwnerType(ownerType)) throw new Error(`Not a profile type: ${ownerType}`);
  const copy = layoutForCopy(board);
  if (!copy) throw new Error("Nothing to copy");
  const owners = (await listOwners(ownerType)).filter((o) => o?.id && String(o.id) !== String(exceptId));
  let n = 0;
  for (const o of owners) {
    await writeCopy(ownerType, o.id, copy, qc);
    n += 1;
  }
  return n;
}

export async function setDefaultLayout(ownerType, board, { qc = null } = {}) {
  if (!isProfileOwnerType(ownerType)) throw new Error(`Not a profile type: ${ownerType}`);
  const copy = layoutForCopy(board);
  if (!copy) throw new Error("Nothing to copy");
  await writeCopy(ownerType, DEFAULT_OWNER_ID, copy, qc);
}

export async function clearDefaultLayout(ownerType, { qc = null } = {}) {
  for (const r of await listProfileBoardRows(ownerType, DEFAULT_OWNER_ID)) {
    try { await localEntities.ProfileBoard.delete(r.id); } catch { /* best-effort */ }
  }
  if (qc) qc.invalidateQueries({ queryKey: profileBoardQueryKey(ownerType, DEFAULT_OWNER_ID) });
}

// Back to the default layout (or the seed): the profile's own rows go to
// the trash, where Recent changes / the trash can bring them back.
export async function resetLayout(ownerType, ownerId, { qc = null } = {}) {
  for (const r of await listProfileBoardRows(ownerType, ownerId)) {
    try { await localEntities.ProfileBoard.delete(r.id); } catch { /* best-effort */ }
  }
  if (qc) qc.invalidateQueries({ queryKey: profileBoardQueryKey(ownerType, ownerId) });
}

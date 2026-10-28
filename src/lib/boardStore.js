// Board stores (v0.289.0) — where a board is read from and written to.
//
// Until now a board was a field on the one SystemSettings row, and the
// canvas (ExperimentalDashboard), the one board writer (boardWriter.js) and
// the editing sheets all knew it. A profile's layout lives somewhere else
// (a ProfileBoard row per alter / group / contact / location — see
// profileBoard.js), so the canvas now talks to a store and the stores know
// the rows.
//
// A store is a plain object:
//   kind        "settings" | "profile"
//   queryKey    the react-query key whose data holds the board
//   id          the row the board is on, or null when there is none yet
//   board       the raw stored board for rendering (null when none)
//   setCached(written)   optimistic cache update so the screen follows at
//                        once (the canvas awaits cancelQueries first)
//   write(next, { machine })  persist exactly this board (fresh row lookup
//                        inside; creates the row when there is none).
//                        The canvas stamps before calling this. A profile
//                        store creates NO row for a machine write (the
//                        canvas's auto-fit): a seeded profile board stays
//                        unsaved until the person's first edit, and the
//                        page keeps the fitted copy in memory (returns null).
//   update(change, { machine })  the boardWriter contract: fresh read,
//                        change(current), stamp unless machine, write.
//   invalidate()         refetch the truth
//
// Stamping lives in one place either way (boardStamp.stampBoardChanges);
// machine writes (auto-fit, tidy-ups) never look newer than a person's
// edit, same as before.

import { base44, localEntities } from "@/api/base44Client";
import { stampBoardChanges } from "@/lib/boardStamp";
import { pickProfileBoardRows, isProfileOwnerType, layoutOwnerIds } from "@/lib/profileBoard";

export const isBoardStore = (x) => !!x && typeof x === "object" && typeof x.write === "function" && typeof x.update === "function";

const stampUnlessMachine = (current, next, machine) => {
  if (!next || typeof next !== "object") return next;
  let out = next;
  if (!machine) {
    if (out._seeded) { out = { ...out }; delete out._seeded; }
    out = stampBoardChanges(current, out);
  }
  return out;
};

// ── The home screen and the widget board: a field on SystemSettings ──
export function settingsBoardStore({ settingsRow, field, qc }) {
  const id = settingsRow?.id || null;
  const queryKey = ["systemSettings"];
  const findRow = async () => {
    if (id) return base44.entities.SystemSettings.get(id);
    // No row in hand yet: look again before creating, so a slow first
    // load can't leave a second settings record behind.
    return (await base44.entities.SystemSettings.list())[0] || null;
  };
  const writeRaw = async (next, extra = null) => {
    const row = await findRow();
    if (row?.id) await base44.entities.SystemSettings.update(row.id, { ...(extra || {}), [field]: next });
    else await base44.entities.SystemSettings.create({ ...(extra || {}), [field]: next });
    return next;
  };
  return {
    kind: "settings",
    field,
    id,
    queryKey,
    board: settingsRow?.[field] ?? null,
    setCached(written) {
      if (!id || !qc) return;
      qc.setQueryData(queryKey, (rows) => (Array.isArray(rows)
        ? rows.map((r) => (r?.id === id ? { ...r, [field]: written } : r))
        : rows));
    },
    write: (next) => writeRaw(next),
    async update(change, { machine = false, extra = null } = {}) {
      const row = await findRow();
      const current = row?.[field] ?? null;
      const next = typeof change === "function" ? change(current) : change;
      if (!next || typeof next !== "object") return current;
      const stamped = stampUnlessMachine(current, next, machine);
      await writeRaw(stamped, extra);
      return stamped;
    },
    invalidate() { if (qc) qc.invalidateQueries({ queryKey }); },
  };
}

// ── A profile: its own ProfileBoard row ──────────────────────────────
export const profileBoardQueryKey = (ownerType, ownerId) => ["profileBoard", ownerType, String(ownerId)];

export async function listProfileBoardRows(ownerType, ownerId) {
  if (!isProfileOwnerType(ownerType) || !ownerId) return [];
  try {
    return await localEntities.ProfileBoard.filter({ owner_type: ownerType, owner_id: ownerId });
  } catch { return []; }
}

// Trash a profile's layout rows with the profile (call inside the owner's
// trash batch, so a restore brings the layout back with the record).
// Both layouts a record can have (the plain id and the new profile's
// `::v2` row, v0.305.0) go together.
export async function trashProfileBoards(ownerType, ownerId) {
  for (const key of layoutOwnerIds(ownerId)) {
    for (const r of await listProfileBoardRows(ownerType, key)) {
      try { await localEntities.ProfileBoard.delete(r.id); } catch { /* best-effort */ }
    }
  }
}

// `rows` is what the query holds now (may be empty: no layout saved yet).
export function profileBoardStore({ ownerType, ownerId, rows, qc }) {
  if (!isProfileOwnerType(ownerType)) throw new Error(`Not a profile type: ${ownerType}`);
  const queryKey = profileBoardQueryKey(ownerType, ownerId);
  const picked = pickProfileBoardRows(rows);
  const writeRaw = async (next, { machine = false } = {}) => {
    const fresh = pickProfileBoardRows(await listProfileBoardRows(ownerType, ownerId));
    if (!fresh.keeper?.id && (machine || next?._seeded)) return null;
    if (fresh.keeper?.id) {
      await localEntities.ProfileBoard.update(fresh.keeper.id, { board: next });
      // Duplicates from two devices' first edits: their pages were folded
      // into `next` through pickProfileBoardRows on read, so the extra rows
      // can go to the trash (reversible, like every delete).
      for (const r of fresh.extras) {
        try { await localEntities.ProfileBoard.delete(r.id); } catch { /* folded again next read */ }
      }
      return { ...fresh.keeper, board: next };
    }
    return localEntities.ProfileBoard.create({ owner_type: ownerType, owner_id: ownerId, board: next });
  };
  return {
    kind: "profile",
    ownerType,
    ownerId,
    id: picked.keeper?.id || null,
    queryKey,
    board: picked.board,
    setCached(written) {
      if (!qc) return;
      qc.setQueryData(queryKey, (cur) => {
        const list = Array.isArray(cur) ? cur : [];
        const keeper = pickProfileBoardRows(list).keeper;
        if (keeper) return list.map((r) => (r.id === keeper.id ? { ...r, board: written } : r));
        return [...list, { id: null, owner_type: ownerType, owner_id: ownerId, board: written }];
      });
    },
    write: (next, opts) => writeRaw(next, opts),
    async update(change, { machine = false } = {}) {
      const fresh = pickProfileBoardRows(await listProfileBoardRows(ownerType, ownerId));
      const current = fresh.board;
      const next = typeof change === "function" ? change(current) : change;
      if (!next || typeof next !== "object") return current;
      const stamped = stampUnlessMachine(current, next, machine);
      await writeRaw(stamped, { machine });
      return stamped;
    },
    invalidate() { if (qc) qc.invalidateQueries({ queryKey }); },
  };
}

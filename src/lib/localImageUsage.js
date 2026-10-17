// Is a stored picture still used anywhere? — the guard every "delete the
// picture behind this thing" path goes through.
//
// The picture store (localImageStorage, IndexedDB `symphony_images`) is
// SHARED: one stored picture can sit behind a library row, an alter's
// image-pool rows ("Pick from library" makes a second row pointing at the
// same picture), avatars, headers, backgrounds, bios, groups, chat, notes…
// and, because the store is per-device rather than per-system, records in
// OTHER systems too. Deleting the picture because one of those went away
// silently breaks every other one. So:
//
//   deleteLocalImageIfUnused(id) only deletes when a full scan finds no
//   reference left, and KEEPS the picture whenever it can't be sure (the
//   database isn't open, another system's data can't be read or decrypted,
//   the systems list isn't loaded). A kept-but-unused picture costs a little
//   space; a deleted-but-used one is lost data.
//
// The native private-file copy (nativeMirror `img/<id>.json`) is removed by
// deleteLocalImage itself, so it follows exactly the same rule.

import { getFullDbDump } from "./localDb";
import { listSystems, getActiveSystemId, getCachedRegistry, getSystemRawBlob, getSystemData } from "./systems";
import { deleteLocalImage } from "./localImageStorage";

// Tombstones only list deleted record ids — never a use of a picture.
const NOT_A_USE = new Set(["DeletionLog"]);

// Every spelling a reference to this picture can take: the current
// /local-image/<encoded id> path (also inside absolute URLs), the legacy
// local-image://<id> form, and the bare id (how some records keep it).
// Bare ids are only matched when long enough not to collide by chance.
function needlesFor(id) {
  const set = new Set([`/local-image/${encodeURIComponent(id)}`, `local-image://${id}`]);
  if (String(id).length >= 8) { set.add(String(id)); set.add(encodeURIComponent(id)); }
  return [...set];
}

const hit = (text, needles) => typeof text === "string" && needles.some((n) => text.includes(n));

function scanDump(db, needles, ignore) {
  for (const [entity, map] of Object.entries(db || {})) {
    if (NOT_A_USE.has(entity)) continue;
    if (!map || typeof map !== "object") {
      if (hit(typeof map === "string" ? map : "", needles)) return true;
      continue;
    }
    for (const [rid, rec] of Object.entries(map)) {
      if (ignore && ignore(entity, rec?.id ?? rid, rec)) continue;
      let text;
      try { text = typeof rec === "string" ? rec : JSON.stringify(rec); } catch { return true; } // unreadable → assume used
      if (hit(text, needles)) return true;
    }
  }
  return false;
}

// Skip the records the user is deleting right now — and their own
// Recent-changes snapshot (a deleted record is archived there, so it would
// otherwise always count as a use of itself). Snapshots of OTHER records
// still count: restoring a deleted alter must bring its avatar back too.
function ignoreDeleted(deletedRecords) {
  const keys = new Set((deletedRecords || []).filter((r) => r?.entity && r?.id).map((r) => `${r.entity}:${r.id}`));
  if (!keys.size) return null;
  return (entity, rid, rec) => keys.has(`${entity}:${rid}`)
    || (entity === "HistoryEvent" && rec?.action === "deleted" && keys.has(`${rec.entity}:${rec.record_id}`));
}

// true when the picture is (or might be) still used. Never throws.
// `deletedRecords` ([{ entity, id }]) are records the caller has just
// deleted on purpose — they and their archive snapshot don't count.
export async function isLocalImageInUse(id, { deletedRecords } = {}) {
  if (!id) return true;
  const needles = needlesFor(id);
  const ignore = ignoreDeleted(deletedRecords);

  // 1. The open system (live database, including the settings mirror).
  try {
    if (scanDump(getFullDbDump(), needles, ignore)) return true;
  } catch { return true; } // database not open — can't tell

  // 2. This device's preferences (themes, backgrounds, widget boards).
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (hit(localStorage.getItem(k), needles)) return true;
    }
  } catch { /* no localStorage — the DB mirror above carries these keys */ }

  // 3. Every other system on this device — they share the picture store.
  try {
    if (!getCachedRegistry()) return true;
    const activeId = getActiveSystemId();
    for (const sys of listSystems()) {
      if (sys.id === activeId) continue;
      const raw = await getSystemRawBlob(sys);
      if (raw == null) continue; // no data yet
      if (hit(raw, needles)) return true;
      if (!raw.includes("__encrypted")) continue; // plain blob, already scanned
      const data = await getSystemData(sys);
      if (!data) return true; // locked / unreadable — can't tell
      if (scanDump(data, needles, null)) return true;
    }
  } catch { return true; }

  return false;
}

// Delete the stored picture (and its native private-file copy) ONLY if
// nothing references it any more. Returns { deleted }. Never throws.
export async function deleteLocalImageIfUnused(id, opts) {
  try {
    if (!id || (await isLocalImageInUse(id, opts))) return { deleted: false };
    await deleteLocalImage(id);
    return { deleted: true };
  } catch {
    return { deleted: false };
  }
}

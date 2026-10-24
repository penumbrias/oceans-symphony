// The trash: recovery window, time lock and purge (v0.278.0).
//
// Deleting something puts it in the trash (the entity proxy in localDb.js
// stamps `trashed_at` and hides it). This module decides how long it stays
// there and who can remove it early:
//
//  • Recovery window — `SystemSettings.trash.days` (default 30; 0 means the
//    trash never empties by itself). Once a record has been in the trash
//    that long, the purge removes it for good and writes the deletion
//    tombstone.
//  • Time lock — off until the person switches it on. While it's on,
//    protected things (alters with history, groups, journals, chat
//    channels, bulletins, maps) can't be deleted early, and the lock
//    protects itself: turning it off or shortening the window only takes
//    effect once the current window has passed. Turning it on or
//    lengthening the window applies at once.
//
// The setting lives on SystemSettings, so it syncs and rides backups like
// the trash itself.

import { localEntities } from "@/api/base44Client";
import { listTrashedRecords, restoreTrashedRecords, purgeTrashedRecords, getFullDbDump, TRASHED_AT, TRASH_BATCH } from "@/lib/localDb";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

import { resolveTrashSettings, changeTrashSettings, DAY_MS } from "@/lib/trashSettings";
export { DEFAULT_TRASH_DAYS, TRASH_DAY_CHOICES, resolveTrashSettings, changeTrashSettings } from "@/lib/trashSettings";

async function readSettingsRow() {
  const rows = await localEntities.SystemSettings.list();
  return pickPrimarySystemSettings(rows) || null;
}

export async function getTrashSettings() {
  const row = await readSettingsRow();
  return resolveTrashSettings(row?.trash);
}

export async function saveTrashSettings(want) {
  const row = await readSettingsRow();
  const value = changeTrashSettings(row?.trash, want);
  if (row) await localEntities.SystemSettings.update(row.id, { trash: value });
  else await localEntities.SystemSettings.create({ trash: value });
  return resolveTrashSettings(value);
}

// ── Tiers ──────────────────────────────────────────────────────────
const PROTECTED = new Set([
  "Group", "GroupNote", "JournalEntry", "TherapyNote", "SystemChatChannel", "SystemChatCategory",
  "Bulletin", "InnerWorldMap", "InnerWorldLayer",
]);
const ALTER_REF_FIELDS = ["alter_id", "primary_alter_id", "author_alter_id", "mentioned_alter_id"];
const ALTER_REF_ARRAYS = ["author_alter_ids", "fronting_alter_ids", "alter_ids", "member_alter_ids"];

// Does anything still in the database point at this alter (history,
// notes, messages, check-ins)? An alter with none is Standard.
function alterHasHistory(db, alterId) {
  for (const [entity, col] of Object.entries(db || {})) {
    if (entity === "Alter" || entity === "HistoryEvent" || entity === "DeletionLog" || entity.startsWith("__")) continue;
    if (!col || typeof col !== "object") continue;
    for (const r of Object.values(col)) {
      if (!r || typeof r !== "object") continue;
      if (ALTER_REF_FIELDS.some((f) => r[f] === alterId)) return true;
      if (ALTER_REF_ARRAYS.some((f) => Array.isArray(r[f]) && r[f].includes(alterId))) return true;
    }
  }
  return false;
}

export function trashTier(entity, record, db = null) {
  if (PROTECTED.has(entity)) return "protected";
  if (entity === "Alter") return alterHasHistory(db || getFullDbDump(), record?.id) ? "protected" : "standard";
  return "standard";
}

export const canDeleteNow = (tier, settings) => tier !== "protected" || !settings?.lock;

// When a trashed record is removed for good (ISO string), or null when
// the trash keeps it until emptied by hand.
export function purgeDate(record, settings) {
  const at = Date.parse(record?.[TRASHED_AT]);
  if (!Number.isFinite(at) || !settings?.days) return null;
  return new Date(at + settings.days * DAY_MS).toISOString();
}

// ── The Trash page's data ──────────────────────────────────────────
// Batches, newest first: { batch, trashedAt, items: [{ entity, record, tier }], purgeAt }.
export async function listTrash() {
  const settings = await getTrashSettings();
  const db = getFullDbDump();
  const byBatch = new Map();
  for (const { entity, record } of listTrashedRecords()) {
    const key = record[TRASH_BATCH] || `${entity}:${record.id}`;
    if (!byBatch.has(key)) byBatch.set(key, { batch: key, trashedAt: record[TRASHED_AT], items: [] });
    byBatch.get(key).items.push({ entity, record, tier: trashTier(entity, record, db) });
  }
  const batches = [...byBatch.values()].map((b) => ({
    ...b,
    purgeAt: purgeDate(b.items[0].record, settings),
    canDeleteNow: b.items.every((i) => canDeleteNow(i.tier, settings)),
  }));
  batches.sort((a, b) => String(b.trashedAt).localeCompare(String(a.trashedAt)));
  return { settings, batches };
}

export async function restoreFromTrash(items) {
  const n = await restoreTrashedRecords(items.map(({ entity, record, id }) => ({ entity, id: id || record?.id })));
  await relinkRestoredGroups(items);
  return n;
}

// Deleting a group scrubs its chip off every member's `groups` (and the
// boot-time prune does the same for a group sitting in the trash), but the
// group keeps its own member list. Once it's back, write that membership to
// both sides again so every screen shows the members. Best-effort.
async function relinkRestoredGroups(items) {
  const groupIds = items.filter((i) => i.entity === "Group").map((i) => i.id || i.record?.id).filter(Boolean);
  if (!groupIds.length) return;
  try {
    const [{ setGroupMembers, currentMemberIds }, groups, alters] = await Promise.all([
      import("@/lib/groupMembership"),
      localEntities.Group.list(),
      localEntities.Alter.list(),
    ]);
    for (const id of groupIds) {
      const group = groups.find((g) => g.id === id);
      if (!group) continue;
      await setGroupMembers({ group, alterIds: currentMemberIds(group, alters) });
    }
  } catch (e) {
    try { console.warn("[trash] group members not relinked:", e); } catch { /* ignore */ }
  }
}

// Delete for good, now. Refuses anything the lock protects.
export async function deleteFromTrashNow(items) {
  const settings = await getTrashSettings();
  const db = getFullDbDump();
  const allowed = [];
  let refused = 0;
  for (const it of items) {
    const id = it.id || it.record?.id;
    const record = db[it.entity]?.[id];
    if (!record?.[TRASHED_AT]) continue;
    if (!canDeleteNow(trashTier(it.entity, record, db), settings)) { refused += 1; continue; }
    allowed.push({ entity: it.entity, id });
  }
  const removed = await purgeTrashedRecords(allowed);
  await cleanUpFilesFor(removed);
  return { removed: removed.length, refused };
}

// ── Purge ──────────────────────────────────────────────────────────
// Removes everything whose window has passed. Runs once per system per
// app session, a little after it opens (see AppLayout), and never in
// preview mode. Never throws.
const _purgedSystems = new Set();
export async function runTrashPurge({ now = Date.now() } = {}) {
  try {
    const { isPreviewActive } = await import("@/lib/previewMode");
    if (isPreviewActive()) return { removed: 0 };
    const { getActiveSystemId } = await import("@/lib/systems");
    const key = getActiveSystemId() || "default";
    if (_purgedSystems.has(key)) return { removed: 0 };
    _purgedSystems.add(key);
    const settings = await getTrashSettings();
    if (!settings.days) return { removed: 0 };
    const due = listTrashedRecords()
      .filter(({ record }) => {
        const at = purgeDate(record, settings);
        return at && Date.parse(at) <= now;
      })
      .map(({ entity, record }) => ({ entity, id: record.id }));
    if (!due.length) return { removed: 0 };
    const removed = await purgeTrashedRecords(due);
    await cleanUpFilesFor(removed);
    return { removed: removed.length };
  } catch (e) {
    try { console.warn("[trash] purge skipped:", e); } catch { /* ignore */ }
    return { removed: 0 };
  }
}

// Files kept for a trashed record (pictures, font files) are only
// removed once the record itself is gone, and pictures only when nothing
// else uses them (the shared usage scan). Best-effort.
const LOCAL_IMAGE_RE = /(?:\/local-image\/|local-image:\/\/)([^"'\s?#)]+)/g;
async function cleanUpFilesFor(removed) {
  if (!removed?.length) return;
  try {
    const deletedRecords = removed.map(({ entity, record }) => ({ entity, id: record?.id }));
    const imageIds = new Set();
    for (const { entity, record } of removed) {
      if (entity === "CustomFont" && record?.id) {
        try {
          const { deleteLocalFont } = await import("@/lib/localFontStorage");
          await deleteLocalFont(record.id);
        } catch { /* keep going */ }
      }
      let text = "";
      try { text = JSON.stringify(record); } catch { continue; }
      for (const m of text.matchAll(LOCAL_IMAGE_RE)) {
        try { imageIds.add(decodeURIComponent(m[1])); } catch { imageIds.add(m[1]); }
      }
    }
    if (!imageIds.size) return;
    const { deleteLocalImageIfUnused } = await import("@/lib/localImageUsage");
    for (const id of imageIds) await deleteLocalImageIfUnused(id, { deletedRecords });
  } catch { /* a kept file costs a little space; never fail the purge */ }
}

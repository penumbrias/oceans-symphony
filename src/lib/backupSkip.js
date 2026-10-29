// "Skip in backups" — a per-file switch in the Assets library (from
// ShineSpark330's fork).
//
// By default EVERY stored file is backed up. A person can mark individual
// files (or every file in a folder, which just marks each one) to be left
// out of backups — handy for a few huge videos they don't want in every
// backup. Marked files are left out of manual exports, the .zip exports AND
// automatic backups, so "skipped" means the same thing everywhere.
//
// DATA SAFETY: this only ever decides what is COPIED into a backup. It never
// deletes, moves or changes a file, and new uploads are always included. A
// skipped file exists only on this device (and its private-file copy), so
// the library says so wherever the switch is shown. Device sync is not
// affected — it still carries every file.
//
// Stored on SystemSettings.backup_skip = { keys: ["i:<storedFileId>"] }.
// It travels with the settings, so a restore keeps the same choices.

import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

export const skipKeyForImage = (id) => `i:${id}`;

async function settingsRow() {
  const rows = await base44.entities.SystemSettings.list();
  return pickPrimarySystemSettings(rows) || null;
}

function keysFrom(row) {
  const k = row?.backup_skip?.keys;
  return Array.isArray(k) ? k.filter((x) => typeof x === "string") : [];
}

export function skipSetFromSettings(row) {
  return new Set(keysFrom(row));
}

// The set of marked keys. Never throws — if settings can't be read, nothing
// is skipped (the safe direction: back up more, not less).
export async function loadBackupSkip() {
  try { return new Set(keysFrom(await settingsRow())); } catch { return new Set(); }
}

// Mark (skip = true) or un-mark (skip = false) a list of keys. Re-reads the
// settings row first so a stale screen can't overwrite a newer list.
export async function setBackupSkipKeys(keys, skip) {
  const row = await settingsRow();
  if (!row?.id) throw new Error("Settings aren't ready yet — try again in a moment.");
  const next = new Set(keysFrom(row));
  for (const k of keys) { if (skip) next.add(k); else next.delete(k); }
  await base44.entities.SystemSettings.update(row.id, { backup_skip: { keys: [...next] } });
  return next;
}

export const isSkipped = (skipSet, id) => !!skipSet && skipSet.has(skipKeyForImage(id));

// { [id]: dataUrl } without the marked files.
export function filterImagesBySkip(imagesMap, skipSet) {
  if (!skipSet || !skipSet.size) return imagesMap;
  const out = {};
  for (const [id, v] of Object.entries(imagesMap || {})) {
    if (!skipSet.has(skipKeyForImage(id))) out[id] = v;
  }
  return out;
}

// ── File types (Export → Advanced) ──────────────────────────────────

export const FILE_KINDS = ["image", "audio", "video", "file"];
export const FILE_KIND_LABELS = { image: "Pictures", audio: "Audio", video: "Videos", file: "Attachments & other files" };

// "image" | "audio" | "video" | "file" for one exported entry (a data URL).
export function kindOfStoredEntry(id, value) {
  const m = /^data:([^;,]*)/.exec(typeof value === "string" ? value : "");
  const mime = (m ? m[1] : "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (String(id).startsWith("song-")) return "audio";
  // Old pictures were saved with no type at all — those are pictures.
  if (!mime) return "image";
  return "file";
}

// { [id]: dataUrl } with only the chosen types. All four (or none given) →
// unchanged.
export function filterImagesByKinds(imagesMap, kinds) {
  if (!kinds || FILE_KINDS.every((k) => kinds.has(k))) return imagesMap;
  const out = {};
  for (const [id, v] of Object.entries(imagesMap || {})) {
    if (kinds.has(kindOfStoredEntry(id, v))) out[id] = v;
  }
  return out;
}

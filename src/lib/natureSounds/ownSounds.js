// Your own nature sounds (v0.341.0): recordings a person adds from their
// device, or picks from their Assets, to play alongside the built-in ones.
//
// A sound is an ImageAsset row (kind "audio") flagged `nature_sound: true`
// — the same record the Assets library shows, so it is renamed, foldered,
// backed up and synced exactly like every other stored file. Files added
// here are stored with ids "nature-…" and filed in the "Nature sounds"
// folder; that prefix is how the auto-backup "Your nature sounds" choice
// finds them (lib/autoBackup.js).
//
// DATA SAFETY: removing a sound from Nature sounds only clears the flag.
// The file and its record stay in Assets until the person deletes them
// there (which goes through the trash like everything else).
//
// Sound ids are "own-<ImageAsset id>" so they can never collide with the
// built-in catalogue's Freesound ids.

import { base44 } from "@/api/base44Client";
import { saveLocalImage, createLocalImageUrl, getLocalImageId, isLocalImageUrl } from "@/lib/localImageStorage";
import { sniffMediaMime } from "@/lib/assetFiles";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { compressAudioToMp3, probeAudioFile, MAX_STORED_AUDIO_BYTES, qualityById } from "./audioCompress";
import { OWN_PREFIX, OWN_FILE_PREFIX, isOwnSoundId, isOwnSoundFileId } from "./ownSoundIds";

export { OWN_PREFIX, OWN_FILE_PREFIX, isOwnSoundId, isOwnSoundFileId };
export const NATURE_SOUNDS_FOLDER = "Nature sounds";
export const YOURS_TAG = "yours";


const listeners = new Set();
let cache = []; // last list read, so the player and catalogue can look sounds up synchronously
let loaded = false;
const emit = () => { for (const fn of listeners) { try { fn(cache); } catch { /* listener */ } } };
export const subscribeMySounds = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getMySounds = () => cache;
export const mySoundsLoaded = () => loaded;
export const mySoundById = (id) => cache.find((s) => s.id === id) || null;

export function soundFromAsset(a) {
  return {
    id: `${OWN_PREFIX}${a.id}`,
    assetId: a.id,
    title: a.name || a.original_name || "Untitled sound",
    place: "",
    by: "",
    tags: [YOURS_TAG],
    seconds: Number(a.duration_seconds) || 0,
    url: a.image_url,
    own: true,
  };
}

const isAudioAsset = (a) => a && a.image_url && (a.kind === "audio" || /^audio\//.test(a.mime || ""));

// Every sound the person has added, newest first.
export async function listMySounds() {
  let rows = [];
  try { rows = await base44.entities.ImageAsset.filter({ nature_sound: true }); } catch { rows = []; }
  cache = (rows || [])
    .filter(isAudioAsset)
    .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))
    .map(soundFromAsset);
  loaded = true;
  emit();
  return cache;
}

// Something an <audio> element can play.
export async function mySoundSrc(sound) {
  const s = typeof sound === "string" ? mySoundById(sound) : sound;
  if (!s?.url) return null;
  return resolveImageUrl(s.url);
}

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;

async function audioMimeOf(file) {
  if (/^audio\//.test(file.type || "")) return file.type;
  let head = null;
  try { head = new Uint8Array(await file.slice(0, 16).arrayBuffer()); } catch { head = null; }
  const sniffed = sniffMediaMime(head);
  if (sniffed && sniffed.startsWith("audio/")) return sniffed;
  // A video container holding only sound (an .m4a picked as "video/mp4").
  if (sniffed && AUDIO_EXT.test(file.name || "")) return sniffed.replace(/^video\//, "audio/");
  return null;
}

// Look at a file before adding it: its type, size and length.
export async function inspectAudioFile(file) {
  const mime = await audioMimeOf(file);
  if (!mime) return { ok: false, reason: "That isn't an audio file." };
  const { seconds, playable } = await probeAudioFile(file);
  return { ok: true, mime, seconds, playable, size: file.size, name: file.name || "Sound" };
}

const titleFromName = (name) => String(name || "").replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 80) || "Sound";

// Add a file from the device. quality: "original" | "high" | "balanced" |
// "small" (audioCompress.AUDIO_QUALITIES). Returns the new sound.
export async function addMySoundFromFile(file, { quality = "original", title, onProgress, isCancelled } = {}) {
  const info = await inspectAudioFile(file);
  if (!info.ok) throw new Error(info.reason);
  const q = qualityById(quality);
  let blob = file;
  let mime = info.mime;
  if (q?.kbps) {
    blob = await compressAudioToMp3(file, quality, { onProgress, isCancelled });
    mime = "audio/mpeg";
  }
  if (blob.size > MAX_STORED_AUDIO_BYTES) {
    throw new Error(q?.kbps
      ? "Even compressed, this is over 25 MB. Try a smaller size or a shorter recording."
      : "This file is over 25 MB. Choose a compressed size to make it fit.");
  }
  if (isCancelled?.()) { const e = new Error("Cancelled"); e.name = "AbortError"; throw e; }
  const fileId = `${OWN_FILE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await saveLocalImage(fileId, blob, mime);
  const now = new Date().toISOString();
  const row = await base44.entities.ImageAsset.create({
    name: (title || "").trim() || titleFromName(info.name),
    image_url: createLocalImageUrl(fileId),
    original_name: info.name,
    folder: NATURE_SOUNDS_FOLDER,
    kind: "audio",
    mime,
    size: blob.size,
    duration_seconds: info.seconds ? Math.round(info.seconds) : null,
    nature_sound: true,
    ...(q?.kbps ? { compressed_kbps: q.kbps } : {}),
    created_date: now,
  });
  await listMySounds();
  return soundFromAsset(row);
}

// Add audio that's already in Assets. Only flags the record; the file and
// its backup choice are left exactly as they were.
export async function addMySoundsFromAssets(assets) {
  const added = [];
  for (const a of assets || []) {
    if (!isAudioAsset(a)) continue;
    const patch = { nature_sound: true };
    if (!a.kind) patch.kind = "audio"; // older song records carry no kind
    if (!a.duration_seconds) {
      try {
        const src = await resolveImageUrl(a.image_url);
        if (src) {
          const seconds = await new Promise((resolve) => {
            const el = new Audio();
            const done = (v) => { resolve(v); el.removeAttribute("src"); };
            el.preload = "metadata";
            el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : 0);
            el.onerror = () => done(0);
            setTimeout(() => done(0), 8000);
            el.src = src;
          });
          if (seconds) patch.duration_seconds = Math.round(seconds);
        }
      } catch { /* length stays unknown */ }
    }
    await base44.entities.ImageAsset.update(a.id, patch);
    added.push(a.id);
  }
  await listMySounds();
  return added;
}

// Add what the Assets picker handed back (its url + item). Uses the
// file's existing record when it has one; a stored file with no record
// yet (audio attached in chat, say) gets one so it can carry the flag.
export async function addMySoundFromLibrary(url, item = {}) {
  if (!url) return null;
  const lid = isLocalImageUrl(url) ? getLocalImageId(url) : null;
  let rows = [];
  try { rows = await base44.entities.ImageAsset.list(); } catch { rows = []; }
  const found = (rows || []).find((a) => a?.image_url && (a.image_url === url || (lid && getLocalImageId(a.image_url) === lid)));
  if (found) {
    await addMySoundsFromAssets([{ ...found, kind: found.kind || "audio" }]);
    return mySoundById(`${OWN_PREFIX}${found.id}`);
  }
  const row = await base44.entities.ImageAsset.create({
    name: item.name && item.name !== lid ? item.name : "Sound",
    image_url: lid ? createLocalImageUrl(lid) : url,
    kind: "audio",
    nature_sound: true,
    created_date: new Date().toISOString(),
  });
  await addMySoundsFromAssets([row]); // fills in the length
  return mySoundById(`${OWN_PREFIX}${row.id}`);
}

export async function renameMySound(sound, name) {
  const n = String(name || "").trim();
  if (!sound?.assetId || !n) return;
  await base44.entities.ImageAsset.update(sound.assetId, { name: n.slice(0, 120) });
  await listMySounds();
}

// Takes the sound off the Nature sounds list. The file stays in Assets.
export async function removeMySound(sound) {
  if (!sound?.assetId) return;
  await base44.entities.ImageAsset.update(sound.assetId, { nature_sound: false });
  await listMySounds();
}

// The stored-file id behind a sound (null for a link).
export const storedFileIdOf = (sound) => (sound?.url && isLocalImageUrl(sound.url) ? getLocalImageId(sound.url) : null);

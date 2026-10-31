// Keeping nature sounds on the device (installed phone apps only). A saved
// sound is a copy of a hosted file in the app's own files, so it plays with
// no connection; it can always be fetched again, so removing one loses
// nothing the person made. The web and desktop builds stream instead: the
// host doesn't allow a browser page to save its files.

import { isNative } from "@/lib/platform";
import { natureSoundUrl } from "./catalog";

const DIR = "nature-sounds";
const fileFor = (id) => `${DIR}/ns-${id}.mp3`;

export const canSaveNatureSounds = () => isNative();

const listeners = new Set();
let saved = null; // Set of ids, null until first read
let progress = {}; // id -> 0..1 while saving
const emit = () => { for (const fn of listeners) { try { fn({ saved, progress }); } catch { /* listener */ } } };
export const subscribeNatureOffline = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getNatureOffline = () => ({ saved, progress });

async function fs() {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  return { Filesystem, Directory };
}

export async function refreshSavedSounds() {
  if (!canSaveNatureSounds()) { saved = new Set(); emit(); return saved; }
  try {
    const { Filesystem, Directory } = await fs();
    const res = await Filesystem.readdir({ path: DIR, directory: Directory.Data });
    saved = new Set(res.files
      .map((f) => (typeof f === "string" ? f : f.name))
      .map((n) => /^ns-(\d+)\.mp3$/.exec(n)?.[1])
      .filter(Boolean));
  } catch {
    saved = new Set(); // no folder yet
  }
  emit();
  return saved;
}

export async function saveNatureSound(id) {
  if (!canSaveNatureSounds() || progress[id] != null) return;
  const { Filesystem, Directory } = await fs();
  progress = { ...progress, [id]: 0 };
  emit();
  let handle = null;
  try {
    handle = await Filesystem.addListener("progress", (p) => {
      if (p?.url !== natureSoundUrl(id) || !p.contentLength) return;
      progress = { ...progress, [id]: Math.min(1, p.bytes / p.contentLength) };
      emit();
    });
    // Download beside the final name, then rename: a cut-off download
    // never looks like a saved sound.
    await Filesystem.downloadFile({
      url: natureSoundUrl(id), path: `${fileFor(id)}.part`, directory: Directory.Data,
      recursive: true, progress: true,
    });
    await Filesystem.rename({ from: `${fileFor(id)}.part`, to: fileFor(id), directory: Directory.Data });
    saved = new Set([...(saved || []), id]);
  } catch (e) {
    try { await Filesystem.deleteFile({ path: `${fileFor(id)}.part`, directory: Directory.Data }); } catch { /* none */ }
    throw new Error(e?.message ? `Couldn't save this sound: ${e.message}` : "Couldn't save this sound.");
  } finally {
    try { await handle?.remove(); } catch { /* gone */ }
    const { [id]: _done, ...rest } = progress;
    progress = rest;
    emit();
  }
}

export async function removeSavedNatureSound(id) {
  if (!canSaveNatureSounds()) return;
  const { Filesystem, Directory } = await fs();
  try { await Filesystem.deleteFile({ path: fileFor(id), directory: Directory.Data }); } catch { /* already gone */ }
  saved = new Set([...(saved || [])].filter((x) => x !== id));
  emit();
}

// Where the player should load a sound from: the saved copy when there is
// one, else the hosted file.
export async function natureSoundSrc(id) {
  if (canSaveNatureSounds() && saved?.has(id)) {
    try {
      const { Capacitor } = await import("@capacitor/core");
      const { Filesystem, Directory } = await fs();
      const { uri } = await Filesystem.getUri({ path: fileFor(id), directory: Directory.Data });
      return Capacitor.convertFileSrc(uri);
    } catch { /* fall back to streaming */ }
  }
  return natureSoundUrl(id);
}

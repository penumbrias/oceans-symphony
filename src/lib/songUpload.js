// Saving an audio file as a song: into the local file store (so it rides
// backups) and into the Assets library's "Songs Audio" folder (so it can be
// reused anywhere without uploading again). Shared by the song picker and
// the sound manager's "Add a song".

import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";

export const SONG_MAX_BYTES = 25 * 1024 * 1024;

// Returns { ref, title, asset } or null (after telling the person why).
export async function saveSongFile(file, queryClient = null) {
  if (!file) return null;
  if (!file.type.startsWith("audio/")) { toast.error("That's not an audio file"); return null; }
  if (file.size > SONG_MAX_BYTES) { toast.error("Audio over 25MB is too large — try a compressed MP3"); return null; }
  if (!isLocalMode()) { toast.error("Song upload requires local mode. Paste an audio URL instead."); return null; }
  if (file.size > 10 * 1024 * 1024) toast.warning(`${(file.size / 1024 / 1024).toFixed(1)}MB — large songs grow your storage and backups.`);
  const audioId = `song-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await saveLocalImage(audioId, file, file.type);
  const ref = createLocalImageUrl(audioId);
  let asset = null;
  try {
    asset = await base44.entities.ImageAsset.create({
      name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Audio",
      image_url: ref,
      // Full original file name kept for exports (the title above is shortened).
      original_name: file.name,
      folder: "Songs Audio",
      kind: "audio",
      created_date: new Date().toISOString(),
    });
    queryClient?.invalidateQueries({ queryKey: ["imageAssets"] });
  } catch { /* the song still works even if the library row fails */ }
  return { ref, title: file.name.replace(/\.[^.]+$/, "").slice(0, 80), asset };
}

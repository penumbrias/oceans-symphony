// JS bridge to the custom MediaStoreSavePlugin (Android Java). Saves
// a Blob into the public Downloads folder via MediaStore on Android
// 10+ — survives uninstall, no permission prompt. On Android 9 and
// below the plugin uses legacy storage with the existing
// WRITE_EXTERNAL_STORAGE permission (declared with maxSdkVersion=28
// in AndroidManifest.xml).
//
// This is the preferred silent-write path for auto-backups. The
// @capacitor/filesystem Directory.Documents path fails on most
// scoped-storage Android devices because public Documents requires
// MANAGE_EXTERNAL_STORAGE — a permission Play Store rarely
// approves. MediaStore.Downloads is the canonical fix.
//
// No-ops on web/TWA.

import { isNative } from "@/lib/platform";
import { registerPlugin } from "@capacitor/core";
import { blobToBase64 } from "@/lib/base64";

const MediaStoreSave = registerPlugin("MediaStoreSave");

// Default subfolder under Downloads/. Keeping Symphony backups out
// of the global Downloads root makes them easier to find in a busy
// Files app and clearer about which app produced them.
const DEFAULT_SUBDIR = "Oceans Symphony";

// Base64 encoding goes through src/lib/base64.js: the platform encoder,
// slice by slice, never a per-byte JS loop and never two whole-payload
// copies at once (the v0.86.3 OOM).

// Above this size a file is NOT sent across the bridge as one base64
// string (one giant JSObject — the OOM in Play vitals). It is written to
// the app's cache in 3 MB pieces, and the native side streams that file
// into Downloads (saveFileToDownloads).
const STREAM_ABOVE_BYTES = 8 * 1024 * 1024;
// The one-message path is never tried for anything bigger than this, even
// as a fallback: it would crash the app instead of failing politely.
const ONE_MESSAGE_MAX_BYTES = 48 * 1024 * 1024;

async function saveViaCacheFile({ blob, filename, mimeType, subdir }) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { writeBlobChunked } = await import("@/lib/shareFile");
  const tmpPath = `export-tmp/${Date.now()}-${filename}`;
  const uri = await writeBlobChunked(Filesystem, { blob, path: tmpPath, directory: Directory.Cache });
  try {
    return await MediaStoreSave.saveFileToDownloads({ path: uri, filename, mimeType, subdir });
  } finally {
    try { await Filesystem.deleteFile({ path: tmpPath, directory: Directory.Cache }); } catch { /* the OS clears the cache anyway */ }
  }
}

// Returns { result, uri?, location?, error? }
//   result:   "filesystem" on success, "failed" on error
//   location: "Downloads/<subdir>" so the caller can show the user
//             where the file actually went.
export async function saveBlobToPublicDownloads({ blob, filename, mimeType, subdir }) {
  if (!isNative()) {
    return { result: "failed", error: "native_only" };
  }
  if (!(blob instanceof Blob)) {
    return { result: "failed", error: "not_a_blob" };
  }
  const usedSubdir = typeof subdir === "string" ? subdir : DEFAULT_SUBDIR;
  const type = mimeType || blob.type || "application/octet-stream";
  const location = usedSubdir ? `Downloads/${usedSubdir}` : "Downloads";
  if (blob.size > STREAM_ABOVE_BYTES) {
    try {
      const res = await saveViaCacheFile({ blob, filename, mimeType: type, subdir: usedSubdir });
      console.log("[nativeMediaStoreSave] streamed:", res?.uri);
      return { result: "filesystem", uri: res?.uri, location };
    } catch (e) {
      const msg = e?.message || e?.errorMessage || "save_failed";
      console.warn("[nativeMediaStoreSave] streamed save failed:", msg);
      if (blob.size > ONE_MESSAGE_MAX_BYTES) return { result: "failed", error: msg };
      // Small enough to risk the one-message path below.
    }
  }
  try {
    const base64 = await blobToBase64(blob);
    const res = await MediaStoreSave.saveToDownloads({
      filename,
      data: base64,
      mimeType: type,
      subdir: usedSubdir,
    });
    console.log("[nativeMediaStoreSave] saved:", res?.uri);
    return { result: "filesystem", uri: res?.uri, location };
  } catch (e) {
    const msg = e?.message || e?.errorMessage || "save_failed";
    console.warn("[nativeMediaStoreSave] failed:", msg);
    return { result: "failed", error: msg };
  }
}

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

const MediaStoreSave = registerPlugin("MediaStoreSave");

// Default subfolder under Downloads/. Keeping Symphony backups out
// of the global Downloads root makes them easier to find in a busy
// Files app and clearer about which app produced them.
const DEFAULT_SUBDIR = "Oceans Symphony";

// Convert a Blob to a base64 string in a way that keeps peak JS heap low.
// The old FileReader.readAsDataURL path held TWO copies of the data URL
// simultaneously — reader.result (~1.37× blob) plus the .slice(...) copy —
// which OOM'd the WebView on large backups (many alter avatars stored as
// data URIs inflate __local_images into tens of MB) and killed the native
// bridge before the JS try/catch could see it. Reproduced by testers who
// suddenly could not back up at all past mid-July 2026 as their local
// image store grew. Here we read as ArrayBuffer once, then base64-encode
// in fixed slices, pushing to a chunk array (join at the end) so the
// biggest transient buffer is one chunk's worth, not the whole payload.
async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // 0xC000 bytes → 48KB base64 chunk. Chosen so String.fromCharCode.apply
  // stays under the argument-count limit on every JS engine we ship on.
  const CHUNK_BYTES = 0xC000;
  const parts = [];
  for (let i = 0; i < bytes.length; i += CHUNK_BYTES) {
    // subarray is a view — no copy of the underlying buffer.
    const slice = bytes.subarray(i, Math.min(i + CHUNK_BYTES, bytes.length));
    // Build a small binary string (chunk-sized) then base64-encode it.
    // Small enough to be safe; big enough that we're not doing millions
    // of btoa() calls for a multi-MB backup.
    let binary = "";
    // Loop instead of apply(null, …) so a stray huge chunk can't blow
    // the argument stack. String concat here is bounded to CHUNK_BYTES
    // characters so the quadratic worst case is negligible.
    for (let j = 0; j < slice.length; j++) binary += String.fromCharCode(slice[j]);
    parts.push(btoa(binary));
  }
  return parts.join("");
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
  try {
    const base64 = await blobToBase64(blob);
    const usedSubdir = typeof subdir === "string" ? subdir : DEFAULT_SUBDIR;
    const res = await MediaStoreSave.saveToDownloads({
      filename,
      data: base64,
      mimeType: mimeType || blob.type || "application/octet-stream",
      subdir: usedSubdir,
    });
    console.log("[nativeMediaStoreSave] saved:", res?.uri);
    return {
      result: "filesystem",
      uri: res?.uri,
      location: usedSubdir ? `Downloads/${usedSubdir}` : "Downloads",
    };
  } catch (e) {
    const msg = e?.message || e?.errorMessage || "save_failed";
    console.warn("[nativeMediaStoreSave] failed:", msg);
    return { result: "failed", error: msg };
  }
}

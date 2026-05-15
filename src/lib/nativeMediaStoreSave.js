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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const comma = String(dataUrl).indexOf(",");
      resolve(comma >= 0 ? String(dataUrl).slice(comma + 1) : "");
    };
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
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

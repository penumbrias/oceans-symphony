// Single entry point for "save this file to the user's device" across
// every build target. Was tribal knowledge spread across autoBackup.js
// and ExportModal.jsx — each had its own copy of "try navigator.share,
// fall back to anchor download." That fallback chain breaks inside a
// Capacitor WebView: navigator.canShare({files}) reports false on most
// versions, and the anchor-click download is a no-op because the
// WebView has no download manager wired up. Result: "Back up now" and
// "Save PDF" silently did nothing on native.
//
// Native path:
//   1. Write the blob to the app's sandbox cache via @capacitor/filesystem.
//      No permission prompt — Cache is always writable.
//   2. Hand the resulting content:// URI to @capacitor/share so the OS
//      pops the share sheet (Files / Drive / Email / etc.).
//   3. User picks where to save it; OS confirms visually.
//
// Web path: existing Web Share API → anchor download chain. The fact
// that this worked on web/TWA all along is why the bug went unnoticed
// until the native build shipped.

import { isNative } from "@/lib/platform";

// Returns { result, uri?, error? }
//   result: "shared" | "downloaded" | "cancelled" | "failed"
async function shareNative(blob, filename, title, dialogTitle) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");

  // Convert the Blob → base64 string for the Filesystem plugin (it
  // can't take a Blob directly; data must be a string + encoding, or
  // a base64-encoded binary).
  const base64 = await blobToBase64(blob);

  let uri;
  try {
    const writeRes = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    uri = writeRes?.uri;
    console.log("[shareFile] wrote to cache:", uri);
  } catch (e) {
    console.warn("[shareFile] cache write failed:", e?.message || e);
    return { result: "failed", error: e?.message || "cache_write_failed" };
  }
  if (!uri) return { result: "failed", error: "no_uri" };

  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title,
      url: uri,
      dialogTitle: dialogTitle || "Save file",
    });
    return { result: "shared", uri };
  } catch (e) {
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("cancel")) return { result: "cancelled", uri };
    console.warn("[shareFile] Share.share failed:", e?.message || e);
    return { result: "failed", uri, error: e?.message || "share_failed" };
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result; // "data:<mime>;base64,<payload>"
      const comma = String(dataUrl).indexOf(",");
      resolve(comma >= 0 ? String(dataUrl).slice(comma + 1) : "");
    };
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

async function shareWeb(blob, filename, title) {
  // Web Share API (Android Chrome / iOS Safari PWA / TWA). Lets the
  // user file the blob in any share target.
  if (typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return { result: "shared" };
      }
    } catch (e) {
      if (e?.name === "AbortError") return { result: "cancelled" };
      console.warn("[shareFile] navigator.share failed, falling back:", e?.message);
    }
  }
  // Desktop / older browsers: anchor-click download.
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { result: "downloaded" };
  } catch (e) {
    return { result: "failed", error: e?.message || "download_failed" };
  }
}

// Public API. Returns { result, uri?, error? }.
//
// blob       — the file contents
// filename   — name shown in the share sheet / used for the download
// title      — share-sheet metadata title (Android system text)
// dialogTitle — Android-only share-sheet title bar text
export async function shareFile({ blob, filename, title, dialogTitle }) {
  if (!(blob instanceof Blob)) {
    return { result: "failed", error: "not_a_blob" };
  }
  if (isNative()) {
    return shareNative(blob, filename, title || filename, dialogTitle);
  }
  return shareWeb(blob, filename, title || filename);
}

// Native-only silent write to the public Documents folder. Used by
// auto-backup when the user picked "Documents" as the destination,
// so the backup file lands in a known place without popping a share
// sheet every time.
//
// On Android 11+ with scoped storage, Capacitor's Filesystem plugin
// scopes Directory.Documents under /storage/emulated/0/Android/data/
// <pkg>/Documents/ — still browsable in Files app, just one level
// deeper. We do NOT request MANAGE_EXTERNAL_STORAGE (Play Store
// virtually never approves it) so the truly-global Documents path
// is off the table.
//
// Returns { result, uri?, error? }.
//   result: "filesystem" on success, "failed" on error.
export async function writeFileToDocumentsSilent({ blob, filename }) {
  if (!isNative()) {
    return { result: "failed", error: "silent_write_native_only" };
  }
  if (!(blob instanceof Blob)) {
    return { result: "failed", error: "not_a_blob" };
  }
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const base64 = await blobToBase64(blob);
    const writeRes = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    console.log("[shareFile] silent write OK:", writeRes?.uri);
    return { result: "filesystem", uri: writeRes?.uri };
  } catch (e) {
    console.warn("[shareFile] silent write failed:", e?.message || e);
    return { result: "failed", error: e?.message || "write_failed" };
  }
}

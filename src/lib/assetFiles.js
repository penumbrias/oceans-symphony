// Assets that aren't pictures — songs, videos and other files — and the
// "Save to device" path for anything in the library.
//
// Everything lives in the one local file store (localImageStorage.js —
// named for its history, it holds any Blob). An entry's kind comes from
// its ImageAsset record (`kind`, `mime`) when there is one, else from the
// stored type, else from its first bytes. Nothing here writes to the store.

import { sniffImageMime, isLocalImageUrl, getLocalImageId, getLocalImageBlob } from "@/lib/localImageStorage";
import { isNative, getNativePlatform } from "@/lib/platform";

// The Assets folder that videos, audio and files land in when nobody
// filed them anywhere else. Reserved: users can't make a folder with
// this name, and it's always listed so there's somewhere to upload files.
export const FILES_FOLDER = "Files & videos";

// Downloads/Oceans Symphony/files/<sub> — one subfolder per kind.
export const SAVE_SUBFOLDERS = { image: "Images", video: "Videos", audio: "Audio", file: "Files" };

// Upload cap for files (a song's cap is 25MB; files/videos get a little
// more). Every stored file rides backups, so it can't be unbounded.
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

const ascii = (b, i, n) => String.fromCharCode(...b.slice(i, i + n));

// Media type from a file's first bytes — pictures first (sniffImageMime),
// then the common audio / video containers. null when unknown.
export function sniffMediaMime(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const img = sniffImageMime(bytes);
  if (img) return img;
  const b = bytes;
  if (ascii(b, 0, 3) === "ID3") return "audio/mpeg";
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0) return "audio/mpeg"; // MPEG audio frame
  if (ascii(b, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(b, 0, 4) === "fLaC") return "audio/flac";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE") return "audio/wav";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "AVI ") return "video/x-msvideo";
  if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (/^M4[ABP] $/.test(brand)) return "audio/mp4";
    if (brand === "qt  ") return "video/quicktime";
    return "video/mp4";
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (ascii(b, 0, 5) === "%PDF-") return "application/pdf";
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return "application/zip";
  return null;
}

const GENERIC = /^(|application\/octet-stream|binary\/octet-stream|application\/binary)$/i;

// The best type we know for a stored entry: the record's own `mime`, the
// stored type, then the bytes.
export function resolveMime({ recordMime, storedMime, head } = {}) {
  if (recordMime && !GENERIC.test(recordMime)) return recordMime;
  if (storedMime && !GENERIC.test(storedMime)) return storedMime;
  return sniffMediaMime(head) || storedMime || recordMime || "";
}

export function kindFromMime(mime) {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return m ? "file" : null;
}

// image | video | audio | file for a library item. `meta` is the store's
// { mime, head } for it (listLocalImageMeta), `asset` its ImageAsset row.
export function assetKind({ asset, meta, id } = {}) {
  if (asset?.kind && SAVE_SUBFOLDERS[asset.kind]) return asset.kind;
  const fromMime = kindFromMime(resolveMime({ recordMime: asset?.mime, storedMime: meta?.mime, head: meta?.head }));
  if (fromMime) return fromMime;
  if (typeof id === "string" && id.startsWith("song-")) return "audio";
  // Nothing known (a picture referenced by URL, or unreadable): a picture.
  return "image";
}

const EXT_BY_MIME = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif",
  "image/bmp": "bmp", "image/svg+xml": "svg", "image/heic": "heic",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac",
  "audio/ogg": "ogg", "audio/opus": "opus", "audio/flac": "flac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "weba",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-msvideo": "avi", "video/ogg": "ogv", "video/3gpp": "3gp",
  "application/pdf": "pdf", "application/zip": "zip", "application/json": "json", "text/plain": "txt", "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export function extForMime(mime) {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  if (EXT_BY_MIME[m]) return EXT_BY_MIME[m];
  const sub = m.split("/")[1] || "";
  return /^[a-z0-9]{1,5}$/.test(sub) ? sub : "";
}

// A safe file name that keeps the user's name and carries the real
// extension. `original` (the uploaded file's own name) wins its extension
// when the type gives none.
export function fileNameFor(name, mime, original = "") {
  const clean = (s) => String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  const origExt = (/\.([A-Za-z0-9]{1,6})$/.exec(original || "") || [])[1] || "";
  const ext = extForMime(mime) || origExt.toLowerCase();
  let base = clean(name) || clean(original).replace(/\.[A-Za-z0-9]{1,6}$/, "") || "file";
  if (ext && base.toLowerCase().endsWith(`.${ext}`)) base = base.slice(0, -(ext.length + 1));
  base = base.slice(0, 100);
  return ext ? `${base}.${ext}` : base;
}

// The bytes behind a library item's URL: the local store for
// /local-image/ URLs, a fetch for anything else (data:, http(s), app
// files). null when it isn't on this device.
export async function readAssetBlob(url) {
  if (!url) return null;
  if (isLocalImageUrl(url)) return getLocalImageBlob(getLocalImageId(url));
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

// Save a library item to the device under its own name and type.
//   Android app → Downloads/Oceans Symphony/files/<Images|Videos|Audio|Files>
//   anywhere else → the browser's normal download (iOS: the share sheet).
// Returns { ok, location?, error? }. Never throws.
export async function saveAssetToDevice({ url, name, mime: knownMime, kind: knownKind, originalName }) {
  try {
    const blob = await readAssetBlob(url);
    if (!blob) return { ok: false, error: "not_on_device" };
    let mime = knownMime && !GENERIC.test(knownMime) ? knownMime : blob.type;
    if (!mime || GENERIC.test(mime)) {
      try { mime = sniffMediaMime(new Uint8Array(await blob.slice(0, 16).arrayBuffer())) || mime; } catch { /* keep */ }
    }
    const kind = (knownKind && SAVE_SUBFOLDERS[knownKind]) ? knownKind : (kindFromMime(mime) || "file");
    const filename = fileNameFor(name, mime, originalName);
    const typed = mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;

    if (isNative() && getNativePlatform() === "android") {
      const { saveBlobToPublicDownloads } = await import("@/lib/nativeMediaStoreSave");
      const subdir = `Oceans Symphony/files/${SAVE_SUBFOLDERS[kind]}`;
      const res = await saveBlobToPublicDownloads({ blob: typed, filename, mimeType: mime || "application/octet-stream", subdir });
      if (res?.result === "filesystem") return { ok: true, location: res.location };
    }
    const { shareFile } = await import("@/lib/shareFile");
    const res = await shareFile({ blob: typed, filename, title: filename, dialogTitle: "Save to device", prefer: "download" });
    if (res?.result === "cancelled") return { ok: false, error: "cancelled" };
    return res?.result === "failed" ? { ok: false, error: res.error } : { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "save_failed" };
  }
}

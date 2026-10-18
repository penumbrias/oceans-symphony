// Zip backups — "Files as .zip" (every stored picture, song, video and
// attached file) and "Everything as one .zip" (that plus the data).
//
// Layout of a zip this module writes:
//
//   symphony-files.json      manifest: one row per file → its internal id,
//                            type and path. This is what lets Import put
//                            every file back under the SAME id, so every
//                            record that points at it still resolves.
//   symphony-backup.json     (everything zip only) the standard backup
//                            envelope — or the password-locked envelope
//                            when backup locking is on. Its pictures are
//                            NOT inside it; they are the files below.
//   Pictures/  Audio/  Videos/  Files/
//                            the files themselves, under their own names
//                            ("Sunset.jpg", "Theme song.mp3"), with real
//                            extensions from their real type.
//
// Memory: the zip is written file by file with fflate's streaming Zip and
// stored (not re-compressed — media is already compressed). Output chunks
// are folded into Blobs as they come, so the JS heap holds roughly one file
// at a time, never the whole library. Reading back works the same way: the
// zip's central directory is parsed from the picked File and each entry is
// a Blob slice of it — nothing is unzipped into memory as a whole.
//
// No ZIP64: a single zip can't pass 4 GB. buildBackupZip refuses before
// that instead of writing a broken file.

import { listLocalImageIds, readLocalImageBlob, saveLocalImage, sniffImageMime, getLocalImageId } from "@/lib/localImageStorage";

export const ZIP_MANIFEST_NAME = "symphony-files.json";
export const ZIP_DATA_NAME = "symphony-backup.json";
export const ZIP_MANIFEST_FORMAT = "symphony_files";

const ZIP_MAX_BYTES = 4 * 1024 * 1024 * 1024 - 64 * 1024 * 1024; // leave headroom under 4 GB
const FLUSH_BYTES = 8 * 1024 * 1024;

const EXT_BY_MIME = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/webp": "webp",
  "image/svg+xml": "svg", "image/avif": "avif", "image/apng": "apng", "image/bmp": "bmp", "image/heic": "heic",
  "image/heif": "heif", "image/tiff": "tif", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a",
  "audio/aac": "aac", "audio/ogg": "ogg", "audio/opus": "opus", "audio/wav": "wav", "audio/x-wav": "wav",
  "audio/wave": "wav", "audio/webm": "weba", "audio/flac": "flac", "audio/x-flac": "flac", "audio/amr": "amr",
  "audio/3gpp": "3gp", "audio/midi": "mid", "audio/x-midi": "mid",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/ogg": "ogv", "video/3gpp": "3gp",
  "video/x-matroska": "mkv", "video/x-msvideo": "avi", "video/mpeg": "mpeg",
  "application/pdf": "pdf", "text/plain": "txt", "text/markdown": "md", "text/csv": "csv", "application/json": "json",
  "application/zip": "zip", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "font/ttf": "ttf", "font/otf": "otf", "font/woff": "woff", "font/woff2": "woff2",
};
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]));
// Prefer the canonical type for the extensions with several.
Object.assign(MIME_BY_EXT, { jpg: "image/jpeg", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", flac: "audio/flac", "3gp": "video/3gpp", mid: "audio/midi", ico: "image/x-icon" });

const isGenericMime = (m) => !m || /^(application\/octet-stream|binary\/octet-stream|application\/binary)$/i.test(m);

// Real type from a file's first bytes, for files stored without one.
export function sniffMime(head) {
  if (!head || head.length < 4) return null;
  const img = head.length >= 12 ? sniffImageMime(head) : null;
  if (img) return img;
  const ascii = (i, n) => String.fromCharCode(...head.slice(i, i + n));
  if (ascii(0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (head[1] & 0x06) !== 0)) return "audio/mpeg";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(0, 4) === "RIFF" && head.length >= 12 && ascii(8, 4) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "RIFF" && head.length >= 12 && ascii(8, 4) === "AVI ") return "video/x-msvideo";
  if (head.length >= 12 && ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (/^M4A|^M4B/.test(brand)) return "audio/mp4";
    if (/^qt/.test(brand)) return "video/quicktime";
    if (/^3g/.test(brand)) return "video/3gpp";
    return "video/mp4";
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "video/webm";
  if (ascii(0, 4) === "%PDF") return "application/pdf";
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return "application/zip";
  if (ascii(0, 4) === "wOFF") return "font/woff";
  if (ascii(0, 4) === "wOF2") return "font/woff2";
  if (ascii(0, 4) === "OTTO") return "font/otf";
  return null;
}

export function extForMime(mime) {
  const m = String(mime || "").toLowerCase().split(";")[0].trim();
  if (EXT_BY_MIME[m]) return EXT_BY_MIME[m];
  const sub = m.split("/")[1];
  if (sub && /^[a-z0-9]{1,5}$/.test(sub)) return sub;
  return "bin";
}

export function folderForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/")) return "Pictures";
  if (m.startsWith("audio/")) return "Audio";
  if (m.startsWith("video/")) return "Videos";
  return "Files";
}

const KIND_BY_FOLDER = { Pictures: "image", Audio: "audio", Videos: "video", Files: "file" };

// A name that's safe as a zip path on every OS: no separators, reserved
// characters or control characters; trimmed; bounded.
export function safeFileName(raw, fallback = "file") {
  let s = String(raw || "")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  if (s.length > 80) s = s.slice(0, 80).trim();
  return s || fallback;
}

// id → the name the person gave the file (the asset library's name), from
// every data dump passed in. A name that already carries an extension
// keeps only its stem — the extension always comes from the real type.
export function buildFileNameMap(dumps = []) {
  const names = new Map();
  for (const dump of dumps) {
    const rows = dump?.ImageAsset ? Object.values(dump.ImageAsset) : [];
    for (const r of rows) {
      const id = r?.image_url ? getLocalImageId(String(r.image_url)) : null;
      if (!id || names.has(id) || !r.name) continue;
      const stem = String(r.name).replace(/\.[A-Za-z0-9]{1,5}$/, "");
      // A song's library name is cut short; the file keeps its full original
      // name — unless the person renamed it to something else.
      const original = String(r.original_name || r.file_name || "").replace(/\.[A-Za-z0-9]{1,5}$/, "");
      names.set(id, original && original.length > stem.length && original.startsWith(stem) ? original : stem);
    }
  }
  return names;
}

// ── Writing ─────────────────────────────────────────────────────────

// Collects fflate's output into Blobs as it streams, so finished bytes
// leave the JS heap instead of piling up in one array.
function makeSink() {
  const blobs = [];
  let pending = [];
  let pendingBytes = 0;
  let total = 0;
  let error = null;
  const flush = () => {
    if (pending.length) { blobs.push(new Blob(pending)); pending = []; pendingBytes = 0; }
  };
  return {
    ondata(err, chunk) {
      if (err) { error = err; return; }
      if (!chunk || !chunk.length) return;
      pending.push(chunk);
      pendingBytes += chunk.length;
      total += chunk.length;
      if (pendingBytes >= FLUSH_BYTES) flush();
    },
    get total() { return total; },
    get error() { return error; },
    finish(type) { flush(); return new Blob(blobs, { type }); },
  };
}

// Builds the zip. Options:
//   dataName/dataText — a JSON text to store at the root (the backup data)
//   nameDumps         — data dumps to take file names from (ImageAsset)
//   ids               — which stored files (default: every one)
//   exclude           — ids to leave out (files marked "skip in backups")
//   kinds             — only these types: any of "image" | "audio" |
//                       "video" | "file" (default: all)
//   onProgress({ done, total })
// Returns { blob, files, failed: [id], left, bytes } — `left` counts the
// files left out by `exclude` / `kinds`, never a failure. Throws when the
// store can't be listed, or when the zip would pass the 4 GB format limit.
export async function buildBackupZip({ dataName = null, dataText = null, nameDumps = [], ids = null, exclude = null, kinds = null, onProgress } = {}) {
  const { Zip, ZipPassThrough, ZipDeflate, strToU8 } = await import("fflate");
  let allIds = ids || (await listLocalImageIds()).map(String);
  let left = 0;
  if (exclude && exclude.size) {
    const before = allIds.length;
    allIds = allIds.filter((id) => !exclude.has(String(id)));
    left += before - allIds.length;
  }
  const kindSet = kinds ? new Set(kinds) : null;
  const names = buildFileNameMap(nameDumps);
  const sink = makeSink();
  const zip = new Zip((err, chunk) => sink.ondata(err, chunk));
  const mtime = new Date();
  const usedPaths = new Set();
  const manifestFiles = [];
  const failed = [];

  const addStored = (path, bytes) => {
    const f = new ZipPassThrough(path);
    f.mtime = mtime;
    zip.add(f);
    f.push(bytes, true);
  };
  const addDeflated = (path, bytes) => {
    const f = new ZipDeflate(path, { level: 6 });
    f.mtime = mtime;
    zip.add(f);
    f.push(bytes, true);
  };

  if (dataName && typeof dataText === "string") addDeflated(dataName, strToU8(dataText));

  let done = 0;
  for (const id of allIds) {
    let blob = null;
    try { blob = await readLocalImageBlob(id); } catch { blob = null; }
    if (!blob) { failed.push(id); done++; onProgress?.({ done, total: allIds.length }); continue; }
    if (sink.total + blob.size > ZIP_MAX_BYTES) {
      zip.terminate();
      throw new Error("Your files add up to more than 4 GB — more than one .zip file can hold. Nothing was saved.");
    }
    let mime = (blob.type || "").toLowerCase();
    // Known type and not wanted: skip it before reading its bytes.
    if (kindSet && !isGenericMime(mime) && !kindSet.has(KIND_BY_FOLDER[folderForMime(mime)])) {
      left++; done++;
      onProgress?.({ done, total: allIds.length });
      continue;
    }
    let bytes;
    try { bytes = new Uint8Array(await blob.arrayBuffer()); } catch { failed.push(id); done++; continue; }
    if (isGenericMime(mime)) mime = sniffMime(bytes.subarray(0, 16)) || "application/octet-stream";
    const folder = folderForMime(mime);
    if (kindSet && !kindSet.has(KIND_BY_FOLDER[folder])) {
      bytes = null; left++; done++;
      onProgress?.({ done, total: allIds.length });
      continue;
    }
    const ext = extForMime(mime);
    const stem = safeFileName(names.get(id) || id, "file");
    let path = `${folder}/${stem}.${ext}`;
    for (let n = 2; usedPaths.has(path.toLowerCase()); n++) path = `${folder}/${stem} (${n}).${ext}`;
    usedPaths.add(path.toLowerCase());
    addStored(path, bytes);
    bytes = null;
    if (sink.error) throw sink.error;
    manifestFiles.push({ id, path, type: mime, size: blob.size });
    done++;
    onProgress?.({ done, total: allIds.length });
    // Let the UI breathe and the GC reclaim the last file.
    if (done % 8 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  const manifest = {
    __format: ZIP_MANIFEST_FORMAT,
    __version: 1,
    __exported_at: mtime.toISOString(),
    ...(dataName ? { data: dataName } : {}),
    files: manifestFiles,
  };
  addDeflated(ZIP_MANIFEST_NAME, strToU8(JSON.stringify(manifest, null, 1)));
  zip.end();
  if (sink.error) throw sink.error;
  return { blob: sink.finish("application/zip"), files: manifestFiles.length, failed, left, bytes: sink.total };
}

// ── Reading ─────────────────────────────────────────────────────────

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// Central directory of a zip File/Blob without reading the whole thing.
// Returns [{ name, method, compSize, size, localOffset }] or null when the
// blob isn't a readable zip.
async function readCentralDirectory(blob) {
  const tailLen = Math.min(blob.size, 65535 + 22);
  const tail = new Uint8Array(await blob.slice(blob.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = u16(tail, eocd + 10);
  const cdSize = u32(tail, eocd + 12);
  const cdOffset = u32(tail, eocd + 16);
  if (cdOffset + cdSize > blob.size) return null;
  const cd = new Uint8Array(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const dec = new TextDecoder("utf-8");
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (u32(cd, p) !== 0x02014b50) return null;
    const method = u16(cd, p + 10);
    const compSize = u32(cd, p + 20);
    const size = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    const localOffset = u32(cd, p + 42);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function entryRawBlob(blob, entry) {
  const lh = new Uint8Array(await blob.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer());
  if (u32(lh, 0) !== 0x04034b50) throw new Error(`Damaged zip entry: ${entry.name}`);
  const start = entry.localOffset + 30 + u16(lh, 26) + u16(lh, 28);
  return blob.slice(start, start + entry.compSize);
}

// Opens a zip written by this module. Returns null when it isn't one (an
// OpenPlural / Plural Star zip, say) so the caller can route it elsewhere.
//   { manifest, dataText, files: [{ id, path, type, size }], entryBlob(path) }
export async function openSymphonyZip(blob) {
  let entries;
  try { entries = await readCentralDirectory(blob); } catch { entries = null; }
  if (!entries) return null;
  const byName = new Map(entries.map((e) => [e.name, e]));
  const manEntry = byName.get(ZIP_MANIFEST_NAME);
  if (!manEntry) return null;
  const { inflateSync, strFromU8 } = await import("fflate");
  const readBytes = async (entry) => {
    const raw = new Uint8Array(await (await entryRawBlob(blob, entry)).arrayBuffer());
    if (entry.method === 0) return raw;
    if (entry.method === 8) return inflateSync(raw);
    throw new Error(`Unsupported compression in ${entry.name}`);
  };
  let manifest;
  try { manifest = JSON.parse(strFromU8(await readBytes(manEntry))); } catch { return null; }
  if (!manifest || manifest.__format !== ZIP_MANIFEST_FORMAT || !Array.isArray(manifest.files)) return null;
  let dataText = null;
  const dataEntry = byName.get(manifest.data || ZIP_DATA_NAME);
  if (dataEntry) dataText = strFromU8(await readBytes(dataEntry));
  const files = manifest.files.filter((f) => f && f.id && f.path && byName.has(f.path));
  const missing = manifest.files.length - files.length;
  return {
    manifest,
    dataText,
    files,
    missing,
    // One file as a typed Blob — a slice of the picked file when stored,
    // so nothing large is copied into memory.
    async entryBlob(path, type) {
      const entry = byName.get(path);
      if (!entry) return null;
      const ext = (path.split(".").pop() || "").toLowerCase();
      const mime = type || MIME_BY_EXT[ext] || "application/octet-stream";
      if (entry.method === 0) return new Blob([await entryRawBlob(blob, entry)], { type: mime });
      return new Blob([await readBytes(entry)], { type: mime });
    },
  };
}

// Puts every file of an opened zip back under its own id. One failure
// never stops the rest. { total, restored, failed: [id] }.
export async function restoreZipFiles(opened, onProgress) {
  const result = { total: opened.files.length + (opened.missing || 0), restored: 0, failed: [] };
  let done = 0;
  for (const f of opened.files) {
    try {
      const blob = await opened.entryBlob(f.path, f.type);
      if (!blob) throw new Error("missing");
      await saveLocalImage(String(f.id), blob, f.type);
      result.restored += 1;
    } catch (e) {
      console.warn(`restoreZipFiles: failed for ${f.id}:`, e);
      result.failed.push(String(f.id));
    }
    done++;
    onProgress?.({ done, total: opened.files.length });
  }
  for (let i = 0; i < (opened.missing || 0); i++) result.failed.push("(missing from zip)");
  return result;
}

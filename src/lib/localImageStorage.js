// Local image storage — stores images as Blobs in IndexedDB.
// Referenced via /local-image/[id] (relative HTTP path the SW can intercept).
// Legacy local-image:// URLs are also recognised for backwards compat.
//
// v0.86.5 STORAGE MIGRATION: values used to be base64 data URI strings.
// base64 inflates image bytes by ~33% AND forces large-string manipulation
// during backup/import (the exact pattern that caused the OOM crash fixed
// in v0.86.3). We now store native Blobs — IndexedDB handles them binary,
// they carry their own MIME type, and the backup export path converts them
// back to data URIs at the JSON boundary so the wire format is unchanged.
//
// Back-compat: getLocalImage() returns whatever's in the store (Blob for
// migrated entries, string for legacy). saveLocalImage() accepts either
// (data URI strings are converted to Blob before write). A one-shot
// migrateLegacyStringsToBlobs() walks the store and converts every
// remaining string. Callers don't need to change shape.

const DB_NAME = 'symphony_images';
const STORE_NAME = 'images';

// LocalStorage flag set once the blob migration completes successfully.
// Per-device (not per-system) — the image store itself is device-shared
// via the SW, so migration state is too. Once set, boot skips the probe.
export const BLOB_MIGRATION_KEY = 'symphony_local_images_blob_migration_v1';

let _db = null;

// Convert a data URI string to a Blob. Returns null on malformed input so
// callers can fall through gracefully (never throw during a save).
export function dataUrlToBlob(dataUrl) {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    const comma = dataUrl.indexOf(',');
    if (comma === -1) return null;
    const header = dataUrl.slice(0, comma);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const isBase64 = /;base64/i.test(header);
    const payload = dataUrl.slice(comma + 1);
    if (isBase64) {
      // Chunked base64 decode — same peak-memory-safe pattern used for
      // backup export (v0.86.3). Avoids String.fromCharCode.apply overflow
      // on very large images.
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime });
  } catch {
    return null;
  }
}

// Convert a Blob to a data URI string. Only used at the backup/export
// boundary so the JSON payload keeps its historical shape.
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

// Normalise any incoming image value to a Blob (or return null if nothing
// usable). Accepts: Blob (returned as-is), data URI string (converted),
// ArrayBuffer / Uint8Array (wrapped), or anything else (null).
function toBlob(value, mimeHint) {
  if (!value) return null;
  if (value instanceof Blob) return value;
  if (typeof value === 'string') return dataUrlToBlob(value);
  if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
    return new Blob([value], { type: mimeHint || 'application/octet-stream' });
  }
  return null;
}

async function getIdb() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(new Error('Failed to open IndexedDB'));
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function saveLocalImage(id, imageData, mimeHint) {
  try {
    // Normalise: Blob preferred, everything else converted. If the caller
    // passed a data URI (common — every legacy caller does), we transparently
    // convert to a Blob so the on-disk shape stays canonical.
    const toWrite = toBlob(imageData, mimeHint) || imageData;
    const idb = await getIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(toWrite, id);
      req.onerror = () => reject(new Error('Failed to save image'));
      req.onsuccess = () => resolve();
    });
  } catch (e) {
    console.warn('saveLocalImage: IDB unavailable:', e);
    return Promise.resolve();
  }
}

export async function getLocalImage(id) {
  try {
    const idb = await getIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onerror = () => reject(new Error('Failed to get image'));
      req.onsuccess = () => resolve(req.result || null);
    });
  } catch (e) {
    console.warn('getLocalImage: IDB unavailable:', e);
    return null;
  }
}

export async function deleteLocalImage(id) {
  try {
    const idb = await getIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onerror = () => reject(new Error('Failed to delete image'));
      req.onsuccess = () => resolve();
    });
  } catch (e) {
    console.warn('deleteLocalImage: IDB unavailable:', e);
    return Promise.resolve();
  }
}

// Accepts both /local-image/[id] (current) and local-image://[id] (legacy)
export function isLocalImageUrl(url) {
  return url && (url.startsWith('/local-image/') || url.startsWith('local-image://'));
}

export function getLocalImageId(url) {
  if (!url) return null;
  if (url.startsWith('/local-image/')) return decodeURIComponent(url.slice('/local-image/'.length));
  if (url.startsWith('local-image://')) return url.slice('local-image://'.length);
  return null;
}

// Always produce the SW-interceptable path
export function createLocalImageUrl(id) {
  return `/local-image/${encodeURIComponent(id)}`;
}

// Backup export shape: keyed map of { [id]: dataUrl }. Blobs are converted
// to data URIs at this boundary so the JSON payload stays JSON-serialisable
// (the wire format is unchanged from pre-v0.86.5). Strings pass through.
export async function getAllLocalImages() {
  try {
    const idb = await getIdb();
    const rows = await new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const keyReq = store.getAllKeys();
      keyReq.onerror = () => reject(new Error('Failed to get keys'));
      keyReq.onsuccess = () => {
        const keys = keyReq.result;
        const valReq = store.getAll();
        valReq.onerror = () => reject(new Error('Failed to get values'));
        valReq.onsuccess = () => resolve({ keys, values: valReq.result });
      };
    });
    const out = {};
    for (let i = 0; i < rows.keys.length; i++) {
      const key = rows.keys[i];
      const v = rows.values[i];
      if (v instanceof Blob) {
        try { out[key] = await blobToDataUrl(v); }
        catch { /* skip unreadable */ }
      } else if (typeof v === 'string') {
        out[key] = v;
      }
    }
    return out;
  } catch (e) {
    console.warn('getAllLocalImages: IDB unavailable:', e);
    return {};
  }
}

// Raw-bytes view of the store for the "download images as .zip" export:
// { [id]: { bytes: Uint8Array, mime } }. Streams entry-by-entry (same
// peak-memory rationale as probeBlobMigrationStatus). Legacy data-URI
// strings are decoded to bytes so the zip is uniform.
export async function getAllLocalImageBlobs() {
  try {
    const idb = await getIdb();
    const keys = await new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readonly');
      const req = tx.objectStore(STORE_NAME).getAllKeys();
      req.onerror = reject;
      req.onsuccess = () => resolve(req.result || []);
    });
    const out = {};
    for (const key of keys) {
      const v = await getLocalImage(key);
      if (v instanceof Blob) {
        out[key] = { bytes: new Uint8Array(await v.arrayBuffer()), mime: v.type || 'application/octet-stream' };
      } else if (typeof v === 'string' && v.startsWith('data:')) {
        const blob = dataUrlToBlob(v);
        if (blob) out[key] = { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
      }
    }
    return out;
  } catch (e) {
    console.warn('getAllLocalImageBlobs: IDB unavailable:', e);
    return {};
  }
}

export async function restoreLocalImages(imagesMap) {
  try {
    for (const [id, imageData] of Object.entries(imagesMap || {})) {
      // saveLocalImage auto-converts data URIs → Blobs.
      await saveLocalImage(id, imageData);
    }
  } catch (e) {
    console.warn('restoreLocalImages failed:', e);
  }
}

// Probe the store for legacy string entries. Returns { total, legacy }.
// Cheap — reads keys only for count and only the first N values for the
// legacy detection so we don't force the entire store into memory just to
// decide whether to prompt.
export async function probeBlobMigrationStatus() {
  try {
    const idb = await getIdb();
    return new Promise((resolve) => {
      const tx = idb.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const keyReq = store.getAllKeys();
      keyReq.onerror = () => resolve({ total: 0, legacy: 0 });
      keyReq.onsuccess = () => {
        const keys = keyReq.result || [];
        if (keys.length === 0) { resolve({ total: 0, legacy: 0 }); return; }
        // Walk keys one-by-one via get() so we never hold the whole store
        // in memory during the probe (a 50-avatar system with data URIs
        // could otherwise materialise tens of MB just to answer "any
        // legacy?").
        let idx = 0;
        let legacy = 0;
        const next = () => {
          if (idx >= keys.length) { resolve({ total: keys.length, legacy }); return; }
          const req = store.get(keys[idx]);
          req.onsuccess = () => {
            const v = req.result;
            if (typeof v === 'string' && v.startsWith('data:')) legacy++;
            idx++;
            next();
          };
          req.onerror = () => { idx++; next(); };
        };
        next();
      };
    });
  } catch {
    return { total: 0, legacy: 0 };
  }
}

// One-shot walker: convert every legacy string entry to a Blob in place.
// Streams key-by-key so peak memory is one image, not the whole store.
// onProgress({ processed, total, converted }) after each entry. Sets the
// migration flag on success so subsequent boots skip the probe entirely.
export async function migrateLegacyStringsToBlobs(onProgress) {
  const idb = await getIdb();
  const keys = await new Promise((resolve, reject) => {
    const tx = idb.transaction([STORE_NAME], 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onerror = reject;
    req.onsuccess = () => resolve(req.result || []);
  });

  let processed = 0;
  let converted = 0;

  for (const key of keys) {
    try {
      const current = await getLocalImage(key);
      // Only touch strings — Blobs are already in the target shape,
      // ArrayBuffers are harmless.
      if (typeof current === 'string' && current.startsWith('data:')) {
        const blob = dataUrlToBlob(current);
        if (blob) {
          await saveLocalImage(key, blob);
          converted++;
        }
      }
    } catch (e) {
      console.warn('migrateLegacyStringsToBlobs: entry failed:', key, e);
    }
    processed++;
    onProgress?.({ processed, total: keys.length, converted });
  }

  try { localStorage.setItem(BLOB_MIGRATION_KEY, new Date().toISOString()); }
  catch { /* storage off */ }

  return { processed, converted, total: keys.length };
}

export function isBlobMigrationDone() {
  try { return !!localStorage.getItem(BLOB_MIGRATION_KEY); } catch { return false; }
}

// Download a remote image URL and return it as a data URL, or null if it
// can't be fetched / isn't an image. On the NATIVE build this first tries
// Capacitor's native HTTP, which is NOT subject to WebView CORS — critical
// for CDNs (e.g. Simply Plural's) that don't send permissive CORS headers,
// where a plain browser fetch would be blocked. Used by
// migrateHttpImagesToLocal ("Cache Images for Offline") so it actually works
// against those CDNs on the app.
async function _fetchViaCapacitor(url) {
  try {
    const { isNative } = await import('./platform');
    if (!isNative()) return null;
    const { CapacitorHttp } = await import('@capacitor/core');
    const res = await CapacitorHttp.get({ url, responseType: 'blob' });
    if (!res || typeof res.status !== 'number' || res.status < 200 || res.status >= 300) return null;
    const data = res.data; // base64 string for responseType:"blob"
    if (!data || typeof data !== 'string') return null;
    let contentType = 'image/png';
    const headers = res.headers || {};
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === 'content-type' && headers[k]) { contentType = String(headers[k]).split(';')[0].trim(); break; }
    }
    if (!/^image\//i.test(contentType)) return null;
    return `data:${contentType};base64,${data}`;
  } catch {
    return null;
  }
}

async function _fetchViaBrowser(url) {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType && !/^image\//i.test(contentType)) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function fetchRemoteImageAsDataUrl(url) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
  const viaNative = await _fetchViaCapacitor(url);
  if (viaNative) return viaNative;
  return await _fetchViaBrowser(url);
}

// True for image formats we must never push through the canvas: vector
// (SVG — rasterising it loses scalability) and any format that can carry
// animation and/or an alpha channel that a JPEG re-encode would destroy.
// drawImage only captures a single frame and toDataURL('image/jpeg') has no
// transparency, so re-encoding GIF / WebP / AVIF / APNG silently flattens the
// animation and/or paints transparent pixels black. Keeping them raw is what
// lets the app support these types end-to-end (callers cap size separately).
export function isUncompressibleImage(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  const head = dataUrl.slice(0, 40).toLowerCase();
  return (
    head.startsWith('data:image/svg') ||
    head.startsWith('data:image/gif') ||
    head.startsWith('data:image/webp') ||
    head.startsWith('data:image/avif') ||
    head.startsWith('data:image/apng')
  );
}

// Resize + re-encode a data URL. Returns the original untouched for the
// formats isUncompressibleImage() flags (SVG/GIF/WebP/AVIF/APNG), if it's
// already small enough, or if canvas fails. maxDim caps the longer edge.
// Preserves transparency when the input is a PNG by re-encoding as PNG;
// remaining formats (JPEG/BMP/etc.) get encoded as JPEG (smaller).
export async function compressImageDataUrl(dataUrl, maxDim = 512, quality = 0.82) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return dataUrl;
  if (isUncompressibleImage(dataUrl)) return dataUrl;
  const inputIsPng = dataUrl.startsWith('data:image/png');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longest = Math.max(width, height);
      if (longest > maxDim) {
        const scale = maxDim / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(inputIsPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Read a File/Blob to a data-URL string.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Process an uploaded image File for storage. Animated GIFs are kept RAW
// (canvas re-encoding flattens them to a single still frame — see
// compressImageDataUrl); every other format is resized/compressed to keep
// IndexedDB and backups lean. Returns { dataUrl, isGif, sizeKB } so the
// caller can warn about large GIFs (which we can't shrink without a
// gif-aware encoder). This is the single entry point the avatar / header /
// background upload paths share so GIF handling stays consistent.
export async function processUploadedImage(file, maxDim = 512, quality = 0.82) {
  const raw = await fileToDataUrl(file);
  // Detect GIF robustly. Some file pickers (notably Android's) don't set
  // file.type to "image/gif", so we also check the filename extension and
  // sniff the data-URL: a base64 GIF always begins "R0lGOD" ("GIF8"), and
  // the mime may be present as data:image/gif. Without this, a GIF whose
  // mime came through blank fell into the canvas path and was flattened —
  // which is why GIF backgrounds sometimes wouldn't animate.
  const isGif =
    file.type === 'image/gif' ||
    /\.gif$/i.test(file.name || '') ||
    /^data:image\/gif/i.test(raw) ||
    (typeof raw === 'string' && raw.startsWith('data:') && raw.includes('base64,R0lGOD'));
  const dataUrl = isGif ? raw : await compressImageDataUrl(raw, maxDim, quality);
  return { dataUrl, isGif, sizeKB: Math.round((dataUrl?.length || 0) / 1024) };
}

// Picks the right canvas output mime for a file or canvas based on the
// original file's mime type. PNG in → PNG out (preserves alpha). Anything
// else → JPEG with quality (smaller). Used by avatar / header / banner
// upload paths so users who pick a transparent PNG don't end up with a
// black background after compression.
export function encodeCanvasForMime(canvas, mime, quality = 0.82) {
  if (mime === 'image/png') return canvas.toDataURL('image/png');
  return canvas.toDataURL('image/jpeg', quality);
}

// Re-encode every image already in IDB. Skips SVGs and anything that doesn't
// shrink. onProgress({ processed, total, savedKB }) called after each entry.
export async function recompressAllStoredImages(maxDim = 512, quality = 0.82, onProgress) {
  const idb = await getIdb();
  const keys = await new Promise((resolve, reject) => {
    const tx = idb.transaction([STORE_NAME], 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onerror = reject;
    req.onsuccess = () => resolve(req.result);
  });

  let processed = 0;
  let savedKB = 0;

  for (const key of keys) {
    const current = await getLocalImage(key);
    // Normalise to a data URI for the canvas path (Blobs post-migration,
    // strings for legacy entries). Skip canvas-damaging formats.
    let asDataUrl = null;
    let originalSize = 0;
    if (current instanceof Blob) {
      originalSize = current.size;
      try { asDataUrl = await blobToDataUrl(current); } catch { asDataUrl = null; }
    } else if (typeof current === 'string' && current.startsWith('data:')) {
      asDataUrl = current;
      originalSize = current.length;
    }
    if (asDataUrl && !isUncompressibleImage(asDataUrl)) {
      try {
        const compressed = await compressImageDataUrl(asDataUrl, maxDim, quality);
        // Compare compressed size against the original binary size where
        // possible (Blob path) — data-URI length is a fine proxy otherwise.
        const compressedBlob = dataUrlToBlob(compressed);
        const compressedSize = compressedBlob ? compressedBlob.size : compressed.length;
        if (compressedSize < originalSize) {
          savedKB += Math.round((originalSize - compressedSize) / 1024);
          // Store as Blob — saveLocalImage auto-converts the data URI.
          await saveLocalImage(key, compressed);
        }
      } catch {}
    }
    processed++;
    onProgress?.({ processed, total: keys.length, savedKB });
  }

  return { processed, savedKB };
}

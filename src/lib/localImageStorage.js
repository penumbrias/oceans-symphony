// Local image storage — stores images as data-URL strings in IndexedDB.
// Referenced via /local-image/[id] (relative HTTP path the SW can intercept).
// Legacy local-image:// URLs are also recognised for backwards compat.

const DB_NAME = 'symphony_images';
const STORE_NAME = 'images';

let _db = null;

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

export async function saveLocalImage(id, imageData) {
  try {
    const idb = await getIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(imageData, id);
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

export async function getAllLocalImages() {
  try {
    const idb = await getIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const images = {};
      const keyReq = store.getAllKeys();
      keyReq.onerror = () => reject(new Error('Failed to get keys'));
      keyReq.onsuccess = () => {
        const keys = keyReq.result;
        const valReq = store.getAll();
        valReq.onerror = () => reject(new Error('Failed to get values'));
        valReq.onsuccess = () => {
          keys.forEach((key, i) => { images[key] = valReq.result[i]; });
          resolve(images);
        };
      };
    });
  } catch (e) {
    console.warn('getAllLocalImages: IDB unavailable:', e);
    return {};
  }
}

export async function restoreLocalImages(imagesMap) {
  try {
    for (const [id, imageData] of Object.entries(imagesMap || {})) {
      await saveLocalImage(id, imageData);
    }
  } catch (e) {
    console.warn('restoreLocalImages failed:', e);
  }
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
    // Skip the formats canvas re-encoding would damage — vector SVGs and
    // animation/alpha-capable GIF/WebP/AVIF/APNG (see compressImageDataUrl).
    if (typeof current === 'string' && current.startsWith('data:') && !isUncompressibleImage(current)) {
      try {
        const compressed = await compressImageDataUrl(current, maxDim, quality);
        if (compressed.length < current.length) {
          savedKB += Math.round((current.length - compressed.length) / 1024);
          await saveLocalImage(key, compressed);
        }
      } catch {}
    }
    processed++;
    onProgress?.({ processed, total: keys.length, savedKB });
  }

  return { processed, savedKB };
}

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

// Resize + re-encode a data URL to JPEG. Returns original if it's an SVG,
// already small enough, or if canvas fails. maxDim caps the longer edge.
// Preserves transparency when the input is a PNG by re-encoding as PNG;
// other formats get encoded as JPEG (smaller, no transparency support).
export async function compressImageDataUrl(dataUrl, maxDim = 512, quality = 0.82) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return dataUrl;
  if (dataUrl.startsWith('data:image/svg')) return dataUrl;
  // Animated GIFs MUST bypass the canvas — drawImage only captures the
  // first frame, so re-encoding here would silently flatten the
  // animation to a still. Keep them raw (callers cap size separately).
  if (dataUrl.startsWith('data:image/gif')) return dataUrl;
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
    // Skip SVGs (vector, nothing to gain) and GIFs (canvas re-encode would
    // flatten the animation — see compressImageDataUrl).
    if (typeof current === 'string' && current.startsWith('data:') && !current.startsWith('data:image/svg') && !current.startsWith('data:image/gif')) {
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

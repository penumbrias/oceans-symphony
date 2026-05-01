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
export async function compressImageDataUrl(dataUrl, maxDim = 512, quality = 0.82) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return dataUrl;
  if (dataUrl.startsWith('data:image/svg')) return dataUrl;
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
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
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
    if (typeof current === 'string' && current.startsWith('data:') && !current.startsWith('data:image/svg')) {
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

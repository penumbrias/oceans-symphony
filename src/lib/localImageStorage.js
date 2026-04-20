// Local image storage management — stores compressed images in IndexedDB
// Avatars are referenced via 'local-image://unique-id' in entities
// This keeps backup data clean while preserving all image data

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

// Save image data (from canvas.toDataURL or file blob)
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
    console.warn('Failed to save image to IndexedDB, falling back to data URL:', e);
    // Fallback: return imageData as-is for in-memory use
    return Promise.resolve();
  }
}

// Retrieve image data by ID
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
    console.warn('Failed to retrieve image from IndexedDB:', e);
    return null;
  }
}

// Delete image by ID
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
    console.warn('Failed to delete image from IndexedDB:', e);
    return Promise.resolve();
  }
}

// Check if URL is a local image reference
export function isLocalImageUrl(url) {
  return url && url.startsWith('local-image://');
}

// Extract ID from local image URL
export function getLocalImageId(url) {
  return url?.replace('local-image://', '') || null;
}

// Create a local image URL from ID
export function createLocalImageUrl(id) {
  return `local-image://${id}`;
}

// Get all images from local storage (for backup)
export async function getAllLocalImages() {
  try {
    const idb = await getIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onerror = () => reject(new Error('Failed to get all images'));
      req.onsuccess = () => {
        const images = {};
        const keys = req.result;
        // Need to fetch keys separately
        const keyReq = store.getAllKeys();
        keyReq.onsuccess = () => {
          keyReq.result.forEach((key, idx) => {
            images[key] = req.result[idx];
          });
          resolve(images);
        };
      };
    });
  } catch (e) {
    console.warn('Failed to get all images:', e);
    return {};
  }
}

// Restore images from backup (for import)
export async function restoreLocalImages(imagesMap) {
  try {
    for (const [id, imageData] of Object.entries(imagesMap || {})) {
      await saveLocalImage(id, imageData);
    }
  } catch (e) {
    console.warn('Failed to restore images:', e);
  }
}
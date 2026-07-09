// Local font storage — stores uploaded font files as data-URL strings in
// IndexedDB, mirroring localImageStorage.js's pattern. A CustomFont metadata
// record (localEntities.CustomFont) uses its own id as the key into this
// store — fonts have no legacy URL-scheme baggage to bridge, unlike images.

const DB_NAME = 'symphony_fonts';
const STORE_NAME = 'fonts';

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

export async function saveLocalFont(id, dataUrl) {
  try {
    const idb = await getIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(dataUrl, id);
      req.onerror = () => reject(new Error('Failed to save font'));
      req.onsuccess = () => resolve();
    });
  } catch (e) {
    console.warn('saveLocalFont: IDB unavailable:', e);
    return Promise.resolve();
  }
}

export async function getLocalFont(id) {
  try {
    const idb = await getIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onerror = () => reject(new Error('Failed to get font'));
      req.onsuccess = () => resolve(req.result || null);
    });
  } catch (e) {
    console.warn('getLocalFont: IDB unavailable:', e);
    return null;
  }
}

export async function deleteLocalFont(id) {
  try {
    const idb = await getIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onerror = () => reject(new Error('Failed to delete font'));
      req.onsuccess = () => resolve();
    });
  } catch (e) {
    console.warn('deleteLocalFont: IDB unavailable:', e);
    return Promise.resolve();
  }
}

export async function getAllLocalFonts() {
  try {
    const idb = await getIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const fonts = {};
      const keyReq = store.getAllKeys();
      keyReq.onerror = () => reject(new Error('Failed to get keys'));
      keyReq.onsuccess = () => {
        const keys = keyReq.result;
        const valReq = store.getAll();
        valReq.onerror = () => reject(new Error('Failed to get values'));
        valReq.onsuccess = () => {
          keys.forEach((key, i) => { fonts[key] = valReq.result[i]; });
          resolve(fonts);
        };
      };
    });
  } catch (e) {
    console.warn('getAllLocalFonts: IDB unavailable:', e);
    return {};
  }
}

export async function restoreLocalFonts(fontsMap) {
  try {
    for (const [id, dataUrl] of Object.entries(fontsMap || {})) {
      await saveLocalFont(id, dataUrl);
    }
  } catch (e) {
    console.warn('restoreLocalFonts failed:', e);
  }
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

// Sniffs the font container format from magic bytes rather than trusting
// the filename/extension (Android content:// pickers can hand back files
// with lost/wrong extensions — see the .ampar import lesson). Returns
// "otf" | "woff" | "woff2" | "ttf", or null if unrecognized. Explicitly
// rejects TrueType Collections ("ttcf") since a single @font-face can't
// address one face inside a .ttc without a face index.
export async function sniffFontFormat(fileOrArrayBuffer) {
  const buf = fileOrArrayBuffer instanceof ArrayBuffer
    ? fileOrArrayBuffer
    : await fileOrArrayBuffer.slice(0, 4).arrayBuffer();
  const bytes = new Uint8Array(buf.slice(0, 4));
  const tag = String.fromCharCode(...bytes);
  if (tag === 'OTTO') return 'otf';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'true' || (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00)) return 'ttf';
  return null; // includes "ttcf" (font collections) — unsupported
}

export const MAX_FONT_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

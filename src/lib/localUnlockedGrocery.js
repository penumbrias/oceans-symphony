// Plaintext localStorage-backed store for grocery lists that the
// user has explicitly marked "available when the app is locked".
//
// Why a separate store: the regular IndexedDB blob is encrypted
// behind the user's passphrase when encryption is enabled, so the
// grocery panel can't read it from the UnlockScreen. Lists that the
// user wants accessible while the rest of the app is locked have to
// live somewhere the unlock screen can still see — localStorage.
//
// Trade-off: anyone with brief device access can read these lists.
// That's the user's explicit choice when they flip the "Available
// when locked" toggle. Defaults to encrypted (locked-with-app).
//
// Shape on disk (single JSON blob keyed by STORAGE_KEY):
//   {
//     version: 1,
//     lists: [{ id, name, created_date }],
//     items: [{ id, list_id, name, checked, purchased_at,
//               ran_out_at, created_date }],
//     favorites: [{ id, name, created_date }],
//   }

const STORAGE_KEY = "grocery_unlocked_store_v1";

const newId = () => `ulg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

function emptyStore() {
  return { version: 1, lists: [], items: [], favorites: [] };
}

export function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyStore();
    return {
      version: 1,
      lists: Array.isArray(parsed.lists) ? parsed.lists : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    };
  } catch {
    return emptyStore();
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* quota / private mode — non-fatal */ }
  try {
    window.dispatchEvent(new CustomEvent("grocery-unlocked-store-changed"));
  } catch { /* SSR / no window */ }
}

export function listUnlockedLists() {
  return loadStore().lists.slice().sort((a, b) => {
    const ad = a.created_date || "";
    const bd = b.created_date || "";
    return ad.localeCompare(bd);
  });
}

export function createUnlockedList(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const store = loadStore();
  const record = { id: newId(), name: trimmed, created_date: nowIso() };
  store.lists.push(record);
  saveStore(store);
  return record;
}

export function renameUnlockedList(id, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return false;
  const store = loadStore();
  const list = store.lists.find((l) => l.id === id);
  if (!list) return false;
  list.name = trimmed;
  saveStore(store);
  return true;
}

export function deleteUnlockedList(id) {
  const store = loadStore();
  store.lists = store.lists.filter((l) => l.id !== id);
  store.items = store.items.filter((i) => i.list_id !== id);
  saveStore(store);
}

// Move a list (and its items) from IDB → localStorage, or remove
// the mirror when the user toggles "available when locked" off.
// The actual IDB record is created/removed by the caller — this
// helper only manages the local snapshot side.
export function upsertUnlockedListSnapshot({ id, name, created_date }) {
  const store = loadStore();
  const existing = store.lists.find((l) => l.id === id);
  if (existing) {
    existing.name = name;
  } else {
    store.lists.push({ id, name, created_date: created_date || nowIso() });
  }
  saveStore(store);
}

export function removeUnlockedListSnapshot(id) {
  const store = loadStore();
  store.lists = store.lists.filter((l) => l.id !== id);
  store.items = store.items.filter((i) => i.list_id !== id);
  saveStore(store);
}

export function listItemsForUnlockedList(listId) {
  return loadStore().items.filter((i) => i.list_id === listId);
}

export function createUnlockedItem(listId, name) {
  const trimmed = (name || "").trim();
  if (!trimmed || !listId) return null;
  const store = loadStore();
  const record = {
    id: newId(),
    list_id: listId,
    name: trimmed,
    checked: false,
    purchased_at: null,
    ran_out_at: null,
    created_date: nowIso(),
  };
  store.items.push(record);
  saveStore(store);
  return record;
}

export function updateUnlockedItem(id, patch) {
  const store = loadStore();
  const it = store.items.find((x) => x.id === id);
  if (!it) return false;
  Object.assign(it, patch);
  saveStore(store);
  return true;
}

export function deleteUnlockedItem(id) {
  const store = loadStore();
  store.items = store.items.filter((i) => i.id !== id);
  saveStore(store);
}

export function listUnlockedFavorites() {
  return loadStore().favorites.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export function addUnlockedFavorite(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const store = loadStore();
  if (store.favorites.some((f) => (f.name || "").toLowerCase() === trimmed.toLowerCase())) return null;
  const record = { id: newId(), name: trimmed, created_date: nowIso() };
  store.favorites.push(record);
  saveStore(store);
  return record;
}

export function removeUnlockedFavorite(name) {
  const lc = (name || "").trim().toLowerCase();
  if (!lc) return;
  const store = loadStore();
  store.favorites = store.favorites.filter((f) => (f.name || "").toLowerCase() !== lc);
  saveStore(store);
}

export function hasAnyUnlockedList() {
  return loadStore().lists.length > 0;
}

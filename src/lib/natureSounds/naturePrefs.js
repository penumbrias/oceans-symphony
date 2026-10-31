// Nature sounds settings for this device: favourites, how the list is
// sorted and filtered, shuffle, volume and the last sound. Durable through
// BACKUP_LS_KEYS (backups + the in-database settings mirror). Everything
// read back is checked, so an edited or old value can't break the screen.

import { NATURE_TAGS, natureSoundById } from "./catalog";

export const NATURE_PREFS_KEY = "symphony_nature_sounds_v1";
export const SORTS = ["name", "place", "short", "long"];

const TAG_IDS = new Set(NATURE_TAGS.map((t) => t.id));

const DEFAULTS = {
  favorites: [],
  sort: "name",
  tags: [],
  favoritesOnly: false,
  shuffle: false,
  volume: 80,
  keepPlaying: true,
  lastId: null,
};

const listeners = new Set();
let cache = null;

export function readNaturePrefs() {
  if (cache) return cache;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(NATURE_PREFS_KEY) || "null"); } catch { raw = null; }
  if (!raw || typeof raw !== "object") { cache = structuredClone(DEFAULTS); return cache; }
  const vol = Number(raw.volume);
  cache = {
    // Favourites keep ids this version doesn't know (a newer pack), so a
    // restore onto an older app doesn't drop them.
    favorites: Array.isArray(raw.favorites) ? [...new Set(raw.favorites.filter((x) => typeof x === "string"))] : [],
    sort: SORTS.includes(raw.sort) ? raw.sort : DEFAULTS.sort,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => TAG_IDS.has(t)) : [],
    favoritesOnly: !!raw.favoritesOnly,
    shuffle: !!raw.shuffle,
    volume: Number.isFinite(vol) ? Math.round(Math.min(100, Math.max(0, vol))) : DEFAULTS.volume,
    keepPlaying: raw.keepPlaying !== false,
    lastId: typeof raw.lastId === "string" && natureSoundById(raw.lastId) ? raw.lastId : null,
  };
  return cache;
}

export function writeNaturePrefs(patch) {
  cache = { ...readNaturePrefs(), ...patch };
  try { localStorage.setItem(NATURE_PREFS_KEY, JSON.stringify(cache)); } catch { /* non-fatal */ }
  for (const fn of listeners) { try { fn(cache); } catch { /* listener */ } }
  return cache;
}

export const subscribeNaturePrefs = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function toggleFavorite(id) {
  const favs = readNaturePrefs().favorites;
  return writeNaturePrefs({ favorites: favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id] });
}

// The list as the person has it sorted and filtered.
export function filterSounds(sounds, { sort, tags, favoritesOnly, favorites, query }) {
  const q = (query || "").trim().toLowerCase();
  const favSet = new Set(favorites);
  const list = sounds.filter((s) =>
    (!favoritesOnly || favSet.has(s.id))
    && tags.every((t) => s.tags.includes(t))
    && (!q || `${s.title} ${s.place} ${s.by}`.toLowerCase().includes(q)));
  const byName = (a, b) => a.title.localeCompare(b.title);
  const cmp = {
    name: byName,
    place: (a, b) => (a.place || "~").localeCompare(b.place || "~") || byName(a, b),
    short: (a, b) => a.seconds - b.seconds || byName(a, b),
    long: (a, b) => b.seconds - a.seconds || byName(a, b),
  }[sort] || byName;
  return list.sort(cmp);
}

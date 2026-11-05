// Pure rules of the sound manager (no app imports, so
// scripts/test-sound-manager.mjs can run them in node). The hooks and the
// writers are in soundManager.js, which re-exports all of this.

import { PS } from "./profileStyle.js";

export const SOUND_MANAGER_FIELD = "sound_manager";

const EMPTY = Object.freeze({ songs: {}, quiet: [], quietMode: "wait", quietVolume: 30, windows: [] });

export const clampVol = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
};

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const cleanTime = (t, fallback) => (typeof t === "string" && TIME_RE.test(t) ? t : fallback);
const cleanDays = (d) => (Array.isArray(d) ? [...new Set(d.map(Number).filter((n) => n >= 0 && n <= 6))].sort() : []);
const cleanWindow = (w, i) => (w && typeof w === "object" ? {
  id: String(w.id || `w${i}`),
  name: typeof w.name === "string" ? w.name : "",
  start: cleanTime(w.start, "22:00"),
  end: cleanTime(w.end, "07:00"),
  days: cleanDays(w.days),
} : null);

export function readSoundManager(settingsRow) {
  const raw = settingsRow?.[SOUND_MANAGER_FIELD];
  if (!raw || typeof raw !== "object") return EMPTY;
  const songs = {};
  if (raw.songs && typeof raw.songs === "object") {
    for (const [k, v] of Object.entries(raw.songs)) {
      const vol = clampVol(v?.volume);
      if (vol !== null) songs[k] = { volume: vol };
    }
  }
  return {
    songs,
    quiet: (Array.isArray(raw.quiet) ? raw.quiet : []).map(cleanWindow).filter(Boolean),
    quietMode: raw.quietMode === "quieter" ? "quieter" : "wait",
    quietVolume: clampVol(raw.quietVolume) ?? 30,
    windows: (Array.isArray(raw.windows) ? raw.windows : []).map(cleanWindow).filter(Boolean),
  };
}

export const newWindowId = () => `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ── Song identity ───────────────────────────────────────────────────────────

// Stored blobs are written as /local-image/<id>, older rows local-image://<id>.
export function songKey(ref) {
  if (typeof ref !== "string" || !ref) return "";
  if (ref.startsWith("/local-image/")) {
    try { return decodeURIComponent(ref.slice(13)); } catch { return ref.slice(13); }
  }
  if (ref.startsWith("local-image://")) return ref.slice(14);
  return ref;
}

// Does this song object play anything (its own song or one for a time window)?
export function hasAnySong(song) {
  if (!song || typeof song !== "object") return false;
  if (song.ref) return true;
  return !!song.windows && Object.values(song.windows).some((w) => w?.ref);
}

// ── Time ────────────────────────────────────────────────────────────────────

const toMin = (t) => {
  const m = TIME_RE.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

export function inWindow(win, now = new Date()) {
  if (!win) return false;
  const s = toMin(win.start);
  const e = toMin(win.end);
  const m = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay();
  const yesterday = (today + 6) % 7;
  const onDay = (d) => !win.days?.length || win.days.includes(d);
  if (s === e) return onDay(today);
  if (s < e) return onDay(today) && m >= s && m < e;
  // Runs past midnight: the evening part belongs to today, the early-morning
  // part to the day it started.
  return (m >= s && onDay(today)) || (m < e && onDay(yesterday));
}

export const quietNow = (sm, now = new Date()) => (sm?.quiet || []).some((w) => inWindow(w, now));

// The first time window (in the order they're listed) that is on now AND
// has a song on this profile.
export function activeWindowSong(song, sm, now = new Date()) {
  if (!song?.windows) return null;
  for (const w of sm?.windows || []) {
    const pick = song.windows[w.id];
    if (pick?.ref && inWindow(w, now)) return { window: w, pick };
  }
  return null;
}

// The song to play right now, with its volume worked out, and whether
// quiet hours keep it from starting on its own.
export function resolveSong(song, sm, now = new Date()) {
  if (!hasAnySong(song)) return { song: null, quiet: false };
  const hit = activeWindowSong(song, sm, now);
  let effective = song;
  if (hit) {
    effective = { ...song, ref: hit.pick.ref, title: hit.pick.title || "", volume: hit.pick.volume ?? song.volume };
  }
  if (!effective.ref) return { song: null, quiet: false };
  const key = songKey(effective.ref);
  let volume = clampVol(effective.volume) ?? sm?.songs?.[key]?.volume ?? 100;
  const quiet = quietNow(sm, now);
  if (quiet && sm.quietMode === "quieter") volume = Math.min(volume, sm.quietVolume);
  return { song: { ...effective, volume }, quiet: quiet && sm.quietMode !== "quieter", windowId: hit?.window.id || null };
}

// ── Formatting ──────────────────────────────────────────────────────────────

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: DAY_SHORT[d] }));

export function formatClock(t, use24 = false) {
  const mins = toMin(t);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (use24) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const h12 = h % 12 || 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}

export function formatDays(days) {
  if (!days?.length || days.length === 7) return "Every day";
  const set = new Set(days);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return DAY_OPTIONS.filter((o) => set.has(o.value)).map((o) => o.label).join(", ");
}

export const formatWindow = (w, use24 = false) =>
  `${formatClock(w.start, use24)} – ${formatClock(w.end, use24)} · ${formatDays(w.days)}`;

// ── Where songs are ─────────────────────────────────────────────────────────

export const PROFILE_TYPES = ["alter", "group", "location"];

// An alter's song: one set in Profile style wins over the older top-level
// field; with neither, the defaults for new profiles (`lookCf` already has
// them merged in) apply.
export function alterSongOf(alter, lookCf = null) {
  const own = alter?.custom_fields?.[PS.SONG];
  if (hasAnySong(own)) return own;
  if (hasAnySong(alter?.profile_song)) return alter.profile_song;
  const merged = lookCf?.[PS.SONG];
  return hasAnySong(merged) ? merged : null;
}

// The song a profile set for itself (not one it gets from the defaults).
export function ownSongOf(type, record) {
  if (!record) return null;
  if (type === "alter") {
    const own = record.custom_fields?.[PS.SONG];
    if (hasAnySong(own)) return own;
    return hasAnySong(record.profile_song) ? record.profile_song : null;
  }
  const own = record.custom_fields?.[PS.SONG];
  return hasAnySong(own) ? own : null;
}

// Every profile with a song of its own: [{ type, id, name, song, record }].
export function profilesWithSongs({ alters = [], groups = [], locations = [] }) {
  const out = [];
  for (const a of alters) {
    if (a?.is_archived) continue;
    const song = ownSongOf("alter", a);
    if (song) out.push({ type: "alter", id: a.id, name: a.name || "", song, record: a });
  }
  for (const g of groups) {
    const song = ownSongOf("group", g);
    if (song) out.push({ type: "group", id: g.id, name: g.name || "", song, record: g });
  }
  for (const l of locations) {
    const song = ownSongOf("location", l);
    if (song) out.push({ type: "location", id: l.id, name: l.name || "", song, record: l });
  }
  return out;
}

// Every song (by key) and where it is: the profiles playing it (as their
// own song or for a time window) and audio in the library that isn't on
// any profile yet. Nature sounds have their own library and are left out.
export function songCatalogue({ profiles = [], assets = [] }) {
  const byKey = new Map();
  const entry = (ref, title) => {
    const key = songKey(ref);
    if (!key) return null;
    if (!byKey.has(key)) byKey.set(key, { key, ref, title: "", uses: [], asset: null });
    const e = byKey.get(key);
    if (!e.title && title) e.title = title;
    return e;
  };
  for (const p of profiles) {
    if (p.song?.ref) entry(p.song.ref, p.song.title)?.uses.push({ type: p.type, id: p.id, name: p.name, windowId: null });
    for (const [windowId, pick] of Object.entries(p.song?.windows || {})) {
      if (pick?.ref) entry(pick.ref, pick.title)?.uses.push({ type: p.type, id: p.id, name: p.name, windowId });
    }
  }
  for (const a of assets) {
    if (a?.kind !== "audio" || a.nature_sound || a.trashed_at || !a.image_url) continue;
    const e = entry(a.image_url, a.name);
    if (e) e.asset = a;
  }
  return [...byKey.values()];
}


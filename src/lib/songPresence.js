// "Play this song everywhere" support for the Song widget.
//
// A song picked on a widget page, a profile or a page background registers
// here while it's on screen (`registerPageSong`). The app-wide song
// (GlobalSongHost) only plays when NO page song is on screen, so a page with
// its own song always keeps it — the everywhere song never overrides it.
//
// The play position is carried across too, so moving between a page with the
// song widget and the rest of the app doesn't restart the track. Playback
// only — nothing is written to the user's data.

let pageSongs = 0;
const listeners = new Set();
const lastTime = new Map(); // ref -> seconds

const emit = () => { for (const fn of [...listeners]) { try { fn(pageSongs); } catch { /* listener failed */ } } };

export function registerPageSong() {
  pageSongs += 1; emit();
  let done = false;
  return () => { if (done) return; done = true; pageSongs = Math.max(0, pageSongs - 1); emit(); };
}

export const pageSongCount = () => pageSongs;

export function subscribePageSongs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const saveSongTime = (ref, t) => { if (ref && Number.isFinite(t) && t > 0) lastTime.set(ref, t); };
export const takeSongTime = (ref) => (ref && lastTime.has(ref) ? lastTime.get(ref) : 0);

// "Automatic. Play when no music is playing." One switch (it replaces the old
// "Start on its own" + "Play when there's no sound playing" pair). Older songs
// that only carry `autoplay` keep meaning what they did.
export const songAutomatic = (s) => (typeof s?.automatic === "boolean" ? s.automatic : s?.autoplay !== false);

// The automatic Song widget the person had open last. Leaving the widget pages
// for Journals, Chat… keeps THAT song going, so with several automatic song
// widgets the one on the page you last visited is the one that plays.
let lastAuto = null;
const lastAutoListeners = new Set();
export function setLastAutoSong(song) {
  if (!song?.ref || lastAuto?.ref === song.ref) return;
  lastAuto = song;
  for (const fn of [...lastAutoListeners]) { try { fn(); } catch { /* listener failed */ } }
}
export const getLastAutoSong = () => lastAuto;
export function subscribeLastAutoSong(fn) {
  lastAutoListeners.add(fn);
  return () => lastAutoListeners.delete(fn);
}

// Every Song widget (any page of any board), read as plain data so it works
// from any screen.
export function collectSongWidgets(settingsRow) {
  const out = [];
  if (!settingsRow || typeof settingsRow !== "object") return out;
  for (const field of ["ui_v2_home", "experimental_home", "classic_home", "ui_v2_home_desktop"]) {
    const pages = settingsRow[field]?.pages;
    if (!Array.isArray(pages)) continue;
    for (const p of pages) {
      for (const w of Array.isArray(p?.widgets) ? p.widgets : []) {
        const song = w?.widgetId === "song" ? w.settings?.song : null;
        if (song?.ref) out.push(song);
      }
    }
  }
  return out;
}

// What the app-wide player should play when no page has a song of its own:
// the automatic song from the widget page opened last (if that widget still
// exists), else the first song set to play on every page.
export function findAppWideSong(settingsRow, last = lastAuto) {
  const songs = collectSongWidgets(settingsRow);
  if (last?.ref) {
    // Only a song the person switched to Automatic since this arrived
    // (`automatic: true` is saved) carries on outside the widget pages.
    // Songs placed before keep stopping when you leave their page, as they
    // always did.
    const still = songs.find((s) => s.ref === last.ref && s.automatic === true && s.everywhere !== true);
    if (still) return still;
  }
  return songs.find((s) => s.everywhere === true) || null;
}

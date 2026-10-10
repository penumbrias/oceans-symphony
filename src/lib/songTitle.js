// The name a picked song goes by. Songs are stored as
// { ref, title, titleAuto?, loop, autoplay?, volume? } (ProfileSongPicker).
//
// `titleAuto: true`  — the title was filled in for the user (file name,
//                      library name, link's file name), so picking a
//                      different song may replace it.
// `titleAuto: false` — the user typed it; it is never replaced.
// missing            — saved before the flag existed. Kept as-is, except the
//                      placeholder "Song" the library pick used to write.

export const GENERIC_SONG_TITLE = "Song";

// "https://x.com/music/Calm%20Waters.mp3?dl=1" → "Calm Waters". Only for
// links; a stored blob (/local-image/song-…) has no human name in its ref.
export function titleFromRef(ref) {
  if (typeof ref !== "string" || !/^https?:\/\//i.test(ref)) return "";
  try {
    const last = new URL(ref).pathname.split("/").filter(Boolean).pop() || "";
    let name = last;
    try { name = decodeURIComponent(last); } catch { /* keep the raw segment */ }
    return name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_+]+/g, " ").trim().slice(0, 80);
  } catch {
    return "";
  }
}

// A library item's name is only a title if a person gave it one — an
// unnamed stored blob reports its storage id ("song-1712…").
export function meaningfulAssetName(name) {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n || /^song-\d+/i.test(n) || n === "Image" || n === "Audio") return "";
  return n.slice(0, 80);
}

// The title the user chose themselves, which a new pick must keep.
export function keptSongTitle(song) {
  const t = typeof song?.title === "string" ? song.title.trim() : "";
  if (!t || song.titleAuto === true) return "";
  if (song.titleAuto === undefined && t === GENERIC_SONG_TITLE) return "";
  return song.title;
}

// Stored blobs are written as /local-image/<id> but older rows may say
// local-image://<id> — compare by the id.
function refKey(ref) {
  if (typeof ref !== "string") return "";
  if (ref.startsWith("/local-image/")) {
    try { return decodeURIComponent(ref.slice(13)); } catch { return ref.slice(13); }
  }
  if (ref.startsWith("local-image://")) return ref.slice(14);
  return ref;
}

// What to call a song on screen. `assets` (ImageAsset rows) lets a song
// picked from the library before titles were filled in still show its
// library name.
export function songDisplayTitle(song, assets = []) {
  if (!song?.ref) return "";
  const t = typeof song.title === "string" ? song.title.trim() : "";
  if (t && !(t === GENERIC_SONG_TITLE && song.titleAuto !== false)) return t;
  const key = refKey(song.ref);
  const asset = Array.isArray(assets) ? assets.find((a) => a?.image_url && refKey(a.image_url) === key) : null;
  return meaningfulAssetName(asset?.name) || titleFromRef(song.ref) || t;
}

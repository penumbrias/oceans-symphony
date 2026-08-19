// folder:// image sources (v0.192.0) — pick a WHOLE asset-library folder
// where the app wants one picture, and let it rotate.
//
//   folder://<encoded folder name>?mode=<policy>[&every=<unit>]
//
// Policies (the `mode`):
//   random    — a random image, new pick each app load (default)
//   sequence  — next image each app load (index remembered per source)
//   hourly    — a different image each hour (seeded by the hour, stable
//               within it)
//   daily     — a different image each day
//   weekday   — image N for weekday N (Sun=0 … Sat=6, wraps)
//   fronter   — the image owned by the current primary fronter (an image
//               with owner_alter_id in the folder); falls back to random
//
// A folder name starting with "👤 " is an alter's own folder (the library
// synthesises those from owner_alter_id) — resolved by owner, not by the
// stored `folder` string, so renames don't orphan it.
//
// Why a URL SCHEME: every image slot in the app already resolves through
// resolveImageUrl / useResolvedAvatarUrl, so a folder source works
// wherever a picture does — avatars, banners, backgrounds, wallpaper,
// widget pictures — with no per-surface work.

export const FOLDER_SCHEME = "folder://";
export const FOLDER_MODES = [
  { id: "random",   label: "Random each time the app opens" },
  { id: "sequence", label: "Next one each time the app opens" },
  { id: "hourly",   label: "Changes every hour" },
  { id: "daily",    label: "Changes every day" },
  { id: "weekday",  label: "One per weekday" },
  { id: "fronter",  label: "Whoever is fronting (their image in the folder)" },
];

export function isFolderUrl(url) {
  return typeof url === "string" && url.startsWith(FOLDER_SCHEME);
}

export function makeFolderUrl(folder, { mode = "random" } = {}) {
  const m = FOLDER_MODES.some((x) => x.id === mode) ? mode : "random";
  return `${FOLDER_SCHEME}${encodeURIComponent(String(folder || "").trim())}?mode=${m}`;
}

export function parseFolderUrl(url) {
  if (!isFolderUrl(url)) return null;
  const rest = url.slice(FOLDER_SCHEME.length);
  const qi = rest.indexOf("?");
  const name = decodeURIComponent(qi >= 0 ? rest.slice(0, qi) : rest);
  const params = new URLSearchParams(qi >= 0 ? rest.slice(qi + 1) : "");
  const mode = FOLDER_MODES.some((x) => x.id === params.get("mode")) ? params.get("mode") : "random";
  return { folder: name, mode };
}

// Human label for a stored folder source (pickers / summaries).
export function describeFolderUrl(url) {
  const p = parseFolderUrl(url);
  if (!p) return "";
  const m = FOLDER_MODES.find((x) => x.id === p.mode);
  return `${p.folder} · ${m ? m.label.toLowerCase() : p.mode}`;
}

// Deterministic small hash for seeding time-based picks.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// The per-load caches: random keeps its pick for the session; sequence
// advances a stored index once per load.
const _sessionPick = new Map();

// `items`: [{ url, ownerAlterId }] for the folder, in library order.
// `ctx`: { now: Date, primaryAlterId: string|null }.
export function pickFromFolder(sourceUrl, items, ctx = {}) {
  const p = parseFolderUrl(sourceUrl);
  if (!p || !items || items.length === 0) return null;
  const urls = items.map((i) => i.url).filter(Boolean);
  if (urls.length === 0) return null;
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  switch (p.mode) {
    case "sequence": {
      if (_sessionPick.has(sourceUrl)) return _sessionPick.get(sourceUrl);
      const key = `symphony_folder_seq_${sourceUrl}`;
      let idx = 0;
      try { const raw = parseInt(localStorage.getItem(key), 10); if (Number.isFinite(raw) && raw >= 0) idx = raw; } catch { /* storage off */ }
      const picked = urls[idx % urls.length];
      try { localStorage.setItem(key, String((idx + 1) % urls.length)); } catch { /* storage off */ }
      _sessionPick.set(sourceUrl, picked);
      return picked;
    }
    case "hourly": {
      const seed = `${sourceUrl}|${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
      return urls[hash(seed) % urls.length];
    }
    case "daily": {
      const seed = `${sourceUrl}|${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      return urls[hash(seed) % urls.length];
    }
    case "weekday":
      return urls[now.getDay() % urls.length];
    case "fronter": {
      const mine = ctx.primaryAlterId ? items.find((i) => i.ownerAlterId === ctx.primaryAlterId && i.url) : null;
      if (mine) return mine.url;
      // fall through to random
      if (_sessionPick.has(sourceUrl)) return _sessionPick.get(sourceUrl);
      const picked = urls[Math.floor(Math.random() * urls.length)];
      _sessionPick.set(sourceUrl, picked);
      return picked;
    }
    case "random":
    default: {
      if (_sessionPick.has(sourceUrl)) return _sessionPick.get(sourceUrl);
      const picked = urls[Math.floor(Math.random() * urls.length)];
      _sessionPick.set(sourceUrl, picked);
      return picked;
    }
  }
}

// Does this source change on its own over time / with the front? (The
// resolver hook re-resolves these on a timer.)
export function folderSourceIsLive(url) {
  const p = parseFolderUrl(url);
  return !!p && (p.mode === "hourly" || p.mode === "daily" || p.mode === "weekday" || p.mode === "fronter");
}

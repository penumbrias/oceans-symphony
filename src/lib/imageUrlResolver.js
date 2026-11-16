// Resolves avatar/image URLs to something an <img> tag can consume.
// /local-image/[id]  → read from IDB in the page (cached object URL). The
//                      Service Worker path is only a fallback now (v0.251.2):
//                      when the SW drew a blank (busy/closed IDB on app
//                      open, a picture still being restored) it answered
//                      with a placeholder the WebView then kept showing for
//                      that URL — "all my profile pictures vanished and
//                      refreshing doesn't bring them back".
// local-image://[id] → legacy format; resolved directly from IDB.
// Everything else    → returned as-is (http/https/data URLs).
//
// v0.86.5: IDB values are now Blobs (see localImageStorage). Legacy string
// (data URI) values are handled transparently — the resolver produces a
// browser-consumable URL either way. Blobs get a cached object URL; data
// URIs pass through unchanged.

import { isLocalImageUrl, getLocalImageId, readLocalImage } from './localImageStorage';

// { url → resolved value }. Object URLs live for the session and are shared
// across all consumers of the same image id — no need to revoke because the
// count is bounded by unique image count (O(alter count)) and each entry is
// ~40 bytes. Revoking on unmount would flicker when the same avatar appears
// in multiple simultaneous mounts (grid + profile), which is common.
//
// v0.374.3: a cached object URL can go dead while the app is open. On
// Android the WebView can close the picture store's database under us
// (backgrounding, storage pressure, a low-memory phone); the object URLs
// made from its Blobs then point at files that are gone, so EVERY picture
// on screen breaks at once and stays broken, because the cache kept
// handing out the dead URL ("after under an hour all our photos stop
// showing", after the v0.251.2 fix for pictures that couldn't be READ).
// So the cache now heals itself: a picture that fails to draw from one of
// our object URLs is dropped and read again, and when the app comes back
// to the foreground one cached URL is test-read, with everything dropped
// and re-read if it's dead. Spots showing pictures re-resolve when told.
const _cache = new Map();
// object URL → the source url it was made for (for the error listener).
const _blobSource = new Map();
// source url → the read in progress.
const _inflight = new Map();
// source url → recent heal times, so a picture that is genuinely broken
// can't loop read → fail → read forever.
const _heals = new Map();
const HEAL_WINDOW_MS = 10 * 60 * 1000;
const MAX_HEALS_PER_WINDOW = 3;

export const IMAGE_CACHE_STALE_EVENT = 'symphony-image-cache-stale';

function announceStale(detail) {
  try { window.dispatchEvent(new CustomEvent(IMAGE_CACHE_STALE_EVENT, { detail })); } catch { /* no window */ }
}

function dropEntry(sourceUrl) {
  const val = _cache.get(sourceUrl);
  _cache.delete(sourceUrl);
  if (typeof val === 'string' && val.startsWith('blob:')) {
    _blobSource.delete(val);
    // Revoke later: another spot may still be drawing it fine.
    setTimeout(() => { try { URL.revokeObjectURL(val); } catch { /* ignore */ } }, 30000);
  }
}

function mayHeal(sourceUrl) {
  const now = Date.now();
  const times = (_heals.get(sourceUrl) || []).filter((t) => now - t < HEAL_WINDOW_MS);
  if (times.length >= MAX_HEALS_PER_WINDOW) { _heals.set(sourceUrl, times); return false; }
  times.push(now);
  _heals.set(sourceUrl, times);
  return true;
}

// Forget the cached result for one picture (by its source url or by the
// object URL we handed out) and tell every spot showing it to read again.
// Returns true when something was dropped.
export function invalidateResolvedImage(url) {
  if (!url) return false;
  const sourceUrl = _blobSource.get(url) || (_cache.has(url) ? url : null);
  if (!sourceUrl || !mayHeal(sourceUrl)) return false;
  const dead = _cache.get(sourceUrl);
  dropEntry(sourceUrl);
  announceStale({ urls: [sourceUrl], blobs: dead ? [dead] : [] });
  return true;
}

// Drop every cached object URL (the store they came from is gone) and tell
// every spot to read again.
function invalidateAllBlobs() {
  const blobs = [..._blobSource.keys()];
  const sources = [..._blobSource.values()];
  if (!sources.length) return;
  for (const src of sources) dropEntry(src);
  announceStale({ all: true, urls: sources, blobs });
}

let _healInstalled = false;
function installSelfHealing() {
  if (_healInstalled || typeof window === 'undefined' || typeof document === 'undefined') return;
  _healInstalled = true;
  // Image errors don't bubble, but they do pass through the capture phase.
  document.addEventListener('error', (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    const src = el.currentSrc || el.src || '';
    if (src.startsWith('blob:') && _blobSource.has(src)) invalidateResolvedImage(src);
  }, true);
  // Back from the background: make sure the cached object URLs still read
  // (background pictures never fire an error event, so this is the only
  // way they'd heal).
  let checking = false;
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || checking) return;
    const probe = _blobSource.keys().next().value;
    if (!probe) return;
    checking = true;
    try {
      const res = await fetch(probe);
      if (!res.ok) throw new Error('dead');
      await res.blob();
    } catch {
      if (_blobSource.has(probe)) invalidateAllBlobs();
    } finally {
      checking = false;
    }
  });
}
installSelfHealing();

// True when a Service Worker actually controls this page and can therefore
// intercept /local-image/ requests. False on iOS native — WKWebView never
// runs a SW on the capacitor:// scheme, which left every /local-image/ URL
// 404ing as a broken image — and on the very first web load before the SW
// has claimed the page. In both cases we resolve straight from IndexedDB
// instead, which works everywhere.
export function swServesLocalImages() {
  try {
    return !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  } catch {
    return false;
  }
}

// Shared IDB → consumable-URL path for both URL forms. Blobs become cached
// object URLs; legacy data-URI strings pass through.
// Throws when IDB can't be read at all (vs null for "not stored").
async function resolveFromIdb(cacheKey, imageId) {
  if (!imageId) return null;
  const imageData = await readLocalImage(imageId);
  if (imageData instanceof Blob) {
    try {
      const objectUrl = URL.createObjectURL(imageData);
      _cache.set(cacheKey, objectUrl);
      _blobSource.set(objectUrl, cacheKey);
      return objectUrl;
    } catch { /* fall through */ }
  }
  if (typeof imageData === 'string' && imageData) {
    _cache.set(cacheKey, imageData);
    return imageData;
  }
  return null;
}

// folder:// sources: pick one image from the folder by its policy, then
// resolve THAT. Not cached here (the policy decides stability — random /
// sequence keep their own per-load pick; hourly / daily / fronter must be
// re-evaluated), so the hook re-resolves live sources on a timer.
async function resolveFolderSource(url) {
  const { parseFolderUrl, pickFromFolder } = await import('./folderSource.js');
  const p = parseFolderUrl(url);
  if (!p) return null;
  const { base44 } = await import('@/api/base44Client');
  let rows = [];
  try {
    if (p.folder.startsWith('👤 ')) {
      // An alter's own folder: match by owner, not the display name.
      const name = p.folder.slice(2).trim();
      const alters = await base44.entities.Alter.list();
      const owner = alters.find((a) => (a.name || '') === name);
      rows = owner ? await base44.entities.ImageAsset.filter({ owner_alter_id: owner.id }) : [];
    } else {
      rows = await base44.entities.ImageAsset.filter({ folder: p.folder });
    }
  } catch { rows = []; }
  const items = (rows || []).filter((a) => a && a.image_url && (!a.kind || a.kind === 'image'))
    .map((a) => ({ url: a.image_url, ownerAlterId: a.owner_alter_id || null }));
  let primaryAlterId = null;
  if (p.mode === 'fronter') {
    try {
      const active = await base44.entities.FrontingSession.filter({ is_active: true });
      const prim = active.find((s) => s.is_primary) || active[0];
      primaryAlterId = prim ? (prim.alter_id || prim.primary_alter_id || null) : null;
    } catch { /* no front */ }
  }
  const picked = pickFromFolder(url, items, { now: new Date(), primaryAlterId });
  return picked ? resolveImageUrl(picked) : null;
}

export async function resolveImageUrl(url) {
  if (!url) return null;
  if (typeof url === 'string' && url.startsWith('folder://')) return resolveFolderSource(url);
  if (_cache.has(url)) return _cache.get(url);

  // Stored on this device — read it in the page. Only if the page can't
  // reach IDB at all does a SW-controlled page hand the URL to the SW.
  // Nothing is cached on a miss, so the next try reads again.
  // One read per picture at a time: after a heal, every spot showing it
  // asks at once.
  if (isLocalImageUrl(url)) {
    if (_inflight.has(url)) return _inflight.get(url);
    const p = (async () => {
      try {
        return await resolveFromIdb(url, getLocalImageId(url));
      } catch {
        return url.startsWith('/local-image/') && swServesLocalImages() ? url : null;
      }
    })();
    _inflight.set(url, p);
    try { return await p; } finally { _inflight.delete(url); }
  }

  // External / data URL — pass through
  _cache.set(url, url);
  return url;
}

// The already-resolved URL for `url`, synchronously, or undefined — lets a
// remount paint the picture on its first render instead of flashing the
// placeholder while the async lookup runs.
export function peekResolvedImageUrl(url) {
  return url ? _cache.get(url) : undefined;
}

// Called by the blob-storage migration after entries are rewritten so the
// resolver stops returning stale data URIs the SW would otherwise still
// serve fine.
export function clearImageResolverCache() {
  for (const val of _cache.values()) {
    if (typeof val === 'string' && val.startsWith('blob:')) {
      try { URL.revokeObjectURL(val); } catch { /* ignore */ }
    }
  }
  _cache.clear();
  _blobSource.clear();
}

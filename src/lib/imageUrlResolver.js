// Resolves avatar/image URLs to something an <img> tag can consume.
// /local-image/[id]  → returned as-is; the Service Worker serves it from IDB.
// local-image://[id] → legacy format; resolved directly from IDB.
// Everything else    → returned as-is (http/https/data URLs).
//
// v0.86.5: IDB values are now Blobs (see localImageStorage). Legacy string
// (data URI) values are handled transparently — the resolver produces a
// browser-consumable URL either way. Blobs get a cached object URL; data
// URIs pass through unchanged.

import { isLocalImageUrl, getLocalImageId, getLocalImage } from './localImageStorage';

// { url → resolved value }. Object URLs live for the session and are shared
// across all consumers of the same image id — no need to revoke because the
// count is bounded by unique image count (O(alter count)) and each entry is
// ~40 bytes. Revoking on unmount would flicker when the same avatar appears
// in multiple simultaneous mounts (grid + profile), which is common.
const _cache = new Map();

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
async function resolveFromIdb(cacheKey, imageId) {
  if (!imageId) return null;
  const imageData = await getLocalImage(imageId);
  if (imageData instanceof Blob) {
    try {
      const objectUrl = URL.createObjectURL(imageData);
      _cache.set(cacheKey, objectUrl);
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
  const items = (rows || []).filter((a) => a && a.image_url && a.kind !== 'audio')
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

  // SW-interceptable path — return as-is ONLY when a SW is actually in
  // control; otherwise (iOS native, pre-claim web load) serve from IDB.
  if (url.startsWith('/local-image/')) {
    if (swServesLocalImages()) {
      _cache.set(url, url);
      return url;
    }
    return await resolveFromIdb(url, getLocalImageId(url));
  }

  // Legacy custom-protocol URL — resolve directly from IDB
  if (isLocalImageUrl(url)) {
    return await resolveFromIdb(url, getLocalImageId(url));
  }

  // External / data URL — pass through
  _cache.set(url, url);
  return url;
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
}

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

export async function resolveImageUrl(url) {
  if (!url) return null;
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

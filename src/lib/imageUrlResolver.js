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

export async function resolveImageUrl(url) {
  if (!url) return null;
  if (_cache.has(url)) return _cache.get(url);

  // New SW-interceptable path — browser handles it natively
  if (url.startsWith('/local-image/')) {
    _cache.set(url, url);
    return url;
  }

  // Legacy custom-protocol URL — resolve directly from IDB
  if (isLocalImageUrl(url)) {
    const imageId = getLocalImageId(url);
    if (imageId) {
      const imageData = await getLocalImage(imageId);
      if (imageData instanceof Blob) {
        try {
          const objectUrl = URL.createObjectURL(imageData);
          _cache.set(url, objectUrl);
          return objectUrl;
        } catch { /* fall through */ }
      }
      if (typeof imageData === 'string' && imageData) {
        _cache.set(url, imageData);
        return imageData;
      }
    }
    return null;
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

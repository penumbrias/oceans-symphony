// Resolves avatar/image URLs to something an <img> tag can consume.
// /local-image/[id]  → returned as-is; the Service Worker serves it from IDB.
// local-image://[id] → legacy format; resolved directly from IDB as a data URL.
// Everything else    → returned as-is (http/https/data URLs).

import { isLocalImageUrl, getLocalImageId, getLocalImage } from './localImageStorage';

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
      if (imageData) {
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

export function clearImageCache() {
  _cache.clear();
}

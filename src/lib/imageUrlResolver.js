// Helper to resolve image URLs (local or external) to displayable data
import { isLocalImageUrl, getLocalImageId, getLocalImage } from './localImageStorage';

// Cache resolved images in memory to avoid repeated IndexedDB lookups
const _cache = new Map();

export async function resolveImageUrl(url) {
  if (!url) return null;
  
  // Check cache first
  if (_cache.has(url)) {
    return _cache.get(url);
  }

  // If it's a local image URL, fetch from IndexedDB
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

  // External URL — return as-is (http://, https://, data:, etc.)
  _cache.set(url, url);
  return url;
}

// Preload and cache an image URL
export async function preloadImageUrl(url) {
  return resolveImageUrl(url);
}

// Clear the URL cache (e.g., on logout)
export function clearImageCache() {
  _cache.clear();
}
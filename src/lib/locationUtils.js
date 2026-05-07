function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = v => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Find the most recently used name for a GPS position by matching against
 * past location records within `radiusMeters` (default 150 m).
 * Returns the name string, or null if no match is found.
 */
export function findNearbyLocationName(lat, lng, locations, radiusMeters = 150) {
  if (lat == null || lng == null || !locations?.length) return null;
  const candidates = locations
    .filter(l => l.latitude != null && l.longitude != null && l.name)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  for (const loc of candidates) {
    if (haversineMeters(lat, lng, loc.latitude, loc.longitude) <= radiusMeters) {
      return loc.name;
    }
  }
  return null;
}

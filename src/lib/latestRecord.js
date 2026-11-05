// The newest record in a list by a date field, in one pass. Replaces the
// "copy, sort the whole list, take [0]" pattern, which re-sorted every
// status note ever written on each render of the home screen.
// Ties keep the earlier record (same as the stable sort it replaces);
// unreadable dates count as oldest.
export function latestBy(list, field = "timestamp") {
  let best = null;
  let bestT = -Infinity;
  for (const r of list || []) {
    if (!r) continue;
    let t = new Date(r[field]).getTime();
    if (Number.isNaN(t)) t = -Infinity;
    if (best === null || t > bestT) { best = r; bestT = t; }
  }
  return best;
}

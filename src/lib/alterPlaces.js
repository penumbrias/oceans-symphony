// Which inner-world locations an alter is "in" (v0.304.1). Two ways:
//   • direct assignment — alter.inner_world_location_id;
//   • placement — one of their dots on a layer sits inside a location's box
//     on that same layer (what you SEE on the map).
// The profile Locations tab and the Inner world places widget share this.

const contains = (loc, p) => {
  const lx = loc.x ?? 0, ly = loc.y ?? 0, lw = loc.width || 200, lh = loc.height || 150;
  return p.x >= lx && p.x <= lx + lw && p.y >= ly && p.y <= ly + lh;
};

export function placesForAlter(alter, locations = [], placements = []) {
  const within = new Map();
  if (!alter) return { within: [], placedLayerIds: [] };
  if (alter.inner_world_location_id) {
    const loc = locations.find((l) => l.id === alter.inner_world_location_id);
    if (loc) within.set(loc.id, loc);
  }
  const mine = placements.filter((p) => p.alter_id === alter.id);
  for (const p of mine) {
    for (const loc of locations) {
      if (loc.layer_id === p.layer_id && contains(loc, p)) within.set(loc.id, loc);
    }
  }
  // Layers with a placement that isn't inside any of their locations.
  const placedLayerIds = new Set();
  for (const p of mine) {
    const inside = locations.some((loc) => loc.layer_id === p.layer_id && within.has(loc.id) && contains(loc, p));
    if (!inside && p.layer_id) placedLayerIds.add(p.layer_id);
  }
  return { within: [...within.values()], placedLayerIds: [...placedLayerIds] };
}

// Location ids any of these alters is in.
export function locationIdsForAlters(alterIds = [], alters = [], locations = [], placements = []) {
  const ids = new Set();
  const want = new Set(alterIds);
  for (const a of alters) {
    if (!want.has(a.id)) continue;
    for (const loc of placesForAlter(a, locations, placements).within) ids.add(loc.id);
  }
  return ids;
}

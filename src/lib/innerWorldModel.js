// Inner-world map data model — the functionality layer for the layered,
// multi-map inner world. Pure data/logic; the UI (InnerWorldMap.jsx and the
// new map/layer panels) consumes this via src/hooks/useInnerWorld.js.
//
// Concepts (art-program analogy):
//   InnerWorldMap       — a canvas. Users can have several.
//   InnerWorldLayer     — a layer inside a map (name, z-order, show/hide).
//   InnerWorldImage     — a backdrop image element on a layer (NOT a
//                         location); always rendered BELOW locations/alters.
//   InnerWorldPlacement — one alter's spot on one layer. An alter can have
//                         many placements → the same alter on multiple
//                         layers / maps.
//   InnerWorldLocation  — (existing) a named region. Now scoped to a
//                         map+layer, and can LINK to another map/layer
//                         (tap to jump) for interconnected / group systems.
//
// Render order within a map: visible layers by `order`; within a layer,
// images (bottom) → locations → alters (top).
//
// MIGRATION SAFETY: the one-time migration is purely ADDITIVE. It creates a
// default map + layer, stamps existing locations with map_id/layer_id, and
// seeds placements from each alter's legacy inner_world_x/y. It NEVER deletes
// or overwrites existing data — the legacy Alter.inner_world_* fields stay
// intact as a fallback (per the never-lose-data rule).

import { localEntities } from "@/api/base44Client";

export const IW_KEYS = {
  maps: ["innerWorldMaps"],
  layers: ["innerWorldLayers"],
  images: ["innerWorldImages"],
  locations: ["innerWorldLocations"], // existing key — keep in sync
  placements: ["innerWorldPlacements"],
};

const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

function nextOrder(items) {
  if (!items || !items.length) return 0;
  return Math.max(...items.map((i) => i.order || 0)) + 1;
}

async function listScoped(entityName, field, value) {
  // list() + JS filter rather than .filter({...}) so we don't depend on the
  // proxy's filter semantics for these brand-new entity types.
  const all = await localEntities[entityName].list();
  return (all || []).filter((r) => r[field] === value);
}

// ── Migration ────────────────────────────────────────────────────────────────

const MIGRATION_FLAG = "symphony_innerworld_migrated_v1";
let migratePromise = null;

async function doMigrate() {
  // Idempotent: if any map already exists we've set up before — bail.
  let maps = [];
  try { maps = (await localEntities.InnerWorldMap.list()) || []; } catch { maps = []; }
  if (maps.length) return maps;

  const map = await localEntities.InnerWorldMap.create({ name: "Inner World", order: 0, is_archived: false });
  const layer = await localEntities.InnerWorldLayer.create({ map_id: map.id, name: "Layer 1", order: 0, is_visible: true });

  // Stamp existing locations onto the default map+layer (additive).
  try {
    const locations = (await localEntities.InnerWorldLocation.list()) || [];
    for (const loc of locations) {
      if (!loc.map_id) {
        await localEntities.InnerWorldLocation.update(loc.id, {
          map_id: map.id,
          layer_id: loc.layer_id || layer.id,
        });
      }
    }
  } catch { /* non-fatal */ }

  // Seed placements from legacy alter coordinates (never clears the originals).
  try {
    const [alters, existingPlacements] = await Promise.all([
      localEntities.Alter.list(),
      localEntities.InnerWorldPlacement.list().catch(() => []),
    ]);
    const placedAlterIds = new Set((existingPlacements || []).map((p) => p.alter_id));
    for (const a of alters || []) {
      const hasCoords = a.inner_world_x != null || a.inner_world_y != null;
      if (!hasCoords || placedAlterIds.has(a.id)) continue;
      await localEntities.InnerWorldPlacement.create({
        alter_id: a.id,
        map_id: map.id,
        layer_id: layer.id,
        x: a.inner_world_x ?? 0,
        y: a.inner_world_y ?? 0,
        is_locked: !!a.inner_world_locked,
      });
    }
  } catch { /* non-fatal */ }

  try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch { /* private mode */ }
  return [map];
}

// Run-once-per-session (dedupes concurrent callers). Safe to await anywhere
// before reading maps/layers.
export function ensureInnerWorldMigrated() {
  if (!migratePromise) migratePromise = doMigrate().catch((e) => { migratePromise = null; throw e; });
  return migratePromise;
}

// ── Maps ───────────────────────────────────────────────────────────────────

export async function listMaps() {
  const maps = (await localEntities.InnerWorldMap.list()) || [];
  return maps.sort(byOrder);
}
export async function createMap(name = "New map") {
  const maps = (await localEntities.InnerWorldMap.list()) || [];
  const map = await localEntities.InnerWorldMap.create({ name, order: nextOrder(maps), is_archived: false });
  // A fresh map needs at least one layer to place things on.
  await localEntities.InnerWorldLayer.create({ map_id: map.id, name: "Layer 1", order: 0, is_visible: true });
  return map;
}
export const renameMap = (id, name) => localEntities.InnerWorldMap.update(id, { name });
export const archiveMap = (id, archived = true) => localEntities.InnerWorldMap.update(id, { is_archived: archived });
export async function reorderMaps(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => localEntities.InnerWorldMap.update(id, { order: i })));
}
export async function deleteMap(id) {
  const [layers, locations, images, placements] = await Promise.all([
    listScoped("InnerWorldLayer", "map_id", id),
    listScoped("InnerWorldLocation", "map_id", id),
    listScoped("InnerWorldImage", "map_id", id),
    listScoped("InnerWorldPlacement", "map_id", id),
  ]);
  await Promise.all([
    ...layers.map((l) => localEntities.InnerWorldLayer.delete(l.id)),
    ...locations.map((l) => localEntities.InnerWorldLocation.delete(l.id)),
    ...images.map((im) => localEntities.InnerWorldImage.delete(im.id)),
    ...placements.map((p) => localEntities.InnerWorldPlacement.delete(p.id)),
  ]);
  await localEntities.InnerWorldMap.delete(id);
}

// ── Layers ───────────────────────────────────────────────────────────────────

export async function createLayer(mapId, name = "New layer") {
  const layers = await listScoped("InnerWorldLayer", "map_id", mapId);
  return localEntities.InnerWorldLayer.create({ map_id: mapId, name, order: nextOrder(layers), is_visible: true });
}
export const renameLayer = (id, name) => localEntities.InnerWorldLayer.update(id, { name });
export const setLayerVisible = (id, visible) => localEntities.InnerWorldLayer.update(id, { is_visible: !!visible });
export const setLayerLocked = (id, locked) => localEntities.InnerWorldLayer.update(id, { is_locked: !!locked });
export async function reorderLayers(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => localEntities.InnerWorldLayer.update(id, { order: i })));
}
export async function deleteLayer(id) {
  const [locations, images, placements] = await Promise.all([
    listScoped("InnerWorldLocation", "layer_id", id),
    listScoped("InnerWorldImage", "layer_id", id),
    listScoped("InnerWorldPlacement", "layer_id", id),
  ]);
  await Promise.all([
    ...locations.map((l) => localEntities.InnerWorldLocation.delete(l.id)),
    ...images.map((im) => localEntities.InnerWorldImage.delete(im.id)),
    ...placements.map((p) => localEntities.InnerWorldPlacement.delete(p.id)),
  ]);
  await localEntities.InnerWorldLayer.delete(id);
}

// ── Backdrop images ──────────────────────────────────────────────────────────

export async function createImage(mapId, layerId, fields = {}) {
  const imgs = await listScoped("InnerWorldImage", "map_id", mapId);
  return localEntities.InnerWorldImage.create({
    image_url: "",
    x: 0, y: 0, width: 300, height: 200, rotation: 0, opacity: 1,
    ...fields,
    map_id: mapId,
    layer_id: layerId,
    order: fields.order ?? nextOrder(imgs),
  });
}
export const updateImage = (id, fields) => localEntities.InnerWorldImage.update(id, fields);
export const deleteImage = (id) => localEntities.InnerWorldImage.delete(id);
export async function reorderImages(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => localEntities.InnerWorldImage.update(id, { order: i })));
}

// ── Alter placements (one alter → many placements across layers/maps) ─────────

export const placeAlter = (alterId, mapId, layerId, x, y) =>
  localEntities.InnerWorldPlacement.create({ alter_id: alterId, map_id: mapId, layer_id: layerId, x, y, is_locked: false });
export const moveAlterPlacement = (id, x, y) => localEntities.InnerWorldPlacement.update(id, { x, y });
export const setPlacementLocked = (id, locked) => localEntities.InnerWorldPlacement.update(id, { is_locked: !!locked });
export const removePlacement = (id) => localEntities.InnerWorldPlacement.delete(id);

// ── Locations (existing entity; scoped + linkable) ───────────────────────────

export async function createLocation(mapId, layerId, fields = {}) {
  return localEntities.InnerWorldLocation.create({
    name: "New location", shape: "rectangle", color: "",
    x: 0, y: 0, width: 200, height: 150, order: 0,
    ...fields,
    map_id: mapId,
    layer_id: layerId,
  });
}
export const setLocationLink = (id, targetType, targetId) =>
  localEntities.InnerWorldLocation.update(id, { link_target_type: targetType || null, link_target_id: targetId || null });
export const clearLocationLink = (id) =>
  localEntities.InnerWorldLocation.update(id, { link_target_type: null, link_target_id: null });

// Returns { type: 'map'|'layer', id } if the location links somewhere, else null.
export function resolveLocationLink(location) {
  if (!location?.link_target_type || !location?.link_target_id) return null;
  return { type: location.link_target_type, id: location.link_target_id };
}

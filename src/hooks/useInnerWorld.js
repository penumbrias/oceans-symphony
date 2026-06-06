// React-query hooks over innerWorldModel.js — this is the interface the
// inner-world map UI builds against. Two hooks:
//   useInnerWorldMaps()  — the list of maps + map-level mutations. Triggers
//                          the one-time additive migration on first mount.
//   useInnerWorld(mapId) — everything scoped to one map: layers, locations,
//                          backdrop images, alter placements + all mutations.
//
// All reads are plain entity lists (cheap; the inner world is small) filtered
// to the active map in-memory, so the UI gets stable, sorted arrays.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localEntities } from "@/api/base44Client";
import * as IW from "@/lib/innerWorldModel";

const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

function useEntityList(key, entityName) {
  return useQuery({
    queryKey: key,
    queryFn: () => localEntities[entityName].list(),
  });
}

export function useInnerWorldMaps() {
  const qc = useQueryClient();

  // One-time additive migration (default map/layer + stamp existing data).
  // After it runs we MUST invalidate every inner-world query, not just maps:
  // the migration stamps existing locations with map_id/layer_id and creates
  // layers + placements in storage, but any list loaded BEFORE migration is
  // now stale (its rows lack map_id, so they filter out as "empty"). Without
  // this, a returning user saw a blank map until some action forced a refetch
  // — the data was on disk the whole time, just not re-read.
  useEffect(() => {
    IW.ensureInnerWorldMigrated()
      .then(() => {
        qc.invalidateQueries({ queryKey: IW.IW_KEYS.maps });
        qc.invalidateQueries({ queryKey: IW.IW_KEYS.layers });
        qc.invalidateQueries({ queryKey: IW.IW_KEYS.locations });
        qc.invalidateQueries({ queryKey: IW.IW_KEYS.images });
        qc.invalidateQueries({ queryKey: IW.IW_KEYS.placements });
      })
      .catch(() => {});
  }, [qc]);

  const { data: maps = [], isLoading } = useEntityList(IW.IW_KEYS.maps, "InnerWorldMap");
  const refresh = () => qc.invalidateQueries({ queryKey: IW.IW_KEYS.maps });

  return {
    maps: maps.filter((m) => !m.is_archived).sort(byOrder),
    archivedMaps: maps.filter((m) => m.is_archived).sort(byOrder),
    isLoading,
    createMap: async (name) => { const m = await IW.createMap(name); qc.invalidateQueries({ queryKey: IW.IW_KEYS.layers }); refresh(); return m; },
    renameMap: async (id, name) => { await IW.renameMap(id, name); refresh(); },
    reorderMaps: async (ids) => { await IW.reorderMaps(ids); refresh(); },
    archiveMap: async (id, a = true) => { await IW.archiveMap(id, a); refresh(); },
    deleteMap: async (id) => { await IW.deleteMap(id); qc.invalidateQueries(); },
  };
}

export function useInnerWorld(mapId) {
  const qc = useQueryClient();
  const layersQ = useEntityList(IW.IW_KEYS.layers, "InnerWorldLayer");
  const locationsQ = useEntityList(IW.IW_KEYS.locations, "InnerWorldLocation");
  const imagesQ = useEntityList(IW.IW_KEYS.images, "InnerWorldImage");
  const placementsQ = useEntityList(IW.IW_KEYS.placements, "InnerWorldPlacement");

  const inv = (key) => qc.invalidateQueries({ queryKey: key });
  const scoped = (rows) => (rows || []).filter((r) => r.map_id === mapId);

  const layers = scoped(layersQ.data).sort(byOrder);
  const locations = scoped(locationsQ.data);
  const images = scoped(imagesQ.data).sort(byOrder);
  const placements = scoped(placementsQ.data);

  return {
    layers,
    locations,
    images,
    placements,
    isLoading: layersQ.isLoading || locationsQ.isLoading || imagesQ.isLoading || placementsQ.isLoading,

    // Layers
    createLayer: async (name) => { const l = await IW.createLayer(mapId, name); inv(IW.IW_KEYS.layers); return l; },
    renameLayer: async (id, name) => { await IW.renameLayer(id, name); inv(IW.IW_KEYS.layers); },
    setLayerVisible: async (id, v) => { await IW.setLayerVisible(id, v); inv(IW.IW_KEYS.layers); },
    setLayerLocked: async (id, v) => { await IW.setLayerLocked(id, v); inv(IW.IW_KEYS.layers); },
    reorderLayers: async (ids) => { await IW.reorderLayers(ids); inv(IW.IW_KEYS.layers); },
    deleteLayer: async (id) => { await IW.deleteLayer(id); inv(IW.IW_KEYS.layers); inv(IW.IW_KEYS.locations); inv(IW.IW_KEYS.images); inv(IW.IW_KEYS.placements); },

    // Backdrop images
    createImage: async (layerId, fields) => { const im = await IW.createImage(mapId, layerId, fields); inv(IW.IW_KEYS.images); return im; },
    updateImage: async (id, fields) => { await IW.updateImage(id, fields); inv(IW.IW_KEYS.images); },
    deleteImage: async (id) => { await IW.deleteImage(id); inv(IW.IW_KEYS.images); },
    reorderImages: async (ids) => { await IW.reorderImages(ids); inv(IW.IW_KEYS.images); },

    // Locations (+ links)
    createLocation: async (layerId, fields) => { const loc = await IW.createLocation(mapId, layerId, fields); inv(IW.IW_KEYS.locations); return loc; },
    updateLocation: async (id, fields) => { await localEntities.InnerWorldLocation.update(id, fields); inv(IW.IW_KEYS.locations); },
    deleteLocation: async (id) => { await localEntities.InnerWorldLocation.delete(id); inv(IW.IW_KEYS.locations); },
    setLocationLink: async (id, type, targetId) => { await IW.setLocationLink(id, type, targetId); inv(IW.IW_KEYS.locations); },
    clearLocationLink: async (id) => { await IW.clearLocationLink(id); inv(IW.IW_KEYS.locations); },
    resolveLocationLink: IW.resolveLocationLink,

    // Alter placements (multi-layer aware)
    placeAlter: async (alterId, layerId, x, y) => { const p = await IW.placeAlter(alterId, mapId, layerId, x, y); inv(IW.IW_KEYS.placements); return p; },
    moveAlterPlacement: async (id, x, y) => { await IW.moveAlterPlacement(id, x, y); inv(IW.IW_KEYS.placements); },
    setPlacementLocked: async (id, locked) => { await IW.setPlacementLocked(id, locked); inv(IW.IW_KEYS.placements); },
    removePlacement: async (id) => { await IW.removePlacement(id); inv(IW.IW_KEYS.placements); },
  };
}

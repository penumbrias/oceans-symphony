import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { MapPin, Map as MapIcon, Layers, ChevronRight } from "lucide-react";
import { useTerms } from "@/lib/useTerms";

// "Locations" tab for an alter profile — every inner-world location this alter
// is within, plus the maps/layers it's placed on. Two ways an alter is "within"
// a location:
//   • Direct assignment — alter.inner_world_location_id === location.id.
//   • Spatial containment — one of the alter's placements (x,y) sits inside a
//     location's box on the same layer (this is what you SEE on the map: the
//     alter's dot sitting inside a named region).
// Layers the alter is placed on but inside no location are surfaced separately
// so the user can still jump to the map. Read-only; links out to each
// location's profile (/location/:id) and to the map on the right layer.
export default function LocationsTab({ alter }) {
  const t = useTerms();
  const navigate = useNavigate();

  const { data: locations = [] } = useQuery({ queryKey: ["innerWorldLocations"], queryFn: () => base44.entities.InnerWorldLocation.list() });
  const { data: maps = [] } = useQuery({ queryKey: ["innerWorldMaps"], queryFn: () => base44.entities.InnerWorldMap.list() });
  const { data: layers = [] } = useQuery({ queryKey: ["innerWorldLayers"], queryFn: () => base44.entities.InnerWorldLayer.list() });
  const { data: placements = [] } = useQuery({ queryKey: ["innerWorldPlacements"], queryFn: () => base44.entities.InnerWorldPlacement.list() });

  const mapName = (id) => maps.find((m) => m.id === id)?.name || "Map";
  const layerName = (id) => layers.find((l) => l.id === id)?.name || "Layer";
  const layerMapId = (id) => layers.find((l) => l.id === id)?.map_id;

  const contains = (loc, p) => {
    const lx = loc.x ?? 0, ly = loc.y ?? 0, lw = loc.width || 200, lh = loc.height || 150;
    return p.x >= lx && p.x <= lx + lw && p.y >= ly && p.y <= ly + lh;
  };

  const { withinLocations, placedOn } = useMemo(() => {
    const within = new Map();
    if (alter?.inner_world_location_id) {
      const loc = locations.find((l) => l.id === alter.inner_world_location_id);
      if (loc) within.set(loc.id, loc);
    }
    const mine = placements.filter((p) => p.alter_id === alter?.id);
    for (const p of mine) {
      for (const loc of locations) {
        if (loc.layer_id === p.layer_id && contains(loc, p)) within.set(loc.id, loc);
      }
    }
    // Layers with a placement that isn't inside any of this alter's locations.
    const placedLayerIds = new Set();
    for (const p of mine) {
      const inside = locations.some((loc) => loc.layer_id === p.layer_id && within.has(loc.id) && contains(loc, p));
      if (!inside && p.layer_id) placedLayerIds.add(p.layer_id);
    }
    return {
      withinLocations: [...within.values()],
      placedOn: [...placedLayerIds].map((lid) => ({ layerId: lid, mapId: layerMapId(lid) })),
    };
  }, [alter, locations, placements, layers]);

  const openMap = (mapId, layerId) => {
    let url = "/system-map?view=inner";
    if (mapId) url += `&map=${encodeURIComponent(mapId)}`;
    if (layerId) url += `&layer=${encodeURIComponent(layerId)}&solo=1`;
    navigate(url);
  };

  if (!withinLocations.length && !placedOn.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/15 px-6 py-12 text-center">
        <MapPin className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">Not on the inner world map yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Place this {t.alter} on the {t.System} Map and any locations they're inside will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {withinLocations.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Locations {t.alter} is in{withinLocations.length > 1 ? ` (${withinLocations.length})` : ""}
          </p>
          <div className="space-y-2">
            {withinLocations.map((loc) => {
              const scope = [mapName(loc.map_id), layerName(loc.layer_id)].filter(Boolean).join(" · ");
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => navigate(`/location/${loc.id}`)}
                  aria-label={`Open location ${loc.name}`}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card hover:bg-muted/40 transition-colors text-left min-h-[44px]"
                  style={{ borderLeftColor: loc.color || "transparent", borderLeftWidth: loc.color ? 3 : 1 }}
                >
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: loc.color || "#6366f1" }}>
                    <MapPin className="w-4 h-4 text-white" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{loc.name || "Untitled location"}</span>
                    {scope && <span className="block text-xs text-muted-foreground truncate">{scope}</span>}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {placedOn.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Also placed on</p>
          <div className="space-y-2">
            {placedOn.map(({ layerId, mapId }) => (
              <button
                key={layerId}
                type="button"
                onClick={() => openMap(mapId, layerId)}
                aria-label={`Open ${mapName(mapId)} on layer ${layerName(layerId)}`}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card hover:bg-muted/40 transition-colors text-left min-h-[44px]"
              >
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted/50">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{layerName(layerId)}</span>
                  <span className="block text-xs text-muted-foreground truncate flex items-center gap-1">
                    <MapIcon className="w-3 h-3" /> {mapName(mapId)}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

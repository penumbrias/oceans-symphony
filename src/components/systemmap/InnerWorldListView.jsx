// Accessible LIST alternative to the SVG inner-world canvas (InnerWorldMapV2).
//
// The freeform SVG canvas is invisible to screen readers and unusable with a
// keyboard or at very large zoom — a complex graphic with no text equivalent
// (WCAG 1.1.1). This renders the same data as a semantic, navigable index:
// every map → its layers → the locations on them, each a real link to that
// location's (already-accessible) profile page, with its category colour,
// alters-here count, sub-location count, and link target surfaced as text.
//
// Purely additive: it reads the same entities the canvas does and writes
// nothing. SystemMap.jsx toggles between this and the canvas (and defaults to
// this when Accessibility mode is on).
//
// Grouping mirrors the canvas + LocationProfile semantics exactly:
//   • map_id / layer_id scope locations to a map + layer.
//   • alters "here" = alters whose inner_world_location_id === location.id.
//   • sub-locations = same-map locations whose box sits inside this one
//     (coordinate containment, identical to LocationProfile.getParent).
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Map as MapIcon, Layers, ChevronRight, MapPin } from "lucide-react";
import { useTerms } from "@/lib/useTerms";

const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

// Same containment test LocationProfile uses, just batched: returns a Map of
// location id → number of direct sub-locations.
function buildSubCounts(locations) {
  const byMap = new Map();
  for (const l of locations) {
    const k = l.map_id || "__none__";
    if (!byMap.has(k)) byMap.set(k, []);
    byMap.get(k).push(l);
  }
  const parentOf = (loc, sameMap) => {
    const sorted = [...sameMap].sort((a, b) => (b.order || 0) - (a.order || 0));
    for (const p of sorted) {
      if (p.id === loc.id) continue;
      if (
        loc.x >= p.x && loc.x + (loc.width || 200) <= p.x + (p.width || 200) &&
        loc.y >= p.y && loc.y + (loc.height || 150) <= p.y + (p.height || 150)
      ) return p;
    }
    return null;
  };
  const counts = new Map();
  for (const [, sameMap] of byMap) {
    for (const loc of sameMap) {
      const p = parentOf(loc, sameMap);
      if (p) counts.set(p.id, (counts.get(p.id) || 0) + 1);
    }
  }
  return counts;
}

export default function InnerWorldListView({ maps = [], layers = [], locations = [], alters = [] }) {
  const terms = useTerms();
  const navigate = useNavigate();

  const altersByLoc = useMemo(() => {
    const m = new Map();
    for (const a of alters) {
      if (a.is_archived) continue;
      const lid = a.inner_world_location_id;
      if (!lid) continue;
      m.set(lid, (m.get(lid) || 0) + 1);
    }
    return m;
  }, [alters]);

  const subCounts = useMemo(() => buildSubCounts(locations), [locations]);
  const mapName = (id) => maps.find((m) => m.id === id)?.name || "Map";
  const layerName = (id) => layers.find((l) => l.id === id)?.name || "Layer";

  // Build the grouped tree: known maps (ordered) → their layers (ordered) →
  // matching locations, plus an "unsorted" bucket per map for locations whose
  // layer is missing, plus a final "Other" section for orphaned map_ids.
  const sections = useMemo(() => {
    const knownMapIds = new Set(maps.map((m) => m.id));
    const out = [];

    for (const map of [...maps].sort(byOrder)) {
      const mapLocs = locations.filter((l) => l.map_id === map.id);
      if (!mapLocs.length) continue;
      const mapLayers = layers.filter((l) => l.map_id === map.id).sort(byOrder);
      const layerIds = new Set(mapLayers.map((l) => l.id));
      const groups = [];
      for (const layer of mapLayers) {
        const locs = mapLocs.filter((l) => l.layer_id === layer.id);
        if (locs.length) groups.push({ key: layer.id, name: layer.name || "Layer", locs });
      }
      const unsorted = mapLocs.filter((l) => !l.layer_id || !layerIds.has(l.layer_id));
      if (unsorted.length) groups.push({ key: `${map.id}__unsorted`, name: "Unsorted", locs: unsorted });
      if (groups.length) out.push({ key: map.id, name: map.name || "Map", groups });
    }

    // Locations whose map_id points nowhere (or is empty) — surface them so
    // nothing is hidden from the accessible view.
    const orphans = locations.filter((l) => !l.map_id || !knownMapIds.has(l.map_id));
    if (orphans.length) {
      out.push({ key: "__orphans__", name: "Other locations", groups: [{ key: "__orphans__", name: "", locs: orphans }] });
    }
    return out;
  }, [maps, layers, locations]);

  const linkTextFor = (loc) => {
    if (loc.link_target_type === "map") return `→ ${mapName(loc.link_target_id)} (map)`;
    if (loc.link_target_type === "layer") return `→ ${layerName(loc.link_target_id)} (layer)`;
    return null;
  };

  const totalLocations = locations.length;

  if (!totalLocations) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/15 px-6 py-12 text-center">
        <MapPin className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">No locations yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Switch to the canvas to add places to your {terms.system}'s inner world — they'll be listed here too.
        </p>
      </div>
    );
  }

  return (
    <div role="region" aria-label={`Inner world locations, list view`} className="space-y-4">
      {sections.map((section) => {
        const count = section.groups.reduce((n, g) => n + g.locs.length, 0);
        return (
          <section key={section.key} aria-label={section.name} className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/20">
              <MapIcon className="w-4 h-4 text-primary/70 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-foreground flex-1 min-w-0 truncate">{section.name}</h2>
              <span className="text-xs text-muted-foreground flex-shrink-0">{count} {count === 1 ? "location" : "locations"}</span>
            </div>
            <div className="p-2 space-y-3">
              {section.groups.map((group) => (
                <div key={group.key}>
                  {group.name && (
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 mb-1 flex items-center gap-1.5">
                      <Layers className="w-3 h-3 flex-shrink-0" /> {group.name}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {[...group.locs].sort(byOrder).map((loc) => {
                      const here = altersByLoc.get(loc.id) || 0;
                      const subs = subCounts.get(loc.id) || 0;
                      const link = linkTextFor(loc);
                      const meta = [
                        here > 0 ? `${here} ${here === 1 ? terms.alter : terms.alters}` : null,
                        subs > 0 ? `${subs} sub-location${subs === 1 ? "" : "s"}` : null,
                        link,
                      ].filter(Boolean);
                      return (
                        <li key={loc.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/location/${loc.id}`)}
                            aria-label={`${loc.name}${meta.length ? ", " + meta.join(", ") : ""}. Open location.`}
                            className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border border-border/50 bg-card hover:bg-muted/40 transition-colors text-left min-h-[44px]"
                            style={{ borderLeftColor: loc.color || "transparent", borderLeftWidth: loc.color ? 3 : 1 }}
                          >
                            <span className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: loc.color || "#6366f1" }} aria-hidden="true" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-medium truncate">{loc.name || "Untitled location"}</span>
                              {meta.length > 0 && (
                                <span className="block text-xs text-muted-foreground">{meta.join(" · ")}</span>
                              )}
                            </span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

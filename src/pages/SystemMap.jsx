import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";
import AnalyticsMap from "@/components/system/SystemMap";
// Inner World tab uses the new layered/multi-map canvas (InnerWorldMapV2,
// built on innerWorldModel + useInnerWorld). The legacy single-placement
// InnerWorldMap.jsx is kept in the repo as a one-line rollback if needed.
import InnerWorldMap from "@/components/systemmap/InnerWorldMapV2";
import InnerWorldListView from "@/components/systemmap/InnerWorldListView";
import RelationshipsPanel from "@/components/systemmap/RelationshipsPanel";
import { useTerms } from "@/lib/useTerms";
import { getAccessibilitySettings } from "@/lib/useAccessibility";
import { useSearchParams } from "react-router-dom";
import { Map, Globe, List, LayoutGrid } from "lucide-react";

const localMode = isLocalMode ? isLocalMode() : false;
const db = localMode ? localEntities : base44.entities;

// Hard ceiling above which we don't even try to build the analytics
// map. The compute now runs in a Web Worker so the main thread stays
// responsive at any size, BUT the worker itself can still take many
// The hard size pre-empt is GONE (v0.73.8): the map itself now caps how
// many members it draws at once (top-N by front time by default, with a
// Display panel for the metric / N / hand-picking — see AUTO_DISPLAY_LIMIT
// in components/system/SystemMap.jsx), so any system size renders a
// bounded number of nodes. The error boundary below stays as
// defense-in-depth for genuine render crashes.

export default function SystemMapPage() {
  const terms = useTerms();
  // Deep-link support: a location's "open on map" / layer-link from its profile
  // navigates here with ?view=inner&map=…&layer=…&solo=1 so it opens on the
  // Inner World tab focused on that map/layer (instead of the Analytics tab).
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("view") === "inner" ? "inner" : "analytics");
  const initialMapId = searchParams.get("map") || null;
  const initialLayerId = searchParams.get("layer") || null;
  const initialSolo = searchParams.get("solo") === "1";

  const { data: allAlters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => db.Alter.list(),
  });
  const { data: mapGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => db.Group.list(),
  });
  // Group config: members of a group flagged "hide_from_system_maps" don't
  // appear on any of the map tabs.
  const alters = useMemo(() => {
    const hidden = getAlterIdsByGroupFlag(mapGroups, allAlters, "hide_from_system_maps");
    return hidden.size ? allAlters.filter((a) => !hidden.has(a.id)) : allAlters;
  }, [allAlters, mapGroups]);

  const { data: relationships = [], refetch: refetchRelationships } = useQuery({
    queryKey: ["alterRelationships"],
    queryFn: () => base44.entities.AlterRelationship.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["innerWorldLocations"],
    queryFn: () => base44.entities.InnerWorldLocation.list(),
  });
  const { data: maps = [] } = useQuery({
    queryKey: ["innerWorldMaps"],
    queryFn: () => base44.entities.InnerWorldMap.list(),
  });
  const { data: layers = [] } = useQuery({
    queryKey: ["innerWorldLayers"],
    queryFn: () => base44.entities.InnerWorldLayer.list(),
  });

  // Canvas vs accessible List view for the Inner World tab. Defaults to the
  // list when Accessibility mode is on (the SVG canvas is hard to use with a
  // screen reader / keyboard / large zoom); everyone can toggle freely.
  const [innerView, setInnerView] = useState(() => (getAccessibilitySettings().a11yMode ? "list" : "canvas"));

  return (
    <div data-tour="system-map-canvas" className="flex flex-col gap-3 pb-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-foreground">{terms.System} Structure Map</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {tab === "analytics"
            ? `Shows every ${terms.alter} sized by fronting time. Select one to reposition others by how often they co-fronted — closer means more overlap.`
            : `Freeform inner world canvas. Drag ${terms.alters} to place them, double-click to create relationships.`}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("analytics")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "analytics" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Map className="w-4 h-4" /> Analytics Map
        </button>
        <button
          onClick={() => setTab("inner")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "inner" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Globe className="w-4 h-4" /> Inner World
        </button>
      </div>

      {/* Inner World: canvas vs accessible list toggle */}
      {tab === "inner" && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit" role="group" aria-label="Inner world view">
            <button
              onClick={() => setInnerView("canvas")}
              aria-pressed={innerView === "canvas"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${innerView === "canvas" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <LayoutGrid className="w-3.5 h-3.5" /> Canvas
            </button>
            <button
              onClick={() => setInnerView("list")}
              aria-pressed={innerView === "list"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${innerView === "list" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <List className="w-3.5 h-3.5" /> List
            </button>
          </div>
          {innerView === "list" && (
            <p className="text-xs text-muted-foreground">A screen-reader-friendly index of every location.</p>
          )}
        </div>
      )}

      {/* Map area */}
      {tab === "analytics" && (
        <div className="h-[calc(100vh-280px)] min-h-[400px]">
          <AnalyticsMapErrorBoundary
            fallback={
              <AnalyticsMapTooLargeFallback
                systemTerm={terms.system}
                alterCount={alters.length}
                onUseInnerWorld={() => setTab("inner")}
              />
            }
          >
            <AnalyticsMap relationships={relationships} />
          </AnalyticsMapErrorBoundary>
        </div>
      )}
      {tab === "inner" && (
        innerView === "list" ? (
          <InnerWorldListView maps={maps} layers={layers} locations={locations} alters={alters} />
        ) : (
          <div className="h-[calc(100vh-280px)] min-h-[400px]">
            <InnerWorldMap
              alters={alters}
              relationships={relationships}
              onRefreshRelationships={refetchRelationships}
              initialMapId={initialMapId}
              initialLayerId={initialLayerId}
              initialSolo={initialSolo}
            />
          </div>
        )
      )}

      {/* Relationships panel — always visible below both maps */}
      <RelationshipsPanel
        relationships={relationships}
        alters={alters}
        locations={locations}
        onRefreshRelationships={refetchRelationships}
      />
    </div>
  );
}

// Class boundary — catches render errors from AnalyticsMap so a crash
// in that component never takes the whole SystemMap page down. The
// Inner World tab needs to stay reachable for users whose analytics
// map can't render. Errors are logged so we can find the root cause
// later; the user just sees the friendly fallback.
class AnalyticsMapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    // Surface in the console so testers reporting "the map didn't load"
    // have something to attach to bug reports.
    console.error("[AnalyticsMap] render failed:", error, info);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function AnalyticsMapTooLargeFallback({ systemTerm, alterCount, onUseInnerWorld }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12 rounded-xl border border-dashed border-border/60 bg-muted/15">
      <Map className="w-10 h-10 text-muted-foreground/50 mb-3" />
      <p className="text-base font-semibold text-foreground mb-1.5">
        Analytics map is taking a breather
      </p>
      <p className="text-sm text-muted-foreground max-w-md mb-5">
        Something went wrong drawing your {systemTerm}'s map{typeof alterCount === "number" && alterCount > 0 ? ` (${alterCount} active alters)` : ""}. Reloading usually fixes it — if it keeps happening, please send a bug report.
      </p>
      <button
        onClick={onUseInnerWorld}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
      >
        <Globe className="w-4 h-4" /> Switch to Inner World map
      </button>
    </div>
  );
}
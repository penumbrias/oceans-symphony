import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import AnalyticsMap from "@/components/system/SystemMap";
import InnerWorldMap from "@/components/systemmap/InnerWorldMap";
import RelationshipsPanel from "@/components/systemmap/RelationshipsPanel";
import { useTerms } from "@/lib/useTerms";
import { Map, Globe } from "lucide-react";

const localMode = isLocalMode ? isLocalMode() : false;
const db = localMode ? localEntities : base44.entities;

// Hard ceiling above which we don't even try to build the analytics
// map. The compute now runs in a Web Worker so the main thread stays
// responsive at any size, BUT the worker itself can still take many
// minutes on truly extreme systems (the cofronting computation is
// O(slices × alters²) inside the worker just like it was on main).
// At ~500 alters the worker would likely run for several minutes —
// the friendly "taking a breather" fallback is a better experience
// than a spinner that never resolves. Below this, the worker handles
// it; the error boundary still wraps the render as defense-in-depth.
const ANALYTICS_MAP_TOO_LARGE_THRESHOLD = 500;

export default function SystemMapPage() {
  const terms = useTerms();
  const [tab, setTab] = useState("analytics");

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => db.Alter.list(),
  });

  const { data: relationships = [], refetch: refetchRelationships } = useQuery({
    queryKey: ["alterRelationships"],
    queryFn: () => base44.entities.AlterRelationship.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["innerWorldLocations"],
    queryFn: () => base44.entities.InnerWorldLocation.list(),
  });

  return (
    <div data-tour="system-map-canvas" className="flex flex-col gap-3 pb-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{terms.System} Structure Map</h1>
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

      {/* Map area */}
      <div className="h-[calc(100vh-280px)] min-h-[400px]">
        {tab === "analytics" && (
          alters.length > ANALYTICS_MAP_TOO_LARGE_THRESHOLD ? (
            <AnalyticsMapTooLargeFallback
              systemTerm={terms.system}
              alterCount={alters.length}
              onUseInnerWorld={() => setTab("inner")}
            />
          ) : (
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
          )
        )}
        {tab === "inner" && (
          <InnerWorldMap
            alters={alters}
            relationships={relationships}
            onRefreshRelationships={refetchRelationships}
          />
        )}
      </div>

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
      <p className="text-sm text-muted-foreground max-w-md mb-2">
        It looks like your {systemTerm} might be too large for the analytics map at this time, we're working on it!
      </p>
      {typeof alterCount === "number" && alterCount > 0 && (
        <p className="text-xs text-muted-foreground/70 mb-5">
          ({alterCount} active alters — the analytics layout struggles past ~{ANALYTICS_MAP_TOO_LARGE_THRESHOLD}.)
        </p>
      )}
      <button
        onClick={onUseInnerWorld}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
      >
        <Globe className="w-4 h-4" /> Switch to Inner World map
      </button>
    </div>
  );
}
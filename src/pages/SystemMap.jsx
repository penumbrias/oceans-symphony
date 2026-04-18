import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import AnalyticsMap from "@/components/system/SystemMap";
import InnerWorldMap from "@/components/systemmap/InnerWorldMap";
import { useTerms } from "@/lib/useTerms";
import { Map, Globe } from "lucide-react";

const localMode = isLocalMode ? isLocalMode() : false;
const db = localMode ? localEntities : base44.entities;

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

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col gap-3">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{terms.System} Structure Map</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {tab === "analytics"
            ? `Co-${terms.front} analytics map. Click an ${terms.alter} to see relationships.`
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

      <div className="flex-1 min-h-0">
        {tab === "analytics" && <AnalyticsMap relationships={relationships} />}
        {tab === "inner" && (
          <InnerWorldMap
            alters={alters}
            relationships={relationships}
            onRefreshRelationships={refetchRelationships}
          />
        )}
      </div>
    </div>
  );
}
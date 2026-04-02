import React from "react";
import SystemMap from "@/components/system/SystemMap";
import { useTerms } from "@/lib/useTerms";

export default function SystemMapPage() {
  const terms = useTerms();
  return (
    <div className="h-[calc(100vh-120px)]">
      <div className="h-full flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{terms.System} Structure Map</h1>
          <p className="text-muted-foreground mt-1">Interactive visualization of your {terms.system}'s {terms.alters} and groups</p>
        </div>
        <div className="flex-1 min-h-0">
          <SystemMap />
        </div>
      </div>
    </div>
  );
}
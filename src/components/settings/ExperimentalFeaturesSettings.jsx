import React from "react";
import { Switch } from "@/components/ui/switch";
import { useExperimentalOn, setExperimentalOn } from "@/lib/experimentalFeatures";

// The one switch for features that are still settling (src/lib/experimentalFeatures.js).
export default function ExperimentalFeaturesSettings() {
  const on = useExperimentalOn();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Show experimental features</p>
          <p className="text-xs text-muted-foreground">Needs, Goals and Mods. They're still being worked on and may change.</p>
        </div>
        <Switch checked={on} onCheckedChange={(next) => setExperimentalOn(next)} aria-label="Show experimental features" />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Turning this off only hides them. Anything you made in them stays saved, in your backups too, and comes back when you turn it on again.
      </p>
    </div>
  );
}

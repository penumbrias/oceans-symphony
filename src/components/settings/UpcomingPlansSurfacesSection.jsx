import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ALL_SURFACES, DEFAULT_SURFACES } from "@/lib/upcomingPlansSurfaces";
import { toast } from "sonner";

/**
 * Settings → Appearance subsection: pick where Upcoming Plans render.
 * Stored on SystemSettings.upcoming_plans_surfaces (string[]).
 */
export default function UpcomingPlansSurfacesSection() {
  const qc = useQueryClient();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsList[0] || null;

  const [enabled, setEnabled] = useState(() => new Set(settings?.upcoming_plans_surfaces || DEFAULT_SURFACES));

  // Re-sync if the underlying settings change (theme swap, fronter swap with
  // a preset, or another tab updates it).
  useEffect(() => {
    if (!settings) return;
    const next = settings.upcoming_plans_surfaces;
    if (Array.isArray(next)) setEnabled(new Set(next));
  }, [settings?.upcoming_plans_surfaces]);

  const toggle = async (id) => {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEnabled(next);
    const list = Array.from(next);
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { upcoming_plans_surfaces: list });
      } else {
        await base44.entities.SystemSettings.create({ upcoming_plans_surfaces: list });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      toast.error(e.message || "Couldn't update");
      // Roll back on failure
      setEnabled(new Set(settings?.upcoming_plans_surfaces || DEFAULT_SURFACES));
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5" /> Upcoming plans visibility
      </p>
      <p className="text-xs text-muted-foreground -mt-1">
        Pick where the planned-activity widget should surface. The Activity Tracker's Planned tab is always on. Per-alter "Plans for me" is on by default — it's contextual and low-clutter.
      </p>
      <div className="space-y-2 mt-2">
        {ALL_SURFACES.map(s => (
          <label
            key={s.id}
            className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-border/50 bg-card cursor-pointer"
          >
            <Switch
              checked={enabled.has(s.id)}
              onCheckedChange={() => toggle(s.id)}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.hint}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

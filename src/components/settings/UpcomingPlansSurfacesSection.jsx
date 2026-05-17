import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ALL_SURFACES, DEFAULT_SURFACES } from "@/lib/upcomingPlansSurfaces";
import {
  COUNT_MAX,
  COUNT_MIN,
  MODE_COUNT,
  MODE_WINDOW,
  WINDOW_OPTIONS,
  getLimitCount,
  getLimitMode,
  getLimitWindowId,
  setLimitCount,
  setLimitMode,
  setLimitWindowId,
} from "@/lib/upcomingPlansLimit";
import { toast } from "sonner";

/**
 * Settings → Appearance subsection: pick where Upcoming Plans render
 * AND how many to show / over what time window.
 *
 * Surface toggles persist on SystemSettings.upcoming_plans_surfaces.
 * The count/window limit persists in localStorage (see
 * src/lib/upcomingPlansLimit.js) so it can travel separately and
 * doesn't bloat the singleton SystemSettings entity.
 */
export default function UpcomingPlansSurfacesSection() {
  const qc = useQueryClient();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsList[0] || null;

  const [enabled, setEnabled] = useState(() => new Set(settings?.upcoming_plans_surfaces || DEFAULT_SURFACES));

  // Limit-mode state lives in localStorage; mirror it in component state
  // so the UI re-renders immediately when the user toggles.
  const [mode, setModeState] = useState(() => getLimitMode());
  const [count, setCountState] = useState(() => getLimitCount());
  const [windowId, setWindowIdState] = useState(() => getLimitWindowId());

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

  // Dispatch a synthetic event so any open UpcomingPlans widget re-reads
  // the limit setting without waiting for a hard refresh.
  const broadcastLimitChange = () => {
    try {
      window.dispatchEvent(new Event("upcoming-plans-limit-changed"));
    } catch {
      // Ignore: in extremely old environments Event() may not exist.
    }
  };

  const handleModeChange = (nextMode) => {
    setModeState(nextMode);
    setLimitMode(nextMode);
    broadcastLimitChange();
  };

  const handleCountChange = (raw) => {
    const n = Math.max(COUNT_MIN, Math.min(COUNT_MAX, parseInt(raw, 10) || COUNT_MIN));
    setCountState(n);
    setLimitCount(n);
    broadcastLimitChange();
  };

  const handleWindowChange = (id) => {
    setWindowIdState(id);
    setLimitWindowId(id);
    broadcastLimitChange();
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

      {/* Limit setting — controls how many plans the widget shows. */}
      <div className="mt-4 pt-3 border-t border-border/40 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          How many to show
        </p>
        <p className="text-xs text-muted-foreground -mt-1">
          Limit the widget either by count (the next N plans) or by time window (plans in the next few days/weeks). The other mode's value is preserved if you switch back.
        </p>

        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => handleModeChange(MODE_COUNT)}
            className={`flex-1 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
              mode === MODE_COUNT
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            By count
          </button>
          <button
            type="button"
            onClick={() => handleModeChange(MODE_WINDOW)}
            className={`flex-1 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
              mode === MODE_WINDOW
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            By time window
          </button>
        </div>

        {mode === MODE_COUNT ? (
          <div className="px-3 py-3 rounded-xl border border-border/50 bg-card space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Show next {count} plans</p>
              <input
                type="number"
                min={COUNT_MIN}
                max={COUNT_MAX}
                value={count}
                onChange={(e) => handleCountChange(e.target.value)}
                className="w-16 px-2 py-1 rounded-md border border-border bg-background text-sm text-right"
              />
            </div>
            <input
              type="range"
              min={COUNT_MIN}
              max={COUNT_MAX}
              value={count}
              onChange={(e) => handleCountChange(e.target.value)}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[0.6875rem] text-muted-foreground">
              <span>{COUNT_MIN}</span>
              <span>{COUNT_MAX}</span>
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 rounded-xl border border-border/50 bg-card">
            <p className="text-sm font-medium mb-2">Show plans within</p>
            <div className="flex flex-wrap gap-2">
              {WINDOW_OPTIONS.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => handleWindowChange(w.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    windowId === w.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

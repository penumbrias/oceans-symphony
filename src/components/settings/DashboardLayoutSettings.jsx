import React, { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowUp, ArrowDown, Lock, LayoutGrid } from "lucide-react";
import { DASHBOARD_ELEMENTS, DEFAULT_LAYOUT, resolveLayout } from "@/lib/dashboardLayout";
import { toast } from "sonner";

// Lets the user reorder + toggle each element on the dashboard. The
// reorder UI is currently up/down arrows — same pattern the rest of
// Settings → Appearance uses (NavigationSettings / QuickActionsConfig).
// True touch-drag could come later; arrows are reliable on every
// browser + WebView and don't fight scroll gestures.
//
// Layout writes broadcast a window event so the live Dashboard
// re-renders without needing a full page reload (matches the
// UpcomingPlansSurfacesSection pattern).
export default function DashboardLayoutSettings() {
  const queryClient = useQueryClient();
  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const record = settings[0] || null;

  const layout = useMemo(
    () => resolveLayout(record?.dashboard_layout),
    [record?.dashboard_layout]
  );

  const persist = async (nextLayout) => {
    if (record?.id) {
      await base44.entities.SystemSettings.update(record.id, { dashboard_layout: nextLayout });
    } else {
      await base44.entities.SystemSettings.create({ dashboard_layout: nextLayout });
    }
    queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    try {
      window.dispatchEvent(new CustomEvent("dashboard-layout-changed"));
    } catch { /* ignore */ }
  };

  const swap = (idx, delta) => {
    const target = idx + delta;
    if (target < 0 || target >= layout.length) return;
    const next = layout.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    persist(next);
  };

  const toggle = (id, enabled) => {
    const next = layout.map((e) => (e.id === id ? { ...e, enabled } : e));
    persist(next);
  };

  const resetToDefault = async () => {
    await persist(DEFAULT_LAYOUT.map((e) => ({ ...e })));
    toast.success("Dashboard layout reset to default");
  };

  return (
    <section className="space-y-3 border-t border-border/30 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-muted-foreground" />
            Dashboard layout
          </h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Reorder the elements on the dashboard with the arrows, and
            switch any block off if you don't want it. The Quick-Nav
            grid + search are always on but can be moved.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetToDefault} className="text-xs flex-shrink-0">
          Reset
        </Button>
      </div>

      <div className="space-y-1.5">
        {layout.map((entry, idx) => {
          const meta = DASHBOARD_ELEMENTS[entry.id];
          if (!meta) return null;
          const locked = !!meta.locked;
          return (
            <div
              key={entry.id}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                entry.enabled ? "bg-card border-border/50" : "bg-muted/20 border-border/30 opacity-70"
              }`}
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => swap(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="w-7 h-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => swap(idx, 1)}
                  disabled={idx === layout.length - 1}
                  aria-label="Move down"
                  className="w-7 h-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">{meta.label}</p>
                  {locked && (
                    <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" aria-label="Always shown" />
                  )}
                </div>
                {meta.description && (
                  <p className="text-[0.6875rem] text-muted-foreground mt-0.5 leading-snug">{meta.description}</p>
                )}
              </div>
              {locked ? (
                <span className="text-[0.625rem] text-muted-foreground uppercase tracking-wide flex-shrink-0">
                  Always on
                </span>
              ) : (
                <Switch
                  checked={entry.enabled}
                  onCheckedChange={(v) => toggle(entry.id, v)}
                  aria-label={`Toggle ${meta.label}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

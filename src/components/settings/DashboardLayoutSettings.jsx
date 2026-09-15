import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LayoutGrid, Pencil } from "lucide-react";
import { CLASSIC_TO_V2_WIDGET } from "@/lib/widgetRegistry";
import { V2_WIDGETS, seedV2Home } from "@/v2/widgets";
import { seedClassicHome } from "@/components/dashboard/ClassicHomeCanvas";
import { newInstanceId, newPageId } from "@/lib/experimentalHome";
import { DEFAULT_LAYOUT } from "@/lib/dashboardLayout";
import { toast } from "sonner";
import { UI_V2_ENABLED } from "@/lib/featureFlags";

// (The old drag/drop pill editor lived here — the home screen is
// edited in place on the board canvas now.)

// The New-UI opt-in, on its own so onboarding can offer it too. Same
// record, same write, one implementation.
export function NewUiToggle() {
  const queryClient = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const record = rows[0];
  const on = record?.ui_v2?.enabled === true;
  const toggle = async (next) => {
    try {
      const patch = { ...(record?.ui_v2 || {}), enabled: next };
      if (record?.id) await base44.entities.SystemSettings.update(record.id, { ui_v2: patch });
      else await base44.entities.SystemSettings.create({ ui_v2: patch });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast.success(next ? "New UI on" : "Classic navigation restored");
    } catch (e) {
      toast.error(e?.message || "Couldn't switch");
    }
  };
  if (!UI_V2_ENABLED) return null;
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 cursor-pointer">
      <div className="min-w-0">
        <span className="text-sm font-medium">New home screen</span>
        <p className="text-xs text-muted-foreground mt-0.5">
          Build your home screen from widgets. Switch back any time.
        </p>
      </div>
      <Switch checked={on} onCheckedChange={toggle} />
    </label>
  );
}

// The classic-hosted v2 bars, on their own so the setup guide can offer
// them too. Same record, same writes, one implementation. Reads/writes
// ui_v2.classicBars (+ the board's altersBar.enabled for the pinned bar,
// which is the same bar the widget board shows — one switch, one truth).
export function ClassicBarsToggles() {
  const queryClient = useQueryClient();
  const t = useTerms();
  const { data: rows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const record = rows[0];
  const cb = record?.ui_v2?.classicBars || {};
  const topOn = cb.top === true;
  const bottomOn = cb.bottom !== false;
  const actionsOn = cb.actions !== false;
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const homeField = wide ? "ui_v2_home_desktop" : "ui_v2_home";
  const altersOn = cb.alters !== false && record?.[homeField]?.altersBar?.enabled === true;
  const writeCb = async (patch, alsoAlters = null) => {
    try {
      const next = { ...(record?.ui_v2 || {}), classicBars: { ...cb, ...patch } };
      const write = { ui_v2: next };
      if (alsoAlters !== null) {
        write[homeField] = {
          ...(record?.[homeField] || {}),
          altersBar: { ...(record?.[homeField]?.altersBar || {}), enabled: alsoAlters, collapsed: false },
        };
      }
      if (record?.id) await base44.entities.SystemSettings.update(record.id, write);
      else await base44.entities.SystemSettings.create(write);
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't switch");
    }
  };
  if (!UI_V2_ENABLED) return null;
  const Row = ({ label, hint, checked, onChange }) => (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5 cursor-pointer">
      <div className="min-w-0">
        <span className="text-sm font-medium">{label}</span>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
  return (
    <div className="space-y-2">
      <Row label="New top bar"
        hint={`${t.System} name, who's ${t.fronting}, clock, search and notifications — replaces the classic header.`}
        checked={topOn} onChange={(v) => writeCb({ top: !!v })} />
      <Row label="New bottom bars"
        hint="The new tab bar with the fold-out handle — swipe it up for quick actions. Replaces the classic tab bar."
        checked={bottomOn} onChange={(v) => writeCb({ bottom: !!v })} />
      <Row label="Quick action bar"
        hint="The fold-out row of one-tap capture keys behind the bottom bar's handle."
        checked={actionsOn} onChange={(v) => writeCb({ actions: !!v })} />
      <Row label={`Pinned ${t.alters} bar`}
        hint={`Your pinned ${t.alters} in a floating bar — tap to toggle ${t.fronting}, hold for the level rail.`}
        checked={altersOn} onChange={(v) => writeCb({ alters: true }, !!v)} />
      {/* The widget board is one swipe left of the classic home — this
          decides which of the two "/" opens on. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5">
        <div className="min-w-0">
          <span className="text-sm font-medium">Home opens on</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            The widget board is always one swipe left; pick which one greets you.
          </p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {[["classic", "Classic"], ["board", "Board"]].map(([v, label]) => {
            const on = (record?.ui_v2?.homeDefault === "board" ? "board" : "classic") === v;
            return (
              <button key={v} type="button" aria-pressed={on}
                onClick={async () => {
                  try {
                    const next = { ...(record?.ui_v2 || {}), homeDefault: v };
                    if (record?.id) await base44.entities.SystemSettings.update(record.id, { ui_v2: next });
                    else await base44.entities.SystemSettings.create({ ui_v2: next });
                    queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
                  } catch (e) { toast.error(e?.message || "Couldn't switch"); }
                }}
                className={`text-xs px-2.5 py-1 rounded-full border ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayoutSettings() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const record = settings[0] || null;
  const [resetOpen, setResetOpen] = useState(false);

  // UI v2 opt-in toggle (build-gated by UI_V2_ENABLED).
  const uiV2On = record?.ui_v2?.enabled === true;
  const toggleUiV2 = async (on) => {
    try {
      const next = { ...(record?.ui_v2 || {}), enabled: on };
      if (record?.id) await base44.entities.SystemSettings.update(record.id, { ui_v2: next });
      else await base44.entities.SystemSettings.create({ ui_v2: next });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast.success(on ? "New UI on" : "Classic navigation restored");
    } catch (e) {
      toast.error(e?.message || "Couldn't switch");
    }
  };

  // The home screen is edited IN PLACE now — on the board canvas, with
  // the board's own edit mode. This section just points there, and keeps
  // the reset flow (which offers to preserve the outgoing arrangement as
  // widget board pages first — resets must never silently discard work).
  const openHomeEditor = () => {
    try { sessionStorage.setItem("symphony_classic_edit-home", "1"); } catch { /* storage off */ }
    navigate("/");
  };

  const resetHome = async (keepAsPage) => {
    setResetOpen(false);
    try {
      if (!record?.id) return;
      const stored = record.classic_home;
      if (keepAsPage && stored && Array.isArray(stored.pages) && stored.pages.length) {
        const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
        const boardField = wide && record.ui_v2_home_desktop ? "ui_v2_home_desktop" : "ui_v2_home";
        const board = record[boardField] && typeof record[boardField] === "object" ? record[boardField] : seedV2Home();
        // Board pages hold V2 widgets — classic-card widgets are mapped to
        // their board twins; anything unmappable is left out of the copy.
        const copies = stored.pages.map((p, i) => ({
          ...p,
          id: newPageId(),
          label: p.label ? `${p.label} (saved)` : `Saved home ${i + 1}`,
          widgets: (p.widgets || [])
            .map((w) => {
              if (V2_WIDGETS[w.widgetId]) return { ...w, instanceId: newInstanceId() };
              const twin = CLASSIC_TO_V2_WIDGET[w.widgetId];
              return twin && V2_WIDGETS[twin]
                ? { ...w, widgetId: twin, instanceId: newInstanceId(), settings: {} }
                : null;
            })
            .filter(Boolean),
        }));
        await base44.entities.SystemSettings.update(record.id, {
          [boardField]: { ...board, pages: [...(Array.isArray(board.pages) ? board.pages : []), ...copies] },
        });
      }
      await base44.entities.SystemSettings.update(record.id, {
        classic_home: seedClassicHome(null),
        dashboard_layout: DEFAULT_LAYOUT.map((e) => ({ ...e })),
      });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      try { window.dispatchEvent(new CustomEvent("dashboard-layout-changed")); } catch { /* ignore */ }
      toast.success(keepAsPage
        ? "Saved to the widget board — the home screen is back to default"
        : "Home screen restored to default");
    } catch (e) {
      toast.error(e?.message || "Couldn't reset the home screen");
    }
  };

  return (
    <section className="space-y-3 border-t border-border/30 pt-4">
      {UI_V2_ENABLED && (
        <label className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 cursor-pointer">
          <div className="min-w-0">
            <span className="text-sm font-medium flex items-center gap-1.5">
              🧪 New UI (in progress)
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              The rebuilt navigation and pages, still being built. Everything you have keeps working underneath — switch back any time.
            </p>
          </div>
          <Switch checked={uiV2On} onCheckedChange={toggleUiV2} />
        </label>
      )}

      {/* The v2 bars in the CLASSIC chrome — only offered while the full
          new UI is off (v2 already carries its own bars). */}
      {UI_V2_ENABLED && !uiV2On && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">New bars in the classic look</p>
          <ClassicBarsToggles />
        </div>
      )}

      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-muted-foreground" />
          Home screen layout
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          The home screen is edited in place now, exactly like the widget
          board: hold a card to move or resize it, open the drawer to add
          widgets, and use each card's gear for its options and looks.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Button size="sm" onClick={openHomeEditor} className="text-xs gap-1">
            <Pencil className="w-3.5 h-3.5" /> Edit home screen
          </Button>
          <Button size="sm" variant="outline" onClick={() => setResetOpen(true)} className="text-xs">
            Reset to default
          </Button>
        </div>
      </div>

      <Dialog open={resetOpen} onOpenChange={(v) => { if (!v) setResetOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Restore the default home screen?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your current arrangement can be kept as pages on the widget board
            before the home screen resets — or reset without keeping it.
            Nothing you've recorded changes either way.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <Button size="sm" onClick={() => resetHome(true)} className="text-xs">
              Keep it on the board, then reset
            </Button>
            <Button size="sm" variant="outline" onClick={() => resetHome(false)} className="text-xs">
              Just reset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResetOpen(false)} className="text-xs">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

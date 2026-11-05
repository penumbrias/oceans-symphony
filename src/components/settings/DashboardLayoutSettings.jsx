import React, { useState } from "react";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LayoutGrid, Pencil } from "lucide-react";
import { CLASSIC_TO_V2_WIDGET } from "@/lib/widgetRegistry";
import { V2_WIDGETS, seedV2Home } from "@/v2/widgets";
import { seedClassicHome } from "@/components/dashboard/ClassicHomeCanvas";
import { writeBoard } from "@/lib/boardWriter";
import { newInstanceId, newPageId } from "@/lib/experimentalHome";
import { DEFAULT_LAYOUT } from "@/lib/dashboardLayout";
import { toast } from "sonner";
import { UI_V2_ENABLED } from "@/lib/featureFlags";
import { useT } from "@/lib/i18n";
import { BarShowList, EditBarsButton } from "@/components/v2/BarShowSwitch";
import HomeOpensOnRow from "@/components/settings/HomeOpensOnRow";

// (The old drag/drop pill editor lived here — the home screen is
// edited in place on the board canvas now.)

// The bars under the classic chrome. The setup guide shows each bar's
// show/hide switch — the SAME BarShowSwitch Display options → Bars uses —
// and Settings → Appearance only links to that editor (withSwitches
// false), so there is one place bars are changed. "Home opens on" rides
// along because it's the other half of how the classic home is set up.
export function ClassicBarsToggles({ withSwitches = true }) {
  const t = useT();
  if (!UI_V2_ENABLED) return null;
  return (
    <div className="space-y-2">
      {withSwitches ? <BarShowList /> : <EditBarsButton label={t("editSheet.editBars")} />}
      <HomeOpensOnRow />
    </div>
  );
}

export { HomeOpensOnRow };

// The restore-to-default flow, exported so the home screen's own ⚙ menu
// can offer it too (owner couldn't find it buried in Settings). Reset
// always offers to keep the outgoing arrangement as widget board pages
// first — resets must never silently discard work.
export function HomeScreenResetDialog({ open, onClose }) {
  const queryClient = useQueryClient();
  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const record = pickPrimarySystemSettings(settings) || null;

  const resetHome = async (keepAsPage) => {
    onClose?.();
    try {
      if (!record?.id) return;
      const stored = record.classic_home;
      if (keepAsPage && stored && Array.isArray(stored.pages) && stored.pages.length) {
        const boardField = "ui_v2_home";
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
        // Through the board writer, stamped against the board as it is now
        // (v0.277.0), so the saved copy reaches the other device too.
        await writeBoard(record, boardField, (cur) => {
          const base = cur && typeof cur === "object" ? cur : board;
          return { ...base, pages: [...(Array.isArray(base.pages) ? base.pages : []), ...copies] };
        });
      }
      await writeBoard(record, "classic_home", seedClassicHome(null), {
        extra: { dashboard_layout: DEFAULT_LAYOUT.map((e) => ({ ...e })) },
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
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
          <Button size="sm" variant="ghost" onClick={() => onClose?.()} className="text-xs">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DashboardLayoutSettings() {
  const navigate = useNavigate();
  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const record = pickPrimarySystemSettings(settings) || null;
  const [resetOpen, setResetOpen] = useState(false);

  const uiV2On = record?.ui_v2?.enabled === true;

  // The home screen is edited IN PLACE now — on the board canvas, with
  // the board's own edit mode. This section just points there, and keeps
  // the reset flow (which offers to preserve the outgoing arrangement as
  // widget board pages first — resets must never silently discard work).
  const openHomeEditor = () => {
    try { sessionStorage.setItem("symphony_classic_edit-home", "1"); } catch { /* storage off */ }
    navigate("/");
  };

  return (
    <section className="space-y-3 border-t border-border/30 pt-4">
      {/* The v2 bars in the CLASSIC chrome — only offered while the full
          new UI is off (v2 already carries its own bars). */}
      {UI_V2_ENABLED && !uiV2On && (
        <div className="space-y-1.5">
          <ClassicBarsToggles withSwitches={false} />
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

      <HomeScreenResetDialog open={resetOpen} onClose={() => setResetOpen(false)} />
    </section>
  );
}

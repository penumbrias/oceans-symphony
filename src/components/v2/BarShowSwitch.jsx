// The show/hide switch for one bar — the SAME component in Display options
// → Bars (one at the top of each bar's section) and in the setup guide's
// bar list, so the two can never disagree about what a switch does.
// Reads and writes through lib/barsModel.js, which knows which flag the
// chrome on screen actually obeys.

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { UI_V2_ENABLED } from "@/lib/featureFlags";
import { useT } from "@/lib/i18n";
import { useTerms } from "@/lib/useTerms";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { barShown, barShownPatch, isV2Chrome, switchableBars, openBarsEditor } from "@/lib/barsModel";

export function useBarsChrome() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  // rows[0], like the chrome (AppLayout) — the row the bars are drawn from.
  const row = rows[0] || null;
  const v2Chrome = isV2Chrome(row, UI_V2_ENABLED);
  const writePatch = async (patch) => {
    if (!patch || !row?.id) return;
    try {
      await base44.entities.SystemSettings.update(row.id, patch);
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) { toast.error(e?.message || "Couldn't save"); }
  };
  return { row, v2Chrome, writePatch };
}

// One name per bar, everywhere.
export function useBarLabels() {
  const tr = useT();
  const terms = useTerms();
  return {
    top: tr("editSheet.barTop"),
    tabs: tr("editSheet.barBottom"),
    actions: tr("editSheet.barActions"),
    alters: applyTerms(tr("editSheet.barAlters"), terms),
    rail: tr("editSheet.barSide"),
    wave: tr("editSheet.wave"),
  };
}

export default function BarShowSwitch({ barId, label = null, size = "sm" }) {
  const tr = useT();
  const { row, v2Chrome, writePatch } = useBarsChrome();
  const on = barShown(row, barId, v2Chrome);
  const text = label || tr("editSheet.show");
  if (size === "row") {
    return (
      <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5 cursor-pointer">
        <span className="text-sm font-medium">{text}</span>
        <Switch checked={on} aria-label={text}
          onCheckedChange={(v) => writePatch(barShownPatch(row, barId, !!v, v2Chrome))} />
      </label>
    );
  }
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-xs font-medium cursor-pointer">
      <span>{text}</span>
      <input type="checkbox" checked={on} aria-label={text}
        onChange={(e) => writePatch(barShownPatch(row, barId, e.target.checked, v2Chrome))}
        className="w-4 h-4 rounded accent-primary" />
    </label>
  );
}

// Every switchable bar under the chrome on screen, plus the way into the
// editor — the setup guide's bar step.
export function BarShowList() {
  const tr = useT();
  const labels = useBarLabels();
  const { v2Chrome } = useBarsChrome();
  if (!UI_V2_ENABLED) return null;
  return (
    <div className="space-y-2">
      {switchableBars(v2Chrome).map((id) => (
        <BarShowSwitch key={id} barId={id} label={labels[id]} size="row" />
      ))}
      <EditBarsButton label={tr("editSheet.editBars")} />
    </div>
  );
}

export function EditBarsButton({ label, barId = null, className = "" }) {
  return (
    <button type="button" onClick={() => openBarsEditor(barId)}
      className={`w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-primary/50 text-primary text-sm font-medium ${className}`}>
      <Settings2 className="w-4 h-4" /> {label}
    </button>
  );
}

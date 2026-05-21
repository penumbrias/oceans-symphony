import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

// User-configurable tap count for the grocery-list panic cover. The
// gesture lives in `useTripleTapPanic` — three quick pointerdowns on
// any non-input element open the grocery list as a privacy overlay.
// On phones with rapid double-tap-to-zoom or accessibility settings,
// the default of 3 sometimes fires accidentally, so we let users set
// it higher or turn the gesture off entirely.
//
// Persisted on SystemSettings.panic_taps_required:
//   0 (or null/undefined) = default of 3 taps
//   2..6  = explicit tap count
//   "off" = gesture disabled

export const DEFAULT_PANIC_TAPS = 3;
const OPTIONS = [
  { value: 2, label: "2 taps", description: "More sensitive — fires faster." },
  { value: 3, label: "3 taps", description: "Default. The original three-quick-taps gesture." },
  { value: 4, label: "4 taps", description: "Less sensitive — avoids accidental triggers." },
  { value: 5, label: "5 taps", description: "Deliberate-feeling. Best if 3 / 4 keep misfiring." },
  { value: "off", label: "Off", description: "Disable the quick-tap entirely. You can still open the grocery list from the side nav (tap the logo in the upper-left to open the sidebar)." },
];

export function readPanicTapsSetting(systemSettings) {
  const raw = systemSettings?.panic_taps_required;
  if (raw === "off") return "off";
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 2 && n <= 6) return n;
  return DEFAULT_PANIC_TAPS;
}

export default function GroceryPanicTapsSettings() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = list?.[0];
  const current = readPanicTapsSetting(settings);

  const update = async (value) => {
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { panic_taps_required: value });
      } else {
        await base44.entities.SystemSettings.create({ panic_taps_required: value });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
      toast.success(value === "off" ? "Quick-tap panic gesture disabled." : `Now requires ${value} taps.`);
    } catch (e) {
      toast.error(e?.message || "Couldn't save");
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          {current === "off" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          Quick-tap privacy cover
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          How many quick taps anywhere on screen open the Grocery List as a privacy overlay. The grocery list is a real working list — it just doubles as a fast-hide cover when someone walks up.
        </p>
      </div>

      <div className="grid gap-2">
        {OPTIONS.map((opt) => {
          const active = current === opt.value || (opt.value === DEFAULT_PANIC_TAPS && current === DEFAULT_PANIC_TAPS);
          const isCurrent = current === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => update(opt.value)}
              className={`text-left rounded-xl border px-3 py-2.5 transition-all ${
                isCurrent
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/60 bg-card hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isCurrent ? "text-primary" : "text-foreground"}`}>
                  {opt.label}
                </span>
                {isCurrent && <span className="text-[0.625rem] uppercase tracking-wider text-primary">Selected</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{opt.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

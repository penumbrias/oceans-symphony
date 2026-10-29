// The door to Display options (v0.318.0; Settings itself links through
// the catalogue since v0.320.0). The look of the app is edited in ONE
// place — Display options, the inspector the page menu opens.
import React from "react";
import { SlidersHorizontal } from "lucide-react";
import { useT } from "@/lib/i18n";

export function openDisplayOptions() {
  window.dispatchEvent(new CustomEvent("os-open-display-options"));
}

// The one button that opens Display options — Accessibility links out
// with the same one.
export function DisplayOptionsButton({ label = null, hint = null }) {
  const t = useT();
  return (
    <button type="button" onClick={openDisplayOptions}
      className="w-full flex items-center gap-3 rounded-xl border border-primary/50 bg-primary/5 px-3 py-3 text-left hover:bg-primary/10 transition-colors">
      <SlidersHorizontal className="w-5 h-5 text-primary flex-shrink-0" />
      <span className="min-w-0">
        <span className="text-sm font-medium block">{label || t("options.title")}</span>
        {hint && <span className="text-xs text-muted-foreground block mt-0.5">{hint}</span>}
      </span>
    </button>
  );
}

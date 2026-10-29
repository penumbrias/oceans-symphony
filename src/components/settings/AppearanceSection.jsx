// Settings → Appearance (v0.318.0). The look of the app is edited in ONE
// place — Display options, the inspector the page menu opens — so this
// section is the door to it plus the few mode switches that are not a
// look: the New UI opt-in, which home greets you, and the language.
import React from "react";
import { SlidersHorizontal } from "lucide-react";
import { useT } from "@/lib/i18n";
import { NewUiToggle, HomeOpensOnRow } from "@/components/settings/DashboardLayoutSettings";
import { V2LanguageSection } from "@/components/settings/V2DisplaySettings";
import { UI_V2_ENABLED } from "@/lib/featureFlags";

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

export default function AppearanceSection() {
  return (
    <div className="space-y-4">
      <div data-tour="settings-display-options">
        <DisplayOptionsButton hint="Fonts and text size, shape, bars, colours and backgrounds, themes and presets — one editor, the same one the page menu opens." />
      </div>
      {UI_V2_ENABLED && (
        <div className="space-y-2">
          <NewUiToggle />
          <HomeOpensOnRow />
        </div>
      )}
      <V2LanguageSection />
    </div>
  );
}

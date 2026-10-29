// useV2Display — the ONE write path for SystemSettings.ui_v2 (tokens,
// bars, command keys, icon overrides). Every display control in the app
// goes through it; Display options (UiEditSheet.jsx) is the only editor.
// The language picker lives here too until Settings has a General group.

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { SubSection } from "@/components/settings/SettingsUI";
import { resolveUiV2 } from "@/lib/uiV2";
import { UI_V2_ENABLED } from "@/lib/featureFlags";
import { useT, LOCALES, getLocale, setLocale, localeCoverage } from "@/lib/i18n";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

export function useV2Display() {
  const qc = useQueryClient();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settingsRow = pickPrimarySystemSettings(settingsList) || null;
  const uiV2 = resolveUiV2(settingsRow?.ui_v2);
  const enabled = UI_V2_ENABLED && uiV2.enabled === true;
  const write = async (patch) => {
    try {
      if (!settingsRow?.id) return;
      // NEVER flip `enabled` here. These rows are woven into the classic
      // Appearance page too, so a write used to silently opt the user into
      // v2 (the "v2 turned itself on" mystery — an accidental slider touch
      // was enough). Adjusting display options preserves the flag as-is;
      // only the explicit New UI toggle changes it.
      await base44.entities.SystemSettings.update(settingsRow.id, {
        ui_v2: { ...(settingsRow.ui_v2 || {}), ...patch },
      });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { /* best-effort live */ }
  };
  return {
    enabled, uiV2, write,
    setToken: (id, value) => write({ tokens: { ...(settingsRow?.ui_v2?.tokens || {}), [id]: value } }),
    setBar: (bar, visible) => write({ bars: { ...(settingsRow?.ui_v2?.bars || {}), [bar]: visible } }),
    setCommandKeys: (keys) => write({ commandKeys: keys }),
    // Icon overrides for nav pages / quick-action keys: { iconName | iconUrl }; empty → default.
    setIcon: (kind, id, override) => {
      const icons = settingsRow?.ui_v2?.icons && typeof settingsRow.ui_v2.icons === "object" ? settingsRow.ui_v2.icons : {};
      const bucket = { ...(icons[kind] || {}) };
      if (override && (override.iconName || override.iconUrl)) bucket[id] = { iconName: override.iconName || "", iconUrl: override.iconUrl || "" };
      else delete bucket[id];
      return write({ icons: { ...icons, [kind]: bucket } });
    },
  };
}

// Language picker — only when a second locale is registered.
export function V2LanguageSection() {
  const t = useT();
  const [locale, setLocaleState] = React.useState(getLocale());
  const localeCodes = Object.keys(LOCALES);
  if (localeCodes.length < 2) return null;
  return (
    <SubSection title={t("options.language")}>
      <div className="flex flex-wrap gap-1.5 py-1">
        {localeCodes.map((code) => {
          const cov = localeCoverage(code);
          return (
            <button key={code} type="button"
              onClick={() => { setLocale(code); setLocaleState(code); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                locale === code ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
              }`}>
              {LOCALES[code].name}
              {cov.pct < 100 && <span className="opacity-60"> · {cov.pct}%</span>}
            </button>
          );
        })}
      </div>
    </SubSection>
  );
}

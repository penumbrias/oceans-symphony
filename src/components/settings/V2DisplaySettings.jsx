// useV2Display — the ONE write path for SystemSettings.ui_v2 (tokens,
// bars, command keys, icon overrides). Every display control in the app
// goes through it; Display options (UiEditSheet.jsx) is the only editor.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { resolveUiV2 } from "@/lib/uiV2";
import { UI_V2_ENABLED } from "@/lib/featureFlags";
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

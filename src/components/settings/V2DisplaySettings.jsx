// useV2Display — the ONE write path for SystemSettings.ui_v2 (tokens,
// bars, command keys, icon overrides). Every display control in the app
// goes through it; Display options (UiEditSheet.jsx) is the only editor.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { resolveUiV2 } from "@/lib/uiV2";
import { UI_V2_ENABLED } from "@/lib/featureFlags";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { writeSettings } from "@/lib/settingsWriter";

export function useV2Display() {
  const qc = useQueryClient();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settingsRow = pickPrimarySystemSettings(settingsList) || null;
  const uiV2 = resolveUiV2(settingsRow?.ui_v2);
  const enabled = UI_V2_ENABLED && uiV2.enabled === true;
  // `patch` is an object of ui_v2 keys, or a function of the FRESH ui_v2
  // returning one, so two quick changes never undo each other. Writes go
  // through the one settings writer (fresh row, one queue).
  const write = async (patch) => {
    try {
      // NEVER flip `enabled` here. These rows are woven into the classic
      // Appearance page too, so a write used to silently opt the user into
      // v2 (the "v2 turned itself on" mystery — an accidental slider touch
      // was enough). Adjusting display options preserves the flag as-is;
      // only the explicit New UI toggle changes it.
      await writeSettings((fresh) => {
        const cur = fresh.ui_v2 && typeof fresh.ui_v2 === "object" ? fresh.ui_v2 : {};
        const p = typeof patch === "function" ? patch(cur) : patch;
        if (!p || typeof p !== "object") return null;
        return { ui_v2: { ...cur, ...p } };
      }, { queryClient: qc });
    } catch { /* best-effort live */ }
  };
  const obj = (v) => (v && typeof v === "object" ? v : {});
  return {
    enabled, uiV2, write,
    setToken: (id, value) => write((cur) => ({ tokens: { ...obj(cur.tokens), [id]: value } })),
    setBar: (bar, visible) => write((cur) => ({ bars: { ...obj(cur.bars), [bar]: visible } })),
    setCommandKeys: (keys) => write({ commandKeys: keys }),
    // Icon overrides for nav pages / quick-action keys: { iconName | iconUrl }; empty → default.
    setIcon: (kind, id, override) => write((cur) => {
      const icons = obj(cur.icons);
      const bucket = { ...obj(icons[kind]) };
      if (override && (override.iconName || override.iconUrl)) bucket[id] = { iconName: override.iconName || "", iconUrl: override.iconUrl || "" };
      else delete bucket[id];
      return { icons: { ...icons, [kind]: bucket } };
    }),
  };
}

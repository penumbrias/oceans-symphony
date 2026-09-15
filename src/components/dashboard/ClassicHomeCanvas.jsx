// The classic home screen ON the board canvas. Same component, same edit
// mode, same drawer, same gestures as the widget board — the only
// difference is WHAT it edits: the home screen's own layout, stored in
// SystemSettings.classic_home and seeded once from the user's
// dashboard_layout so the first render looks like the dashboard they
// already had. dashboard_layout itself is never modified or deleted — it
// stays the seed source of truth for "reset to default".
//
// Event scope is "os-classic" (os-classic-edit-home / symphony_classic_*)
// so "Edit home screen" edits THIS surface and "Edit widget board" (os-v2)
// never can. Swiping left past the last home page exits to the widget
// board via onOpenBoard.

import React, { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ExperimentalDashboard from "@/pages/ExperimentalDashboard";
import { WIDGET_REGISTRY, CLASSIC_TO_WIDGET } from "@/lib/widgetRegistry";
import { V2_WIDGETS } from "@/v2/widgets";
import { seedFromClassic, newInstanceId } from "@/lib/experimentalHome";
import { resolveUiV2, V2_COMMAND_KEYS } from "@/lib/uiV2";

export const CLASSIC_HOME_FIELD = "classic_home";

// The home screen's widget set: every classic card as a widget (the legacy
// registry renders the REAL classic components) plus the board's whole v2
// catalogue, so anything the board can hold the home screen can hold too.
// On the two id collisions (pinned_alters, bulletin_board) the classic
// card wins — the home screen defaults to looking classic.
export const CLASSIC_HOME_REGISTRY = { ...V2_WIDGETS, ...WIDGET_REGISTRY };

// Build the classic_home blob from a dashboard_layout (the user's, or
// null for the app default). Exported for the Settings reset flow.
export function seedClassicHome(dashboardLayoutStored) {
  const seeded = seedFromClassic(dashboardLayoutStored, WIDGET_REGISTRY, CLASSIC_TO_WIDGET);
  const page = seeded.pages[0];
  // The classic greeting header (system name, date, board/help buttons)
  // stays ABOVE the canvas in Dashboard.jsx — don't seed a second one.
  page.widgets = page.widgets.filter((w) => w.widgetId !== "system_header");
  // seedFromClassic skips quick_checkin (the OLD experimental home had its
  // own action bar). The classic home always showed the Quick Check-In
  // card, so keep it — desktop classic has no hosted quick bar at all.
  if (!page.widgets.some((w) => w.widgetId === "quick_checkin")) {
    page.widgets.push({
      instanceId: newInstanceId(),
      widgetId: "quick_checkin",
      span: { ...(WIDGET_REGISTRY.quick_checkin.defaultSpan || { cols: 4, rows: 1 }) },
      mode: "normal",
      settings: {},
    });
  }
  // Slots upgraded to board widgets in v0.224–v0.225 (entry.v2) carry
  // over as those widgets.
  const stored = Array.isArray(dashboardLayoutStored) ? dashboardLayoutStored : [];
  for (const e of stored) {
    if (!e || e.enabled === false) continue;
    const v2 = e.v2;
    if (!v2 || typeof v2.widgetId !== "string" || v2.mode === "classic") continue;
    const def = CLASSIC_HOME_REGISTRY[v2.widgetId];
    if (!def) continue;
    page.widgets.push({
      instanceId: newInstanceId(),
      widgetId: v2.widgetId,
      span: { ...(def.defaultSpan || { cols: 4, rows: 1 }) },
      mode: v2.mode || "normal",
      settings: v2.settings || {},
    });
  }
  return seeded;
}

export default function ClassicHomeCanvas({ settingsRow, api, onOpenBoard = null }) {
  const qc = useQueryClient();
  const uiV2 = resolveUiV2(settingsRow?.ui_v2);
  const seededRef = useRef(false);

  // First render ever: lay the canvas out from the saved dashboard_layout
  // so nothing looks moved. Runs once, and only when nothing is saved yet.
  useEffect(() => {
    if (seededRef.current) return;
    if (!settingsRow?.id) return;
    if (settingsRow[CLASSIC_HOME_FIELD]) return;
    seededRef.current = true;
    (async () => {
      try {
        await base44.entities.SystemSettings.update(settingsRow.id, {
          [CLASSIC_HOME_FIELD]: seedClassicHome(settingsRow.dashboard_layout),
        });
        qc.invalidateQueries({ queryKey: ["systemSettings"] });
      } catch { /* non-fatal: the canvas just starts empty */ }
    })();
  }, [settingsRow, qc]);

  return (
    <ExperimentalDashboard
      settingsRow={settingsRow}
      api={api}
      registry={CLASSIC_HOME_REGISTRY}
      settingsField={CLASSIC_HOME_FIELD}
      eventPrefix="os-classic"
      onExitRight={onOpenBoard}
      // The frame's command bar (the classic-hosted quick-action strip) is
      // THE quick-action bar here — this stops the canvas drawing its own
      // duplicate strip, and the edit toolbar's Bar row edits these keys.
      commandBar={{
        keys: uiV2.commandKeys,
        catalogue: V2_COMMAND_KEYS,
        setKeys: async (keys) => {
          if (!settingsRow?.id) return;
          await base44.entities.SystemSettings.update(settingsRow.id, {
            ui_v2: { ...(settingsRow.ui_v2 || {}), commandKeys: keys },
          });
          qc.invalidateQueries({ queryKey: ["systemSettings"] });
        },
      }}
    />
  );
}

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
import {
  DEFAULT_EXPERIMENTAL_HOME, newInstanceId, packPositions,
} from "@/lib/experimentalHome";
import { resolveLayout, isElementEnabled } from "@/lib/dashboardLayout";
import { resolveUiV2, V2_COMMAND_KEYS } from "@/lib/uiV2";

export const CLASSIC_HOME_FIELD = "classic_home";

// The home screen's widget set: every classic card as a widget (the legacy
// registry renders the REAL classic components) plus the board's whole v2
// catalogue, so anything the board can hold the home screen can hold too.
// pinned_alters keeps the classic gallery; bulletin_board deliberately
// takes the REFINED v2 board widget (owner call) — the classic surface
// bundled Upcoming Plans, which is its own widget here.
export const CLASSIC_HOME_REGISTRY = {
  ...V2_WIDGETS,
  ...WIDGET_REGISTRY,
  bulletin_board: V2_WIDGETS.bulletin_board,
};

// The running trio folds into ONE "Active now" card (owner ask); its
// category toggles live in the widget's options.
const TRIO = ["current_symptoms", "current_activities", "current_contacts"];
const SUB_BUTTON_IDS = ["start_activity_button", "start_symptom_button", "quick_task_button", "quick_plan_button"];

// Free-grid pages render every widget at its stored cell — a widget
// WITHOUT pos lands at (0,0), so an unpacked seed paints the whole
// layout in one overlapping pile. Every seeded page is packed at ONE row
// each: the canvas's fit pass measures every widget's content on render
// and GROWS it to exactly the rows it needs (it never shrinks), so
// minimal seeds become a content-sized column while generous guesses
// would stay as slack forever.
export function packSeededPage(page, gridCols = 4) {
  const widgets = (page.widgets || []).map((w) => ({
    ...w,
    span: { cols: Math.min(w.span?.cols || 4, gridCols), rows: 1 },
  }));
  return { ...page, widgets: packPositions(widgets, gridCols) };
}

// Build the classic_home blob from a dashboard_layout (the user's, or
// null for the app default), keeping the CLASSIC ORDER faithfully so a
// long-time classic user sees their dashboard, not a rearrangement.
// Exported for the Settings reset flow.
export function seedClassicHome(dashboardLayoutStored) {
  const layout = resolveLayout(dashboardLayoutStored);
  const enabled = (id) => isElementEnabled(layout, id);
  const widgets = [];
  const seen = new Set();
  const push = (widgetId, extra = {}) => {
    const def = CLASSIC_HOME_REGISTRY[widgetId];
    if (!def) return;
    if (seen.has(widgetId) && !def.supportsMultiInstance) return;
    seen.add(widgetId);
    widgets.push({
      instanceId: newInstanceId(),
      widgetId,
      span: { ...(def.defaultSpan || { cols: 4, rows: 1 }) },
      mode: "normal",
      settings: {},
      ...extra,
    });
  };
  // The corner buttons row (board / guide / notifications) leads, then
  // the system heading — the classic top-of-page, each as its own
  // configurable widget instead of fixed page chrome.
  push("page_buttons", { span: { cols: 4, rows: 1 } });
  push("system_header", { span: { cols: 4, rows: 1 } });
  for (const entry of layout) {
    if (!enabled(entry.id)) continue;
    if (SUB_BUTTON_IDS.includes(entry.id)) continue; // folded into quick_checkin settings
    // Slots upgraded to board widgets (v0.224–v0.225 entry.v2) carry over
    // in place.
    if (entry.v2 && typeof entry.v2.widgetId === "string" && entry.v2.mode !== "classic"
        && CLASSIC_HOME_REGISTRY[entry.v2.widgetId]) {
      widgets.push({
        instanceId: newInstanceId(),
        widgetId: entry.v2.widgetId,
        span: { ...(CLASSIC_HOME_REGISTRY[entry.v2.widgetId].defaultSpan || { cols: 4, rows: 1 }) },
        mode: entry.v2.mode || "normal",
        settings: entry.v2.settings || {},
      });
      continue;
    }
    if (TRIO.includes(entry.id)) {
      push("active_now", {
        settings: {
          showSymptoms: enabled("current_symptoms"),
          showActivities: enabled("current_activities"),
          showContacts: enabled("current_contacts"),
        },
      });
      continue;
    }
    if (entry.id === "quick_checkin") {
      // The classic sub-toggles (start/quick buttons) become this
      // widget's own option toggles, seeded from the saved layout.
      push("quick_checkin", {
        settings: {
          startActivity: enabled("start_activity_button"),
          startSymptom: enabled("start_symptom_button"),
          quickTask: enabled("quick_task_button"),
          quickPlan: enabled("quick_plan_button"),
        },
      });
      continue;
    }
    const widgetId = CLASSIC_TO_WIDGET[entry.id];
    if (widgetId) push(widgetId);
  }
  return {
    ...DEFAULT_EXPERIMENTAL_HOME,
    enabled: true,
    // The finest row unit — content-fitted cards carry the least possible
    // grid slack, which is what keeps the seeded home reading like the
    // old classic column.
    grid: { phoneCols: 4, rowPx: 40 },
    pages: [packSeededPage({ id: "p1", label: "Home", layoutMode: "free", widgets })],
    defaultPageId: "p1",
  };
}

// One-shot heal for layouts seeded before v0.228.0: merge the running
// trio into "Active now", add the system-header widget, move to the
// 40px row unit, and re-seat everything content-sized. Hand-resized
// widgets (autoFit === false) keep their height (rescaled to the new
// row unit); everything else re-fits to content. Order (top-to-bottom,
// left-to-right) is preserved.
function healPage(page, oldRowPx, layout) {
  const ws = page.widgets || [];
  const ordered = [...ws].sort(
    (a, b) => (a.pos?.y || 0) - (b.pos?.y || 0) || (a.pos?.x || 0) - (b.pos?.x || 0)
  );
  const has = (id) => ordered.some((w) => w.widgetId === id);
  const out = [];
  let trioPlaced = false;
  for (const w of ordered) {
    if (TRIO.includes(w.widgetId)) {
      if (!trioPlaced) {
        trioPlaced = true;
        out.push({
          instanceId: newInstanceId(),
          widgetId: "active_now",
          span: { cols: 4, rows: 1 },
          mode: "normal",
          settings: {
            showSymptoms: has("current_symptoms"),
            showActivities: has("current_activities"),
            showContacts: has("current_contacts"),
          },
        });
      }
      continue;
    }
    out.push(w);
  }
  if (!out.some((w) => w.widgetId === "system_header")) {
    out.unshift({
      instanceId: newInstanceId(),
      widgetId: "system_header",
      span: { cols: 4, rows: 1 },
      mode: "normal",
      settings: {},
    });
  }
  // The corner buttons row sits ABOVE the heading, right-aligned — the
  // classic top-of-page.
  if (!out.some((w) => w.widgetId === "page_buttons")) {
    out.unshift({
      instanceId: newInstanceId(),
      widgetId: "page_buttons",
      span: { cols: 4, rows: 1 },
      mode: "normal",
      settings: {},
    });
  }
  // The early seeds APPENDED the quick-action buttons at the very bottom
  // (owner report) — put them back at their classic spot: right after the
  // running trio (now "Active now"), and carry the saved sub-button
  // toggles over into the widget's own options.
  const qcIdx = out.findIndex((w) => w.widgetId === "quick_checkin");
  if (qcIdx !== -1) {
    const enabled = (id) => isElementEnabled(layout, id);
    const [qcW] = out.splice(qcIdx, 1);
    const qc2 = {
      ...qcW,
      settings: {
        startActivity: enabled("start_activity_button"),
        startSymptom: enabled("start_symptom_button"),
        quickTask: enabled("quick_task_button"),
        quickPlan: enabled("quick_plan_button"),
        ...(qcW.settings || {}),
      },
    };
    const anchor = out.findIndex((w) => w.widgetId === "active_now");
    const fallback = out.findIndex((w) => w.widgetId === "status_note");
    out.splice((anchor !== -1 ? anchor : (fallback !== -1 ? fallback : Math.min(3, out.length - 1))) + 1, 0, qc2);
  }
  const rowScale = Math.max(1, Math.round((oldRowPx || 80) / 40));
  const rescaled = out.map((w) => (
    w?.settings?.autoFit === false
      ? { ...w, span: { cols: w.span?.cols || 4, rows: Math.max(1, (w.span?.rows || 1) * rowScale) } }
      : { ...w, span: { cols: w.span?.cols || 4, rows: 1 } }
  ));
  return { ...page, widgets: packPositions(rescaled, 4) };
}

export default function ClassicHomeCanvas({ settingsRow, api, onOpenBoard = null }) {
  const qc = useQueryClient();
  const uiV2 = resolveUiV2(settingsRow?.ui_v2);
  const seededRef = useRef(false);

  // First render ever: lay the canvas out from the saved dashboard_layout
  // so nothing looks moved. Existing pre-v0.228 layouts get the one-shot
  // heal above (guarded by a device flag).
  useEffect(() => {
    if (seededRef.current) return;
    if (!settingsRow?.id) return;
    seededRef.current = true;
    (async () => {
      try {
        const stored = settingsRow[CLASSIC_HOME_FIELD];
        if (!stored) {
          await base44.entities.SystemSettings.update(settingsRow.id, {
            [CLASSIC_HOME_FIELD]: seedClassicHome(settingsRow.dashboard_layout),
          });
          qc.invalidateQueries({ queryKey: ["systemSettings"] });
          return;
        }
        let healed = false;
        try { healed = localStorage.getItem("classic_home_norm_v4") === "1"; } catch { /* storage off */ }
        const pages = Array.isArray(stored.pages) ? stored.pages : [];
        const unpacked = (p) => (p.widgets || []).length > 1 && (p.widgets || []).every((w) => !w?.pos);
        if (healed) {
          // Already migrated on this device — only re-seat a page that
          // somehow arrived with no positions at all (the overlap pile).
          if (!pages.some(unpacked)) return;
          await base44.entities.SystemSettings.update(settingsRow.id, {
            [CLASSIC_HOME_FIELD]: { ...stored, pages: pages.map((p) => (unpacked(p) ? packSeededPage(p) : p)) },
          });
          qc.invalidateQueries({ queryKey: ["systemSettings"] });
          return;
        }
        const oldRowPx = stored.grid?.rowPx || 80;
        const layout = resolveLayout(settingsRow.dashboard_layout);
        const nextPages = pages.map((p) => healPage(p, oldRowPx, layout));
        try { localStorage.setItem("classic_home_norm_v4", "1"); } catch { /* storage off */ }
        await base44.entities.SystemSettings.update(settingsRow.id, {
          [CLASSIC_HOME_FIELD]: {
            ...stored,
            grid: { ...(stored.grid || {}), phoneCols: stored.grid?.phoneCols || 4, rowPx: 40 },
            pages: nextPages,
          },
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
      viewFlow
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

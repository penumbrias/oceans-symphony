// Experimental phone-like homescreen — data model + sanitizer.
//
// Stored as SystemSettings.experimental_home (schema-less local singleton;
// coexists with dashboard_layout / navigation_config and never touches
// them, so the classic dashboard round-trips untouched while the user
// experiments). Sanitize-on-read, never migrate-on-write — same tolerance
// philosophy as resolveLayout (dashboardLayout.js) and the pinned-daily-
// tasks prefs sanitize().
//
// Shape:
// {
//   version: 1,
//   enabled: false,
//   defaultPageId: "p1",
//   styleMode: "current",          // future: "barebones" | "current" | "phone"
//   actionBar: { enabled: true, buttonIds: [...ACTION_BAR_BUTTONS ids] },
//   pages: [{ id, label, widgets: [{ instanceId, widgetId, span:{cols,rows}, mode, settings }] }],
// }

import { resolveLayout, isElementEnabled } from "@/lib/dashboardLayout";

export const HOME_MODES = ["minimal", "normal", "expanded", "detailed"];

// Quick-action buttons available on the persistent action bar. The ids
// match what QuickCheckinButtons renders; "quick_checkin" is the anchor
// and always first when enabled.
export const ACTION_BAR_BUTTONS = [
  { id: "quick_checkin", label: "Quick Check-In" },
  { id: "start_activity", label: "Start Activity" },
  { id: "start_symptom", label: "Start Symptom" },
  { id: "quick_task", label: "Quick Task" },
  { id: "quick_plan", label: "Quick Plan" },
];

const DEFAULT_ACTION_BAR = { enabled: true, buttonIds: ["quick_checkin", "start_activity", "quick_task"] };

export const DEFAULT_EXPERIMENTAL_HOME = {
  version: 1,
  enabled: false,
  defaultPageId: "p1",
  styleMode: "current",
  actionBar: DEFAULT_ACTION_BAR,
  pages: [{ id: "p1", label: "Home", widgets: [] }],
};

let _idCounter = 0;
export function newInstanceId() {
  _idCounter += 1;
  return `w_${Date.now().toString(36)}_${_idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newPageId() {
  _idCounter += 1;
  return `p_${Date.now().toString(36)}_${_idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// Sanitize a stored config against the registry's capabilities. `registry`
// is passed in (not imported) to keep this module free of JSX imports so
// it stays testable and cheap to load.
export function resolveExperimentalHome(stored, registry = {}) {
  const src = stored && typeof stored === "object" ? stored : {};
  const out = {
    version: 1,
    enabled: src.enabled === true,
    styleMode: ["barebones", "current", "phone"].includes(src.styleMode) ? src.styleMode : "current",
    actionBar: {
      enabled: src.actionBar?.enabled !== false,
      buttonIds: Array.isArray(src.actionBar?.buttonIds)
        ? src.actionBar.buttonIds.filter((id) => ACTION_BAR_BUTTONS.some((b) => b.id === id))
        : [...DEFAULT_ACTION_BAR.buttonIds],
    },
    pages: [],
    defaultPageId: null,
  };

  const seenInstance = new Set();
  const pages = Array.isArray(src.pages) ? src.pages : [];
  for (const p of pages) {
    if (!p || typeof p !== "object") continue;
    const pageId = typeof p.id === "string" && p.id ? p.id : `p${out.pages.length + 1}`;
    if (out.pages.some((x) => x.id === pageId)) continue;
    const widgets = [];
    for (const w of Array.isArray(p.widgets) ? p.widgets : []) {
      if (!w || typeof w !== "object") continue;
      const def = registry[w.widgetId];
      if (!def) continue; // widget no longer exists — drop the instance
      let instanceId = typeof w.instanceId === "string" && w.instanceId ? w.instanceId : newInstanceId();
      if (seenInstance.has(instanceId)) instanceId = newInstanceId();
      seenInstance.add(instanceId);
      const minC = def.minSpan?.cols ?? 1, maxC = def.maxSpan?.cols ?? 6;
      const minR = def.minSpan?.rows ?? 1, maxR = def.maxSpan?.rows ?? 8;
      widgets.push({
        instanceId,
        widgetId: w.widgetId,
        span: {
          cols: clampInt(w.span?.cols, minC, maxC, def.defaultSpan?.cols ?? 2),
          rows: clampInt(w.span?.rows, minR, maxR, def.defaultSpan?.rows ?? 1),
        },
        mode: HOME_MODES.includes(w.mode) ? w.mode : "normal",
        settings: w.settings && typeof w.settings === "object" ? w.settings : {},
      });
    }
    out.pages.push({ id: pageId, label: typeof p.label === "string" ? p.label : "", widgets });
  }
  if (out.pages.length === 0) out.pages.push({ id: "p1", label: "Home", widgets: [] });
  out.defaultPageId = out.pages.some((p) => p.id === src.defaultPageId) ? src.defaultPageId : out.pages[0].id;
  return out;
}

// Degrade a requested display mode to the nearest one a widget supports.
export function effectiveMode(requested, supportsModes = ["normal"]) {
  if (supportsModes.includes(requested)) return requested;
  const fallbacks = {
    detailed: ["expanded", "normal", "minimal"],
    expanded: ["normal", "detailed", "minimal"],
    minimal: ["normal", "expanded", "detailed"],
    normal: ["expanded", "minimal", "detailed"],
  };
  for (const f of fallbacks[requested] || ["normal"]) {
    if (supportsModes.includes(f)) return f;
  }
  return supportsModes[0] || "normal";
}

// One-time seed when the user first enables the homescreen: mirror the
// classic dashboard's currently-enabled sections in their saved order, so
// the experimental view opens looking familiar instead of empty.
// `classicToWidgetId` maps dashboard_layout element ids → registry widget
// ids (mostly identity; supplied by the registry module).
export function seedFromClassic(dashboardLayoutStored, registry, classicToWidgetId) {
  const layout = resolveLayout(dashboardLayoutStored);
  const widgets = [];
  for (const entry of layout) {
    if (!isElementEnabled(layout, entry.id)) continue;
    const widgetId = classicToWidgetId[entry.id];
    if (!widgetId || !registry[widgetId]) continue;
    // The persistent action bar already hosts the quick-action buttons by
    // default — seeding them as a widget too would show them twice. The
    // widget stays available in the drawer for anyone who disables the bar.
    if (widgetId === "quick_checkin") continue;
    if (widgets.some((w) => w.widgetId === widgetId)) continue;
    const def = registry[widgetId];
    widgets.push({
      instanceId: newInstanceId(),
      widgetId,
      span: { ...(def.defaultSpan || { cols: 2, rows: 1 }) },
      mode: "normal",
      settings: {},
    });
  }
  // Chrome widgets always lead the seeded page — the homescreen should
  // open with the system name up top like the classic dashboard.
  if (registry.system_header) {
    widgets.unshift({
      instanceId: newInstanceId(),
      widgetId: "system_header",
      span: { ...(registry.system_header.defaultSpan || { cols: 2, rows: 1 }) },
      mode: "normal",
      settings: {},
    });
  }
  return {
    ...DEFAULT_EXPERIMENTAL_HOME,
    enabled: true,
    pages: [{ id: "p1", label: "Home", widgets }],
    defaultPageId: "p1",
  };
}

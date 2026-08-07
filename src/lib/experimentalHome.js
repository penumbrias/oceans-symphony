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

// Widget/page style ids — the single source of truth for the style system.
// Visual definitions (shell classes, labels) live in src/lib/homeStyles.js;
// this list stays here so the sanitizer never imports JSX-adjacent modules.
// "phone" was renamed to "glass" in v0.94.0 (sanitizer maps the legacy id).
export const HOME_STYLE_IDS = [
  "current", "glass", "social", "toybox", "forum", "terminal", "spreadsheet", "aero", "barebones",
];

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

// Persistent pinned-alters strip — like the action bar, it stays put while
// swiping between pages. position: "top" (above the canvas) | "bottom"
// (stacked above the action bar).
const DEFAULT_ALTERS_BAR = { enabled: false, position: "bottom" };

export const DEFAULT_EXPERIMENTAL_HOME = {
  version: 2,
  enabled: false,
  defaultPageId: "p1",
  styleMode: "current",
  actionBar: DEFAULT_ACTION_BAR,
  altersBar: DEFAULT_ALTERS_BAR,
  // Homescreen background image — a local-image:// or https URL picked from
  // the asset library. Empty string = no wallpaper.
  wallpaper: { url: "" },
  // Grid density — phones can opt into 5 columns (default 4). Larger
  // breakpoints stay 8/12.
  grid: { phoneCols: 4 },
  // App-drawer folders: [{ id, label, appIds: [navCatalogue ids] }].
  drawer: { order: [], folders: [] },
  pages: [{ id: "p1", label: "Home", layoutMode: "flow", widgets: [] }],
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
  // v1 → v2: the grid got twice as dense (phone 2→4 cols etc.) so app icons
  // can be quarter-width. Doubling stored spans keeps v1 layouts looking
  // pixel-identical. Applied on read; persisting writes version 2.
  const spanScale = src.version >= 2 ? 1 : 2;
  const out = {
    version: 2,
    enabled: src.enabled === true,
    styleMode: HOME_STYLE_IDS.includes(src.styleMode)
      ? src.styleMode
      : src.styleMode === "phone" ? "glass" : "current",
    actionBar: {
      enabled: src.actionBar?.enabled !== false,
      buttonIds: Array.isArray(src.actionBar?.buttonIds)
        ? src.actionBar.buttonIds.filter((id) => ACTION_BAR_BUTTONS.some((b) => b.id === id))
        : [...DEFAULT_ACTION_BAR.buttonIds],
    },
    altersBar: {
      enabled: src.altersBar?.enabled === true,
      position: src.altersBar?.position === "top" ? "top" : "bottom",
      // Collapsed: the strip folds to a thin tab. Owner asked for it to be
      // foldable away rather than permanently eating a row.
      collapsed: src.altersBar?.collapsed === true,
      // Same look fields a widget has (border/background/radius/text…),
      // so the bar is editable in all the ways a widget is.
      look: src.altersBar?.look && typeof src.altersBar.look === "object" ? src.altersBar.look : {},
    },
    wallpaper: {
      url: typeof src.wallpaper?.url === "string" ? src.wallpaper.url : "",
      // Point at a folder of image assets instead of one picture and
      // the board rotates through it (src/lib/imageRotation.js).
      folder: typeof src.wallpaper?.folder === "string" ? src.wallpaper.folder : "",
      mode: src.wallpaper?.mode === "sequential" ? "sequential" : "random",
    },
    grid: { phoneCols: src.grid?.phoneCols === 5 ? 5 : 4 },
    drawer: {
      // User-chosen app order for the drawer grid (ids not listed keep
      // catalogue order after the listed ones).
      order: Array.isArray(src.drawer?.order) ? src.drawer.order.filter((x) => typeof x === "string") : [],
      folders: (Array.isArray(src.drawer?.folders) ? src.drawer.folders : [])
        .filter((f) => f && typeof f === "object" && typeof f.id === "string" && f.id)
        .map((f) => ({
          id: f.id,
          label: typeof f.label === "string" ? f.label.slice(0, 40) : "",
          appIds: Array.isArray(f.appIds) ? f.appIds.filter((a) => typeof a === "string") : [],
        })),
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
      const minC = def.minSpan?.cols ?? 1, maxC = def.maxSpan?.cols ?? 12;
      const minR = def.minSpan?.rows ?? 1, maxR = def.maxSpan?.rows ?? 8;
      const rawCols = parseInt(w.span?.cols, 10);
      widgets.push({
        instanceId,
        widgetId: w.widgetId,
        span: {
          cols: clampInt(Number.isFinite(rawCols) ? rawCols * spanScale : NaN, minC, maxC, def.defaultSpan?.cols ?? 4),
          rows: clampInt(w.span?.rows, minR, maxR, def.defaultSpan?.rows ?? 1),
        },
        mode: HOME_MODES.includes(w.mode) ? w.mode : "normal",
        settings: w.settings && typeof w.settings === "object" ? w.settings : {},
        // Free-placement coordinates (grid cells, 0-based). Absent = this
        // widget just flows in order, which is the old behaviour.
        pos: w.pos && Number.isFinite(parseInt(w.pos.x, 10)) && Number.isFinite(parseInt(w.pos.y, 10))
          ? { x: Math.max(0, parseInt(w.pos.x, 10)), y: Math.max(0, parseInt(w.pos.y, 10)) }
          : null,
      });
    }
    out.pages.push({
      id: pageId,
      label: typeof p.label === "string" ? p.label : "",
      // "flow": widgets pack in order (the original behaviour, and still the
      // default). "free": each widget sits at the cell the user put it in,
      // gaps and all.
      layoutMode: p.layoutMode === "free" ? "free" : "flow",
      // Who this page is for. Empty = everyone. Non-empty = only shown
      // while one of these alters is fronting (soft hiding, not a lock).
      visibleTo: Array.isArray(p.visibleTo) ? p.visibleTo.filter((x) => typeof x === "string" && x) : [],
      // "only" = just these alters see it; "except" = everyone BUT them.
      visibleMode: p.visibleMode === "except" ? "except" : "only",
      // A song for this home page — same { ref, title, loop } shape a
      // profile song uses, played by the same component.
      song: p.song && typeof p.song === "object" && p.song.ref ? p.song : null,
      widgets,
    });
  }
  if (out.pages.length === 0) out.pages.push({ id: "p1", label: "Home", layoutMode: "flow", widgets: [] });
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
      span: { ...(def.defaultSpan || { cols: 4, rows: 1 }) },
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

// Give every widget a cell, packing them in their current order — used when
// a page switches from flow to free placement so nothing jumps around at
// the moment of the switch. First-fit, scanning row by row.
export function packPositions(widgets, gridCols, measuredRows = {}) {
  const taken = new Set();
  const key = (x, y) => `${x},${y}`;
  const fits = (x, y, c, r) => {
    if (x + c > gridCols) return false;
    for (let dy = 0; dy < r; dy += 1) {
      for (let dx = 0; dx < c; dx += 1) if (taken.has(key(x + dx, y + dy))) return false;
    }
    return true;
  };
  const occupy = (x, y, c, r) => {
    for (let dy = 0; dy < r; dy += 1) {
      for (let dx = 0; dx < c; dx += 1) taken.add(key(x + dx, y + dy));
    }
  };
  return widgets.map((w) => {
    const c = Math.min(w.span?.cols || 1, gridCols);
    // Flow mode lets a widget be as tall as its content; free mode gives it
    // exactly the rows it claims. Take the taller of the two so switching
    // never crushes a widget into its neighbour.
    const r = Math.max(w.span?.rows || 1, measuredRows[w.instanceId] || 0);
    for (let y = 0; y < 400; y += 1) {
      for (let x = 0; x <= gridCols - c; x += 1) {
        if (fits(x, y, c, r)) {
          occupy(x, y, c, r);
          return { ...w, span: { ...w.span, rows: r }, pos: { x, y } };
        }
      }
    }
    return { ...w, span: { ...w.span, rows: r }, pos: { x: 0, y: 0 } };
  });
}

// ── Free-placement collision handling ──────────────────────────────
// Free placement means "put it where I want, gaps and all" — it does NOT
// mean widgets get to sit on top of each other. When one is moved or grown
// into space another occupies, the other one gets out of the way by moving
// DOWN. Never sideways (that would fight the user's chosen columns) and
// never upward-compacted (that would eat the gaps they deliberately left).

const box = (w, gridCols) => {
  const x = Math.max(0, Math.min(gridCols - 1, w.pos?.x || 0));
  const c = Math.max(1, Math.min(w.span?.cols || 1, gridCols - x));
  return { x, y: Math.max(0, w.pos?.y || 0), c, r: Math.max(1, w.span?.rows || 1) };
};
const hits = (a, b) => a.x < b.x + b.c && b.x < a.x + a.c && a.y < b.y + b.r && b.y < a.y + a.r;

export function hasOverlaps(widgets, gridCols) {
  const boxes = widgets.map((w) => box(w, gridCols));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) if (hits(boxes[i], boxes[j])) return true;
  }
  return false;
}

// `anchorId` is the widget the user just moved or resized: it keeps exactly
// the cell it was given, and everything else arranges itself around it.
export function resolveOverlaps(widgets, gridCols, anchorId = null) {
  const order = [...widgets].sort((a, b) => {
    if (a.instanceId === anchorId) return -1;
    if (b.instanceId === anchorId) return 1;
    const ay = a.pos?.y || 0, by = b.pos?.y || 0;
    return ay === by ? (a.pos?.x || 0) - (b.pos?.x || 0) : ay - by;
  });

  const placed = [];
  const byId = {};
  for (const w of order) {
    const b = box(w, gridCols);
    // Push down past whatever is already in the way, re-checking each time
    // (moving down can land on something else).
    let guard = 0;
    while (guard < 500) {
      const clash = placed.find((p) => hits(b, p));
      if (!clash) break;
      b.y = clash.y + clash.r;
      guard += 1;
    }
    placed.push(b);
    byId[w.instanceId] = b;
  }

  return widgets.map((w) => {
    const b = byId[w.instanceId];
    if (!b) return w;
    const same = (w.pos?.x || 0) === b.x && (w.pos?.y || 0) === b.y && (w.span?.cols || 1) === b.c;
    return same ? w : { ...w, pos: { x: b.x, y: b.y }, span: { ...w.span, cols: b.c } };
  });
}

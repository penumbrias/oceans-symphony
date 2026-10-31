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
  grid: { phoneCols: 4, rowPx: 80 },
  // App-drawer folders: [{ id, label, appIds: [navCatalogue ids] }].
  drawer: { order: [], folders: [] },
  pages: [{ id: "p1", label: "Home", layoutMode: "free", widgets: [] }],
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

// Sizes and positions keep quarter steps (snapping off, v0.322.x) —
// anything finer is rounded to the nearest quarter, never thrown away.
const quarter = (n) => Math.round(n * 4) / 4;
function clampStep(v, min, max, fallback) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, quarter(n)));
}

// Sanitize a stored config against the registry's capabilities. `registry`
// is passed in (not imported) to keep this module free of JSX imports so
// it stays testable and cheap to load.
// Space between widgets (v0.328.0): a board's `grid.gap` and a profile's
// PS.WIDGET_GAP, in px. Unset falls back to the spacing a board always
// had: tight for the bare-bones style, roomier for a flowing column.
export const WIDGET_GAP_MAX = 40;
export const isWidgetGap = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= WIDGET_GAP_MAX;
export function defaultWidgetGap({ styleMode, flow }) {
  return styleMode === "barebones" ? 6 : flow ? 16 : 12;
}

export function resolveExperimentalHome(stored, registry = {}) {
  const src = stored && typeof stored === "object" ? stored : {};
  // v1 → v2: the grid got twice as dense (phone 2→4 cols etc.) so app icons
  // can be quarter-width. Doubling stored spans keeps v1 layouts looking
  // pixel-identical. Applied on read; persisting writes version 2.
  const spanScale = src.version >= 2 ? 1 : 2;
  // Widgets' max rows are declared for the 80px unit; a finer unit needs
  // proportionally more rows to reach the same height.
  const rowPx = [80, 60, 40].includes(src.grid?.rowPx) ? src.grid.rowPx : 80;
  const rowUnitScale = 80 / rowPx;
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
      position: ["top", "bottom", "left", "right"].includes(src.altersBar?.position) ? src.altersBar.position : "bottom",
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
    // The unified edit popup's page background (flat/gradient/image +
    // page song). Shape is owned by resolveBackground in
    // components/v2/PageBackground.jsx — passed through opaque here so
    // this resolver never has to chase that model's fields.
    background: src.background && typeof src.background === "object" ? src.background : null,
    // Grid density (v0.192.0): columns across on a phone and the row unit
    // in px. Finer = smaller size steps when resizing. Existing widgets are
    // rescaled when the user changes it (ExperimentalDashboard.setDensity).
    grid: {
      phoneCols: [4, 5, 6, 8].includes(src.grid?.phoneCols) ? src.grid.phoneCols : 4,
      rowPx: [80, 60, 40].includes(src.grid?.rowPx) ? src.grid.rowPx : 80,
      // Space between widgets in px (v0.328.0). Unset = the board's own
      // spacing for its style, so boards nobody touched look as before.
      ...(isWidgetGap(src.grid?.gap) ? { gap: src.grid.gap } : null),
    },
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
    // A widget this build doesn't know (a newer version's widget arriving
    // by sync or restore, or one this board's registry lacks) is kept as it
    // was, out of sight, and written back with the page, so editing the
    // page here can never delete it from the other device (v0.277.0).
    const unknownWidgets = [];
    const rawWidgets = [
      ...(Array.isArray(p.widgets) ? p.widgets : []),
      ...(Array.isArray(p.unknownWidgets) ? p.unknownWidgets : []),
    ];
    for (const w of rawWidgets) {
      if (!w || typeof w !== "object") continue;
      const def = registry[w.widgetId];
      if (!def) { if (typeof w.widgetId === "string") unknownWidgets.push(w); continue; }
      let instanceId = typeof w.instanceId === "string" && w.instanceId ? w.instanceId : newInstanceId();
      if (seenInstance.has(instanceId)) instanceId = newInstanceId();
      seenInstance.add(instanceId);
      const minC = def.minSpan?.cols ?? 1, maxC = def.maxSpan?.cols ?? 12;
      const minR = def.minSpan?.rows ?? 1, maxR = Math.round((def.maxSpan?.rows ?? 8) * rowUnitScale);
      const rawCols = parseFloat(w.span?.cols);
      widgets.push({
        instanceId,
        widgetId: w.widgetId,
        span: {
          cols: clampStep(Number.isFinite(rawCols) ? rawCols * spanScale : NaN, minC, maxC, def.defaultSpan?.cols ?? 4),
          rows: clampStep(w.span?.rows, minR, maxR, def.defaultSpan?.rows ?? 1),
        },
        mode: HOME_MODES.includes(w.mode) ? w.mode : "normal",
        settings: w.settings && typeof w.settings === "object" ? w.settings : {},
        // Free-placement coordinates (grid cells, 0-based). Absent = this
        // widget just flows in order, which is the old behaviour.
        pos: w.pos && Number.isFinite(parseFloat(w.pos.x)) && Number.isFinite(parseFloat(w.pos.y))
          ? { x: Math.max(0, quarter(parseFloat(w.pos.x))), y: Math.max(0, quarter(parseFloat(w.pos.y))) }
          : null,
      });
    }
    out.pages.push({
      id: pageId,
      label: typeof p.label === "string" ? p.label : "",
      // Flow mode is RETIRED (owner, v0.209.0): every page is the free
      // grid. Stored layoutMode is ignored on read (never rewritten —
      // data preservation); legacy flow pages' pos-less widgets flow in
      // order until the board's fit pass seats them.
      layoutMode: "free",
      // Who this page is for. Empty = everyone. Non-empty = only shown
      // while one of these alters is fronting (soft hiding, not a lock).
      visibleTo: Array.isArray(p.visibleTo) ? p.visibleTo.filter((x) => typeof x === "string" && x) : [],
      // "only" = just these alters see it; "except" = everyone BUT them.
      visibleMode: p.visibleMode === "except" ? "except" : "only",
      // (A page-level song lived here briefly in v0.148.0; it's the `song`
      // WIDGET now, so a page can have one, several, or none.)
      widgets,
      ...(unknownWidgets.length ? { unknownWidgets } : {}),
      // "Show as" (owner, 2026-10-01): "auto" fits whatever screen shows
      // the page; phone / tablet / desktop keep that shape everywhere (a
      // phone-shaped page is a centred phone-width column on a computer).
      showAs: PAGE_SHOW_AS.includes(p.showAs) ? p.showAs : "auto",
      // When this page last changed — boards sync between devices now and
      // merge page by page (syncMerge.mergeBoards). Absent on older pages.
      ...(typeof p._ut === "string" ? { _ut: p._ut } : {}),
    });
  }
  if (out.pages.length === 0) out.pages.push({ id: "p1", label: "Home", layoutMode: "free", widgets: [] });
  out.defaultPageId = out.pages.some((p) => p.id === src.defaultPageId) ? src.defaultPageId : out.pages[0].id;
  // Pages deleted on this device, so a sync can't bring them back from the
  // other one (id → when). Kept through every read.
  if (src._removedPages && typeof src._removedPages === "object") out._removedPages = { ...src._removedPages };
  // When the board's look last changed by hand (see stampBoardChanges) and
  // which one-time tidy-ups already ran on it (ClassicHomeCanvas).
  if (typeof src._lt === "string") out._lt = src._lt;
  if (src._heals && typeof src._heals === "object") out._heals = { ...src._heals };
  return out;
}

export const PAGE_SHOW_AS = ["auto", "phone", "tablet", "desktop"];
// The column width a fixed "Show as" page is drawn at (px); auto/desktop
// use the full width.
export const SHOW_AS_MAX_WIDTH = { phone: 440, tablet: 820 };

// Page stamping lives in boardStamp.js (pure, so the sync tests can load
// it); re-exported here for the callers that already import it from here.
export { stampBoardChanges } from "@/lib/boardStamp";

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

// "Close gaps" is GRAVITY, not a re-flow. Every widget keeps its column and
// its size; it only slides UP into empty space directly above it, and the
// array order is preserved so nothing about the arrangement changes.
//
// packPositions (above) re-packs from scratch — it reassigns x, reorders as
// it goes, and rewrites span.rows from the measured height. That's right for
// switching a page into free placement, and wrong for closing gaps, which
// should never resize or rearrange anything.
export function compactVertically(widgets, gridCols) {
  // Boxes, not a cell set: with grid snapping off (v0.322.x) positions and
  // sizes can sit between grid lines, and a set of whole-cell keys would
  // let two such widgets slide into each other.
  const placed = [];
  const moved = new Map();

  // Top-down, left-to-right: a widget can only settle onto what's already
  // been placed above it, which is what makes the result stable.
  const ordered = [...(widgets || [])].sort(
    (a, b) => (a.pos?.y || 0) - (b.pos?.y || 0) || (a.pos?.x || 0) - (b.pos?.x || 0)
  );

  for (const w of ordered) {
    if (isLayered(w)) continue;
    const c = Math.min(Math.max(MIN_SPAN, w.span?.cols || 1), gridCols);
    const r = Math.max(MIN_SPAN, w.span?.rows || 1);
    const x = Math.max(0, Math.min(w.pos?.x || 0, gridCols - c));
    const b = { x, y: Math.max(0, w.pos?.y || 0), c, r };
    // Overlapping already? Settle downward first so gravity can't stack two
    // widgets in the same cells.
    let guard = 0;
    for (let clash = placed.find((p) => hits(b, p)); clash && guard < 500; clash = placed.find((p) => hits(b, p))) {
      b.y = clash.y + clash.r;
      guard += 1;
    }
    // Then fall as far up as there's room: onto the lowest bottom edge of
    // anything above that shares a column with it.
    const floor = placed
      .filter((p) => p.x < b.x + b.c && b.x < p.x + p.c && p.y + p.r <= b.y)
      .reduce((m, p) => Math.max(m, p.y + p.r), 0);
    b.y = floor;
    placed.push(b);
    // span is deliberately untouched.
    moved.set(w.instanceId, { ...w, pos: { x, y: b.y } });
  }
  // Original array order — "close gaps" must not reshuffle the list.
  return (widgets || []).map((w) => moved.get(w.instanceId) || w);
}

// ── Flow pages in edit mode (v0.322.x) ─────────────────────────────
// A flow page (profiles, the classic home) shows its widgets as a column
// in position order. Edit mode now shows the SAME column instead of a
// fixed grid, so what you arrange is what you see. Reordering there is a
// change of order, and positions are rewritten from the new order: each
// widget takes the next spot on its row, wrapping when the row is full —
// the same rule the column itself follows.
export function flowOrder(widgets) {
  return [...(widgets || [])].sort(
    (a, b) => (a.pos?.y || 0) - (b.pos?.y || 0) || (a.pos?.x || 0) - (b.pos?.x || 0)
  );
}

export function flowRepack(ordered, gridCols) {
  let x = 0;
  let y = 0;
  let rowH = 0;
  const EPS = 1e-6;
  return (ordered || []).map((w) => {
    const c = Math.min(Math.max(MIN_SPAN, w.span?.cols || 1), gridCols);
    const r = Math.max(MIN_SPAN, w.span?.rows || 1);
    if (x > 0 && x + c > gridCols + EPS) {
      y += rowH;
      x = 0;
      rowH = 0;
    }
    const pos = { x, y };
    x += c;
    rowH = Math.max(rowH, r);
    return (w.pos?.x === pos.x && w.pos?.y === pos.y) ? w : { ...w, pos };
  });
}

// Move one widget to another's place in a flow page's order.
export function flowMove(widgets, gridCols, fromId, toId) {
  const ordered = flowOrder(widgets);
  const from = ordered.findIndex((w) => w.instanceId === fromId);
  const to = ordered.findIndex((w) => w.instanceId === toId);
  if (from === -1 || to === -1 || from === to) return widgets;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const byId = new Map(flowRepack(ordered, gridCols).map((w) => [w.instanceId, w]));
  // Keep the stored array order; only positions change.
  return widgets.map((w) => byId.get(w.instanceId) || w);
}

// ── Grid snapping (v0.322.x) ───────────────────────────────────────
// Moves and resizes snap to whole grid cells unless snapping is off —
// for the whole app (SystemSettings.board_snap === false) or for one
// widget (settings.snap: true/false beats the app-wide choice). Off, they
// step by a quarter of a cell, so a widget can sit and size between the
// grid lines. Stored values are plain numbers either way.
export const FINE_STEP = 0.25;
export const MIN_SPAN = FINE_STEP;
export function widgetSnaps(widget, boardSnap = true) {
  const own = widget?.settings?.snap;
  if (own === true || own === false) return own;
  return boardSnap !== false;
}
export function snapStepFor(widget, boardSnap = true) {
  return widgetSnaps(widget, boardSnap) ? 1 : FINE_STEP;
}
export const isWhole = (n) => Math.abs(n - Math.round(n)) < 1e-6;
// True when a widget sits or sizes between grid lines.
export function isOffGrid(w) {
  return !isWhole(w?.pos?.x || 0) || !isWhole(w?.pos?.y || 0)
    || !isWhole(w?.span?.cols || 1) || !isWhole(w?.span?.rows || 1);
}

// ── Free-placement collision handling ──────────────────────────────
// Free placement means "put it where I want, gaps and all" — it does NOT
// mean widgets get to sit on top of each other. When one is moved or grown
// into space another occupies, the other one gets out of the way by moving
// DOWN. Never sideways (that would fight the user's chosen columns) and
// never upward-compacted (that would eat the gaps they deliberately left).

// ── Layers (v0.314.0) ──────────────────────────────────────────────
// A widget set to "Overlap other widgets" (settings.layered) sits on top
// of whatever is under it instead of pushing it aside: it never moves
// anything and nothing moves for it. Its stacking order is
// settings.zLayer (0 = normal, negative = behind the normal widgets),
// and settings.boxRotate tilts the whole widget. All three are optional;
// a board without them behaves exactly as before.
export const LAYER_MIN = -8;
export const LAYER_MAX = 20;
export const isLayered = (w) => w?.settings?.layered === true;
export function layerOf(w) {
  const n = Number(w?.settings?.zLayer);
  return Number.isFinite(n) ? Math.max(LAYER_MIN, Math.min(LAYER_MAX, Math.round(n))) : 0;
}
// The zLayer a widget gets from a layer button: "front" / "back" go past
// every other widget on the page, "forward" / "backward" step by one.
export function nextLayer(widgets, instanceId, action) {
  const list = widgets || [];
  const me = list.find((w) => w.instanceId === instanceId);
  if (!me) return 0;
  const others = list.filter((w) => w.instanceId !== instanceId).map(layerOf);
  const cur = layerOf(me);
  let next = cur;
  if (action === "front") next = Math.max(cur, (others.length ? Math.max(...others) : 0) + 1);
  else if (action === "back") next = Math.min(cur, (others.length ? Math.min(...others) : 0) - 1);
  else if (action === "forward") next = cur + 1;
  else if (action === "backward") next = cur - 1;
  return Math.max(LAYER_MIN, Math.min(LAYER_MAX, next));
}
// The tilt in degrees, -180…180 (0 = straight).
export function boxRotation(w) {
  const n = Number(w?.settings?.boxRotate);
  return Number.isFinite(n) ? Math.max(-180, Math.min(180, n)) : 0;
}

const box = (w, gridCols) => {
  const x = Math.max(0, Math.min(gridCols - 1, w.pos?.x || 0));
  const c = Math.max(MIN_SPAN, Math.min(w.span?.cols || 1, gridCols - x));
  return { x, y: Math.max(0, w.pos?.y || 0), c, r: Math.max(MIN_SPAN, w.span?.rows || 1) };
};
const hits = (a, b) => a.x < b.x + b.c && b.x < a.x + a.c && a.y < b.y + b.r && b.y < a.y + a.r;

export function hasOverlaps(widgets, gridCols) {
  const boxes = widgets.filter((w) => !isLayered(w)).map((w) => box(w, gridCols));
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
    // Overlapping widgets stay exactly where they were put.
    if (isLayered(w)) continue;
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

// First empty cell that fits `span` without displacing anything — new
// widgets land in the next available gap (or below everything), never
// interjected into the existing arrangement.
export function findFreeCell(widgets, gridCols, span = { cols: 1, rows: 1 }) {
  const cols = Math.max(1, Math.min(span.cols || 1, gridCols));
  const rows = Math.max(1, span.rows || 1);
  // Boxes rather than whole cells, so a widget sitting between grid lines
  // (snapping off) still blocks the cells it covers.
  const boxes = [];
  let maxY = 0;
  for (const w of widgets) {
    if (!w?.pos) continue;
    const b = { x: w.pos.x || 0, y: w.pos.y || 0, c: Math.max(MIN_SPAN, Math.min(w.span?.cols || 1, gridCols)), r: Math.max(MIN_SPAN, w.span?.rows || 1) };
    boxes.push(b);
    maxY = Math.max(maxY, b.y + b.r);
  }
  const top = Math.ceil(maxY);
  for (let y = 0; y <= top; y += 1) {
    for (let x = 0; x <= gridCols - cols; x += 1) {
      const cand = { x, y, c: cols, r: rows };
      if (!boxes.some((b) => hits(cand, b))) return { x, y };
    }
  }
  return { x: 0, y: top };
}

// ── Drop beside (v0.306.0) ──────────────────────────────────────────
// Putting two widgets on one row used to mean resizing each one to half
// width by hand first. Dropping a widget on the left or right edge of
// another one does it in one move: the moved widget joins that row on the
// chosen side and the row's widths are shared out evenly across the full
// width (respecting each widget's smallest width). Heights are untouched.
//
// The row is every widget that starts on the target's line. Returns the
// new widget list, or null when the row can't fit one more (the caller
// then falls back to an ordinary drop).
export function placeBeside(widgets, gridCols, movedId, targetId, side, minColsFor = () => 1) {
  const list = widgets || [];
  const moved = list.find((w) => w.instanceId === movedId);
  const target = list.find((w) => w.instanceId === targetId);
  if (!moved || !target || movedId === targetId || gridCols < 2) return null;
  const rowY = Math.max(0, target.pos?.y || 0);
  const row = list
    .filter((w) => w.instanceId !== movedId && Math.max(0, w.pos?.y || 0) === rowY && w.pos)
    .sort((a, b) => (a.pos?.x || 0) - (b.pos?.x || 0));
  const at = row.findIndex((w) => w.instanceId === targetId);
  if (at === -1) return null;
  row.splice(side === "left" ? at : at + 1, 0, moved);
  const n = row.length;
  if (n > gridCols) return null;
  const mins = row.map((w) => Math.max(1, Math.min(gridCols, Number(minColsFor(w)) || 1)));
  if (mins.reduce((s, m) => s + m, 0) > gridCols) return null;

  const base = Math.floor(gridCols / n);
  const extra = gridCols % n;
  const widths = row.map((_, i) => Math.max(mins[i], base + (i < extra ? 1 : 0)));
  // A widget's minimum can push the total over; take the excess back from
  // the widest ones that still have room above their own minimum.
  let over = widths.reduce((s, c) => s + c, 0) - gridCols;
  while (over > 0) {
    let pick = -1;
    for (let i = 0; i < n; i += 1) {
      if (widths[i] > mins[i] && (pick === -1 || widths[i] > widths[pick])) pick = i;
    }
    if (pick === -1) return null;
    widths[pick] -= 1;
    over -= 1;
  }

  const next = new Map();
  let x = 0;
  row.forEach((w, i) => {
    next.set(w.instanceId, { ...w, pos: { x, y: rowY }, span: { ...(w.span || {}), cols: widths[i] } });
    x += widths[i];
  });
  return list.map((w) => next.get(w.instanceId) || w);
}

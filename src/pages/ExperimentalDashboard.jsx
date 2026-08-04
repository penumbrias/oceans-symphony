// The experimental phone-like homescreen (Phase 1 MVP) — a second renderer
// over the same self-fetching dashboard components, driven by
// SystemSettings.experimental_home and the widget registry.
//
// Rendered BY Dashboard.jsx (branch at its return statement) so every
// modal, query, and deep-link effect keeps living there; this component
// receives an `api` bundle of handlers/data instead of re-implementing
// Dashboard's plumbing.
//
// Phase 1 scope: one page, CSS-grid canvas with column-span sizing,
// dnd-kit reorder in edit mode, per-widget display mode, app drawer
// (apps + add-widget), persistent quick-action bar. Pages/swipe,
// shortcuts, frequently-opened, Current Focus, and style modes are later
// phases (see the roadmap in the plan).
//
// A11y: when a11y-mode is on we render a single-column stack with
// up/down reorder buttons and no drag — the canvas uses inline grid
// styles, which the html.a11y-mode CSS collapse can't reach, so this
// branch must live in JS.

import React, { useMemo, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Pencil, Check, X, Plus, LayoutGrid, ArrowUp, ArrowDown,
  Undo2, Grid2x2, Star, Trash2, Image as ImageIcon, Settings2,
} from "lucide-react";
import {
  DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter, useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext, rectSortingStrategy, arrayMove, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WIDGET_REGISTRY, widgetLabel } from "@/lib/widgetRegistry";
import {
  resolveExperimentalHome, effectiveMode, newInstanceId, newPageId,
  HOME_STYLE_IDS, ACTION_BAR_BUTTONS, packPositions, resolveOverlaps, hasOverlaps,
} from "@/lib/experimentalHome";
import { getAccessibilitySettings } from "@/lib/useAccessibility";
import { useTerms } from "@/lib/useTerms";
import { useEdgeResize } from "@/hooks/useEdgeResize";
import { useFreeMove } from "@/hooks/useFreeMove";
import {
  pickLook, mergeLook, lookToStyle, resolveUserStyles, userStyleId, isUserStyle, newStyleId,
} from "@/lib/widgetLook";
import { HOME_STYLES, getStyleShell } from "@/lib/homeStyles";
import WidgetConfigSheet from "@/components/dashboard/WidgetConfigSheet";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import QuickCheckinButtons from "@/components/dashboard/QuickCheckinButtons";
import AppDrawer from "@/components/dashboard/AppDrawer";
import PinnedAltersGallery from "@/components/alters/PinnedAltersGallery";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

function useGridCols(phoneCols = 4) {
  // v2 grid: twice as dense as v1 (4/8/12 instead of 2/4/6) so app-shortcut
  // icons can be quarter-width on phones; stored v1 spans are doubled on
  // read (see resolveExperimentalHome) so layouts keep their proportions.
  // Phones can opt into 5 columns (home.grid.phoneCols).
  const calc = React.useCallback(
    () => (typeof window === "undefined" ? phoneCols : window.innerWidth >= 1024 ? 12 : window.innerWidth >= 640 ? 8 : phoneCols),
    [phoneCols]
  );
  const [cols, setCols] = useState(calc);
  React.useEffect(() => {
    setCols(calc());
    const onResize = () => setCols(calc());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [calc]);
  return cols;
}

// Per-widget appearance overrides. They're emitted as CSS VARIABLES on the
// widget's own wrapper, so anything inside it — including shadcn cards and
// buttons that read --radius — picks them up by inheritance. That's what
// makes "settings apply everywhere by default, individual widgets can
// override" true rather than aspirational.
// A widget's visual layer = its saved style (if it uses one) with its own
// overrides on top, emitted as CSS variables on its wrapper so everything
// inside inherits them. See src/lib/widgetLook.js.
export function widgetLookFor(settings = {}, userStyles = []) {
  const styleId = userStyleId(settings.style);
  const saved = styleId ? userStyles.find((s) => s.id === styleId) : null;
  return mergeLook(saved?.look || {}, pickLook(settings));
}

const TRASH_ID = "__widget_trash";

// Drop target that only exists while a widget is being dragged — hold a
// widget, drag it here, let go. Nothing to mis-tap the rest of the time.
function TrashZone({ active }) {
  const { setNodeRef, isOver } = useDroppable({ id: TRASH_ID });
  return (
    <div
      ref={setNodeRef}
      aria-hidden={!active}
      data-widget-trash="1"
      className="fixed left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2 rounded-full border text-sm transition-all pointer-events-none"
      style={{
        bottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 12px)",
        opacity: active ? 1 : 0,
        transform: `translateX(-50%) scale(${isOver ? 1.08 : 1})`,
        background: isOver ? "hsl(var(--destructive))" : "hsl(var(--background) / 0.95)",
        color: isOver ? "hsl(var(--destructive-foreground))" : "hsl(var(--muted-foreground))",
        borderColor: isOver ? "hsl(var(--destructive))" : "hsl(var(--border))",
        backdropFilter: "blur(8px)",
      }}
    >
      <X className="w-4 h-4" /> Drop to remove
    </div>
  );
}

function SortableWidget({ widget, def, editMode, gridCols, gridRef, api, onRemove, onSpan, onMode, onSettings, a11yStack, onMove, onConfigure, styleMode = "current", free = false, onPos, userStyles = [] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.instanceId,
    disabled: !editMode || a11yStack || free,
  });
  const t = useTerms();
  const defLabel = widgetLabel(def, t);
  const mode = effectiveMode(widget.mode, def.supportsModes);
  const spanCols = Math.min(widget.span?.cols || def.defaultSpan?.cols || 4, gridCols);
  const spanRows = widget.span?.rows || def.defaultSpan?.rows || 1;

  // Edge-resize (hold an edge 0.15s, then drag; snaps to grid cols / 80px
  // rows). Preview applies straight onto gridColumn/minHeight below.
  const resize = useEdgeResize({
    gridRef,
    gridCols,
    span: { cols: spanCols, rows: spanRows },
    min: def.minSpan,
    max: def.maxSpan,
    onCommit: (next) => onSpan(widget.instanceId, next, { manual: true }),
  });
  const shownCols = resize.preview?.cols ?? spanCols;
  const shownRows = resize.preview?.rows ?? spanRows;

  // Free placement: hold, drag to a cell, drop. Only wired when the page is
  // in free mode — flow pages keep dnd-kit's reordering.
  const cell = widget.pos || { x: 0, y: 0 };
  const move = useFreeMove({
    gridRef,
    gridCols,
    span: { cols: shownCols, rows: shownRows },
    pos: cell,
    enabled: free && editMode && !a11yStack,
    onCommit: (next) => onPos?.(widget.instanceId, next),
    onRemove: () => onRemove(widget.instanceId),
  });

  const look = widgetLookFor(widget.settings, userStyles);
  const bgUrl = useResolvedAvatarUrl(look.bgImage || "");
  const lookStyle = lookToStyle(look.bgImage ? { ...look, bgImage: bgUrl } : look);
  const handSized = widget.settings?.autoFit === false;
  const fixedHeight = shownRows > 1 || handSized || !!resize.preview;

  const style = a11yStack
    ? {}
    : free
      ? {
          gridColumn: `${cell.x + 1} / span ${shownCols}`,
          gridRow: `${cell.y + 1} / span ${shownRows}`,
          transform: move.drag ? `translate(${move.drag.dx}px, ${move.drag.dy}px)` : undefined,
          zIndex: move.dragging ? 45 : undefined,
          opacity: move.dragging ? (move.drag?.overTrash ? 0.4 : 0.9) : undefined,
          // The cell is the widget's boundary. Without this, anything taller
          // than its rows paints straight over its neighbour — which is the
          // overlap you see even when the coordinates are fine.
          overflow: "hidden",
          height: "100%",
        }
      : {
        gridColumn: `span ${shownCols}`,
        // Rows are a real height once they mean something: a widget you have
        // sized yourself (or made taller than one row, or are resizing right
        // now) gets exactly that height and scrolls inside it. Untouched
        // one-row widgets still size to their content, so nothing that was
        // never resized suddenly becomes a 80px letterbox.
        height: fixedHeight ? shownRows * 80 + (shownRows - 1) * 12 : undefined,
        minHeight: fixedHeight ? undefined : 56,
        // rectSortingStrategy assumes equal-size tiles and adds scale to its
        // transforms — with mixed spans that stretches widgets mid-drag.
        // Position-only transforms fix the "expands in weird ways" glitch.
        transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : transform),
        transition,
        zIndex: isDragging ? 40 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      };
  return (
    <>
    {/* Where it will land — drawn in the grid itself, so the preview is the
        actual cell rather than an approximation of it. */}
    {free && move.drag && (
      <div aria-hidden="true" className="rounded-xl border-2 border-dashed pointer-events-none"
        style={{
          gridColumn: `${move.drag.target.x + 1} / span ${shownCols}`,
          gridRow: `${move.drag.target.y + 1} / span ${shownRows}`,
          borderColor: "color-mix(in srgb, var(--v2-accent, hsl(var(--primary))) 60%, transparent)",
        }} />
    )}
    <div ref={setNodeRef} data-widget-id={widget.instanceId} style={style} className="relative min-w-0">
      {editMode && (
        <div className="absolute -top-2 -right-2 z-30 flex items-center gap-1">
          {/* Widget options (rename / mode / style / icon) */}
          <button
            type="button"
            aria-label={`Configure ${widget.settings?.label || defLabel}`}
            onClick={() => onConfigure(widget.instanceId)}
            className="w-6 h-6 rounded-full bg-background border border-border text-muted-foreground hover:text-foreground flex items-center justify-center shadow-sm"
          >
            <Settings2 className="w-3 h-3" />
          </button>
          {/* A11y-stack reorder buttons */}
          {a11yStack && (
            <span className="h-6 flex items-center rounded-full bg-background border border-border shadow-sm overflow-hidden">
              <button type="button" aria-label="Move up" onClick={() => onMove(widget.instanceId, -1)}
                className="px-1 h-full text-muted-foreground hover:text-foreground"><ArrowUp className="w-3 h-3" /></button>
              <button type="button" aria-label="Move down" onClick={() => onMove(widget.instanceId, 1)}
                className="px-1 h-full text-muted-foreground hover:text-foreground"><ArrowDown className="w-3 h-3" /></button>
            </span>
          )}
        </div>
      )}
      <div
        data-widget-content="1"
        {...(editMode && !a11yStack ? (free ? move.getMoveProps() : { ...attributes, ...listeners }) : {})}
        onContextMenu={editMode ? (e) => e.preventDefault() : undefined}
        className={[
          // Style shell (homeStyles.js) — per-widget override beats the
          // page style; "current"/"barebones" add no shell.
          getStyleShell(
            HOME_STYLE_IDS.includes(widget.settings?.style) ? widget.settings.style : styleMode
          ),
          editMode ? "relative select-none ring-1 ring-dashed ring-border/70 cursor-grab active:cursor-grabbing" : "",
        ].join(" ").trim() || undefined}
        style={{
          ...lookStyle,
          borderRadius: "var(--v2-radius, 8px)",
          // The content fills the widget's box in both layout modes, so the
          // border you see is the size you set; overflow scrolls inside it.
          ...(free || fixedHeight
            ? { height: "100%", overflowY: "auto" }
            : null),
          ...(editMode ? {
            // pan-y: vertical scrolling passes through; the 300ms hold-still
            // sensors lift the widget instead. Callout/user-select suppression
            // stops iOS's long-press magnifier from eating the hold.
            touchAction: "pan-y",
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
            minHeight: 56,
            paddingTop: 18,
          } : null),
        }}
      >
        {editMode && (
          <span className="absolute top-0.5 left-2 text-[0.625rem] uppercase tracking-wide text-muted-foreground/70 pointer-events-none truncate max-w-[70%]">
            {(widget.settings?.label || defLabel).slice(0, 60)}
          </span>
        )}
        {/* While editing, the widget's own controls are inert — a hold to
            move should never also start an activity or save a status. */}
        <div style={{ height: "100%", minHeight: 0, ...(editMode ? { pointerEvents: "none" } : null) }}>
        {look.css && (
          <style dangerouslySetInnerHTML={{
            __html: `[data-widget-id="${widget.instanceId}"]{${look.css}}`,
          }} />
        )}
        {def.render({
          mode,
          settings: widget.settings || {},
          instanceId: widget.instanceId,
          api,
          updateSettings: (patch) => onSettings?.(widget.instanceId, patch),
        })}
        </div>
      </div>

      {/* Edge-resize handles — siblings of the drag wrapper so dnd-kit's
          listeners never see their pointer events. Hold 0.15s, then drag. */}
      {editMode && !a11yStack && !isDragging && (
        <>
          <div
            {...resize.getHandleProps("x")}
            aria-hidden="true"
            className="absolute -right-1.5 inset-y-3 w-5 z-20 flex items-center justify-center cursor-ew-resize"
          >
            <span className="w-1 h-8 rounded-full bg-border" />
          </div>
          <div
            {...resize.getHandleProps("y")}
            aria-hidden="true"
            className="absolute -bottom-1.5 inset-x-3 h-5 z-20 flex items-center justify-center cursor-ns-resize"
          >
            <span className="h-1 w-8 rounded-full bg-border" />
          </div>
          <div
            {...resize.getHandleProps("xy")}
            aria-hidden="true"
            className="absolute -bottom-1.5 -right-1.5 w-6 h-6 z-20 flex items-center justify-center cursor-nwse-resize"
          >
            <span className="w-2 h-2 rounded-sm border-b-2 border-r-2 border-muted-foreground/70" />
          </div>
        </>
      )}
      {/* Live size badge while resizing */}
      {resize.preview && (
        <span className="absolute inset-0 z-30 grid place-items-center pointer-events-none">
          <span className="px-2 py-1 rounded-lg bg-background/90 border border-border text-xs font-medium tabular-nums shadow-sm">
            {shownCols} × {shownRows}
          </span>
        </span>
      )}
    </div>
    </>
  );
}

// `registry` and `settingsField` are injected so UI v2 can reuse this
// canvas (grid, drag/resize, pages, edit mode) with its own redesigned
// widget set and its own saved layout, without forking the mechanics.
export default function ExperimentalDashboard({
  settingsRow,
  api,
  registry = WIDGET_REGISTRY,
  settingsField = "experimental_home",
  // v2 injects this: leaving "back to classic" must flip ui_v2.enabled,
  // not this layout blob's own enabled flag (which nothing reads in v2).
  onExitToClassic = null,
}) {
  const qc = useQueryClient();
  const t = useTerms();
  const a11yStack = !!getAccessibilitySettings().a11yMode;
  const [editMode, setEditMode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // One AssetPickerModal serves wallpaper AND per-widget icon overrides:
  // null | "wallpaper" | { icon: instanceId }
  const [assetPickerFor, setAssetPickerFor] = useState(null);
  const [configId, setConfigId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const gridRef = React.useRef(null);

  // The apps button (top bar) and "Edit the home screen" (Display options)
  // trigger the drawer / edit mode from outside this component.
  React.useEffect(() => {
    const openApps = () => { setDrawerOpen(true); };
    const editHome = () => { setEditMode(true); };
    window.addEventListener("os-v2-open-apps", openApps);
    window.addEventListener("os-v2-edit-home", editHome);
    try {
      if (sessionStorage.getItem("symphony_v2_open-apps") === "1") {
        sessionStorage.removeItem("symphony_v2_open-apps"); setDrawerOpen(true);
      }
      if (sessionStorage.getItem("symphony_v2_edit-home") === "1") {
        sessionStorage.removeItem("symphony_v2_edit-home"); setEditMode(true);
      }
    } catch { /* storage off */ }
    return () => {
      window.removeEventListener("os-v2-open-apps", openApps);
      window.removeEventListener("os-v2-edit-home", editHome);
    };
  }, []);

  const home = useMemo(
    () => resolveExperimentalHome(settingsRow?.[settingsField], registry),
    [settingsRow, settingsField, registry]
  );
  const gridCols = useGridCols(home.grid?.phoneCols || 4);
  // The user's own saved styles live beside the layout, on the settings row,
  // so they travel with backups and device sync for free.
  const userStyles = useMemo(() => resolveUserStyles(settingsRow?.ui_v2_styles), [settingsRow?.ui_v2_styles]);
  const persistStyles = useCallback(async (next) => {
    try {
      if (settingsRow?.id) await base44.entities.SystemSettings.update(settingsRow.id, { ui_v2_styles: next });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) { toast.error(e?.message || "Couldn't save the style"); }
  }, [settingsRow?.id, qc]);
  // Phase 2: multiple pages. activePageId is transient (each visit starts
  // on the default page); the pages themselves live in experimental_home.
  const [activePageId, setActivePageId] = useState(null);
  const [swipeDir, setSwipeDir] = useState(0); // -1 back, 1 forward — drives the slide-in
  const page =
    home.pages.find((p) => p.id === activePageId) ||
    home.pages.find((p) => p.id === home.defaultPageId) ||
    home.pages[0];
  const pageIdx = home.pages.findIndex((p) => p.id === page.id);

  const goToPage = useCallback((idx) => {
    if (idx < 0 || idx >= home.pages.length || home.pages[idx].id === page.id) return;
    setSwipeDir(idx > pageIdx ? 1 : -1);
    setActivePageId(home.pages[idx].id);
  }, [home.pages, page.id, pageIdx]);

  const persist = useCallback(async (nextHome) => {
    try {
      if (settingsRow?.id) {
        await base44.entities.SystemSettings.update(settingsRow.id, { [settingsField]: nextHome });
      } else {
        await base44.entities.SystemSettings.create({ [settingsField]: nextHome });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't save the homescreen");
    }
  }, [settingsRow?.id, qc, settingsField]);

  const updatePageWidgets = useCallback((mutate) => {
    const next = {
      ...home,
      pages: home.pages.map((p) => (p.id === page.id ? { ...p, widgets: mutate(p.widgets) } : p)),
    };
    persist(next);
  }, [home, page.id, persist]);

  // ── Edit operations ────────────────────────────────────────────
  const handleRemove = (instanceId) => updatePageWidgets((ws) => ws.filter((w) => w.instanceId !== instanceId));
  const pageIsFree = page.layoutMode === "free";
  const handleSpan = (instanceId, patch, opts = {}) =>
    updatePageWidgets((ws) => {
      const next = ws.map((w) => (w.instanceId === instanceId
        ? {
            ...w,
            span: { ...w.span, ...patch },
            // Size it by hand and it stays that size; content scrolls inside.
            settings: opts.manual ? { ...w.settings, autoFit: false } : w.settings,
          }
        : w));
      return pageIsFree ? resolveOverlaps(next, gridCols, instanceId) : next;
    });
  const handleMode = (instanceId, mode) =>
    updatePageWidgets((ws) => ws.map((w) => (w.instanceId === instanceId ? { ...w, mode } : w)));
  const handleSettings = (instanceId, patch) =>
    updatePageWidgets((ws) =>
      ws.map((w) => (w.instanceId === instanceId ? { ...w, settings: { ...w.settings, ...patch } } : w))
    );
  const handleMove = (instanceId, dir) =>
    updatePageWidgets((ws) => {
      const i = ws.findIndex((w) => w.instanceId === instanceId);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= ws.length) return ws;
      return arrayMove(ws, i, j);
    });
  const handleAddWidget = (widgetId, settings = {}, { edit = true, mode = "normal" } = {}) => {
    const def = registry[widgetId];
    if (!def) return;
    // Single-instance is per PAGE — the same widget CAN live on several
    // pages (v0.91.0 over-tightened this to all-pages; tester wants per-page).
    if (!def.supportsMultiInstance && page.widgets.some((w) => w.widgetId === widgetId)) {
      toast.info("Already on this page");
      return;
    }
    updatePageWidgets((ws) => {
      const added = { instanceId: newInstanceId(), widgetId, span: { ...(def.defaultSpan || { cols: 4, rows: 1 }) }, mode: effectiveMode(mode, def.supportsModes), settings };
      const next = [...ws, added];
      // On a free page a new widget needs a cell of its own, or it lands on
      // top of whatever is at the origin.
      return pageIsFree ? resolveOverlaps(next.map((w) => (w.pos ? w : { ...w, pos: { x: 0, y: 0 } })), gridCols, null) : next;
    });
    toast.success(`${widgetLabel(def, t)} added`);
    if (edit) {
      setDrawerOpen(false);
      setEditMode(true);
    }
    // Pin-while-editing keeps the drawer open so several apps can be pinned
    // in a row.
  };

  const setWallpaper = (url) => persist({ ...home, wallpaper: { url: url || "" } });
  // Route the shared AssetPickerModal's selection to whatever asked for it.
  const handleAssetSelected = (url) => {
    if (assetPickerFor === "wallpaper") setWallpaper(url);
    else if (assetPickerFor?.icon) handleSettings(assetPickerFor.icon, { iconUrl: url || "" });
    else if (assetPickerFor?.bg) handleSettings(assetPickerFor.bg, { bgImage: url || "" });
    setAssetPickerFor(null);
  };

  // Off → bottom → top → off.
  const cycleAltersBar = () => {
    const cur = home.altersBar;
    const next = !cur.enabled
      ? { enabled: true, position: "bottom" }
      : cur.position === "bottom"
        ? { enabled: true, position: "top" }
        : { enabled: false, position: "bottom" };
    persist({ ...home, altersBar: next });
  };

  // ── Page operations (Phase 2) ──────────────────────────────────
  const handleAddPage = () => {
    const id = newPageId();
    persist({ ...home, pages: [...home.pages, { id, label: `Page ${home.pages.length + 1}`, widgets: [] }] });
    setSwipeDir(1);
    setActivePageId(id);
  };
  const handleRenamePage = (label) => {
    persist({ ...home, pages: home.pages.map((p) => (p.id === page.id ? { ...p, label } : p)) });
  };
  const handleSetDefaultPage = () => persist({ ...home, defaultPageId: page.id });
  const handleDeletePage = () => {
    if (home.pages.length <= 1) return;
    const remaining = home.pages.filter((p) => p.id !== page.id);
    // Never drop widgets with the page — move them to the first remaining
    // page so nothing the user configured silently disappears.
    if (page.widgets.length > 0) {
      remaining[0] = { ...remaining[0], widgets: [...remaining[0].widgets, ...page.widgets] };
      toast.info(`Widgets moved to "${remaining[0].label || "Page 1"}"`);
    }
    persist({
      ...home,
      pages: remaining,
      defaultPageId: home.defaultPageId === page.id ? remaining[0].id : home.defaultPageId,
    });
    setSwipeDir(-1);
    setActivePageId(remaining[0].id);
  };
  const handlePos = (instanceId, pos) =>
    updatePageWidgets((ws) =>
      resolveOverlaps(
        ws.map((w) => (w.instanceId === instanceId ? { ...w, pos } : w)),
        gridCols,
        instanceId
      )
    );

  // Switching a page to free placement seeds every widget with the cell it
  // already occupies, so the switch itself never rearranges anything.
  const toggleLayoutMode = () => {
    const next = page.layoutMode === "free" ? "flow" : "free";
    // Measure what's actually on screen before packing, so a widget that
    // grew past its declared rows keeps the space it was using.
    const measured = {};
    if (next === "free" && gridRef.current) {
      for (const node of gridRef.current.querySelectorAll("[data-widget-id]")) {
        const h = node.getBoundingClientRect().height;
        if (h > 0) measured[node.dataset.widgetId] = Math.max(1, Math.ceil((h + 12) / 92));
      }
    }
    persist({
      ...home,
      pages: home.pages.map((p) => (p.id !== page.id ? p : {
        ...p,
        layoutMode: next,
        widgets: next === "free" ? packPositions(p.widgets, gridCols, measured) : p.widgets,
      })),
    });
  };

  const handleBackToClassic = () => (onExitToClassic ? onExitToClassic() : persist({ ...home, enabled: false }));
  const toggleActionBarButton = (id) => {
    const has = home.actionBar.buttonIds.includes(id);
    persist({
      ...home,
      actionBar: {
        ...home.actionBar,
        buttonIds: has ? home.actionBar.buttonIds.filter((x) => x !== id) : [...home.actionBar.buttonIds, id],
      },
    });
  };

  // Hold-still-to-lift (owner spec): 0.3s stationary hold starts a move;
  // tolerance cancels activation if the pointer moves during the delay, so
  // a scroll gesture can never lift a widget. MouseSensor + TouchSensor
  // (NOT PointerSensor — mixing it with TouchSensor double-handles a touch).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 300, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } })
  );
  const handleDragEnd = ({ active, over }) => {
    setDraggingId(null);
    if (over?.id === TRASH_ID) { handleRemove(active.id); return; }
    if (!over || active.id === over.id) return;
    updatePageWidgets((ws) => {
      const from = ws.findIndex((w) => w.instanceId === active.id);
      const to = ws.findIndex((w) => w.instanceId === over.id);
      if (from === -1 || to === -1) return ws;
      return arrayMove(ws, from, to);
    });
  };

  const wallpaperUrl = useResolvedAvatarUrl(home.wallpaper?.url || "");

  const barIds = home.actionBar.enabled ? home.actionBar.buttonIds : [];
  // PinnedAltersGallery renders null with no pins — hide the bar chrome too
  // so an empty strip doesn't sit there (but keep it visible in edit mode so
  // the toggle has visible feedback).
  const hasPinnedAlters = (api?.alters || []).some((a) => a.is_pinned && !a.is_archived);
  const altersBarOn = home.altersBar.enabled && (hasPinnedAlters || editMode);
  const altersTop = altersBarOn && home.altersBar.position === "top";
  const altersBottom = altersBarOn && home.altersBar.position === "bottom";
  const widgets = page.widgets.filter((w) => registry[w.widgetId]);
  const freeMode = page.layoutMode === "free" && !a11yStack;

  // One pass, per page and width: give every widget the rows its content
  // actually needs, then untangle. Done centrally and written once —
  // per-widget writes raced each other and walked the layout down the page.
  // Runs again only when the page or the column count changes.
  const fitted = React.useRef("");
  React.useEffect(() => {
    if (!freeMode || !settingsRow?.id || !gridRef.current) return undefined;
    const stamp = `${page.id}:${gridCols}`;
    if (fitted.current === stamp) return undefined;
    const id = setTimeout(() => {
      const grid = gridRef.current;
      if (!grid) return;
      const needed = {};
      for (const node of grid.querySelectorAll("[data-widget-id]")) {
        const content = node.querySelector("[data-widget-content]");
        if (!content) continue;
        needed[node.dataset.widgetId] = Math.max(1, Math.ceil((content.scrollHeight + 12) / 92));
      }
      const grown = page.widgets.map((w) => {
        if (w.settings?.autoFit === false) return w;
        const def = registry[w.widgetId];
        const want = Math.min(def?.maxSpan?.rows ?? 8, needed[w.instanceId] || 1);
        return want > (w.span?.rows || 1) ? { ...w, span: { ...w.span, rows: want } } : w;
      });
      const changed = grown.some((w, i) => w.span?.rows !== page.widgets[i].span?.rows);
      if (!changed && !hasOverlaps(page.widgets, gridCols)) { fitted.current = stamp; return; }
      fitted.current = stamp;
      updatePageWidgets(() => resolveOverlaps(grown, gridCols));
    }, 120);
    return () => clearTimeout(id);
  }, [freeMode, page.id, page.widgets, gridCols, registry, settingsRow?.id, updatePageWidgets]);
  // Enough rows to hold everything plus room to move things down into.
  const freeRows = freeMode
    ? Math.max(6, ...widgets.map((w) => (w.pos?.y || 0) + (w.span?.rows || 1))) + (editMode ? 4 : 0)
    : 0;
  // Widgets that embed sub-surfaces need to know what else is placed —
  // e.g. CurrentFronters hides its inline status note when the standalone
  // status_note widget is on the page (mirrors classic layoutEnabled logic).
  const widgetApi = { ...api, statusNotePlaced: widgets.some((w) => w.widgetId === "status_note") };

  const canvas = (
    <div
      ref={gridRef}
      style={a11yStack ? undefined : {
        display: "grid",
        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        gap: home.styleMode === "barebones" ? "0.375rem" : "0.75rem",
        alignItems: "start",
        // Free pages need fixed-height rows for cell coordinates to mean
        // anything, plus a few spare rows so there's somewhere to drag TO.
        ...(freeMode ? { gridAutoRows: "80px", gridTemplateRows: `repeat(${freeRows}, 80px)` } : null),
      }}
      className={a11yStack ? "space-y-3" : undefined}
    >
      {widgets.map((w) => (
        <SortableWidget
          key={w.instanceId}
          widget={w}
          def={registry[w.widgetId]}
          editMode={editMode}
          gridCols={gridCols}
          gridRef={gridRef}
          api={widgetApi}
          a11yStack={a11yStack}
          onRemove={handleRemove}
          onSpan={handleSpan}
          onMode={handleMode}
          onSettings={handleSettings}
          onMove={handleMove}
          onConfigure={setConfigId}
          styleMode={home.styleMode}
          free={freeMode}
          onPos={handlePos}
          userStyles={userStyles}
        />
      ))}
    </div>
  );

  return (
    <div className="pt-1 relative isolate overflow-x-clip" data-tour="experimental-home" data-home-style={home.styleMode}>
      {/* Wallpaper — fixed under everything in this stacking context; the
          isolate on the root keeps the negative z-index from escaping. */}
      {wallpaperUrl && (
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <img src={wallpaperUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-background/55" />
        </div>
      )}
      {/* Edit-mode toolbar */}
      {editMode && (
      <div className="flex flex-wrap items-center justify-end gap-1.5 mb-2">
        {editMode && (
          <>
            <button
              type="button"
              onClick={handleBackToClassic}
              className="text-xs px-2.5 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex items-center gap-1"
            >
              <Undo2 className="w-3 h-3" /> Back to classic
            </button>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full border border-border/50">
              <span className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">Bar:</span>
              {ACTION_BAR_BUTTONS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleActionBarButton(b.id)}
                  title={b.label}
                  className={`text-[0.625rem] px-1.5 py-0.5 rounded-full border whitespace-nowrap transition-all ${
                    home.actionBar.buttonIds.includes(b.id)
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/40 text-muted-foreground"
                  }`}
                >
                  {b.label.replace("Quick ", "").replace("Start ", "▶")}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleLayoutMode}
              title="Flow packs widgets in order; Free lets you put each one where you want, gaps and all"
              className={`text-[0.625rem] px-2 py-1 rounded-full border whitespace-nowrap transition-all ${
                page.layoutMode === "free"
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              Layout: {page.layoutMode === "free" ? "Free" : "Flow"}
            </button>
            <button
              type="button"
              onClick={() => persist({ ...home, grid: { phoneCols: home.grid.phoneCols === 5 ? 4 : 5 } })}
              title="Phone grid columns (4 or 5 across)"
              className="text-[0.625rem] px-2 py-1 rounded-full border border-border/40 text-muted-foreground whitespace-nowrap hover:text-foreground transition-all"
            >
              Cols: {home.grid.phoneCols}
            </button>
            <button
              type="button"
              onClick={() => setStylePickerOpen(true)}
              title="Choose a widget style for this homescreen"
              className="text-[0.625rem] px-2 py-1 rounded-full border border-border/40 text-muted-foreground whitespace-nowrap hover:text-foreground transition-all"
            >
              Style: {HOME_STYLES.find((s) => s.id === home.styleMode)?.label || "Current"}
            </button>
            <span className="flex items-center rounded-full border border-border/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setAssetPickerFor("wallpaper")}
                title="Choose a wallpaper from your assets"
                className={`text-[0.625rem] pl-2 pr-1.5 py-1 flex items-center gap-1 whitespace-nowrap transition-all ${
                  home.wallpaper?.url ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ImageIcon className="w-3 h-3" /> Wallpaper
              </button>
              {home.wallpaper?.url && (
                <button
                  type="button"
                  onClick={() => setWallpaper("")}
                  aria-label="Remove wallpaper"
                  title="Remove wallpaper"
                  className="px-1.5 py-1 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
            <button
              type="button"
              onClick={cycleAltersBar}
              title={`Pinned ${t.alters} bar: off / bottom / top`}
              className={`text-[0.625rem] px-2 py-1 rounded-full border whitespace-nowrap transition-all ${
                home.altersBar.enabled
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/40 text-muted-foreground"
              }`}
            >
              {t.Alters} bar: {home.altersBar.enabled ? (home.altersBar.position === "top" ? "Top" : "Bottom") : "Off"}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open app drawer"
          title="Apps & widgets"
          className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          aria-pressed={editMode}
          aria-label={editMode ? "Done editing" : "Edit homescreen"}
          title={editMode ? "Done" : "Edit homescreen"}
          className={`min-w-[34px] min-h-[34px] flex items-center justify-center rounded-xl transition-colors ${
            editMode ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Check className="w-4 h-4" />
        </button>
      </div>
      )}

      {/* Pinned-alters bar (top position) — persists across page swipes. */}
      {altersTop && (
        <div className="mb-2 rounded-2xl border border-border/40 bg-card/50 px-2 py-1.5">
          <PinnedAltersGallery showHeader={false} />
        </div>
      )}

      {/* Page dots — tappable; edit mode adds a "+" for a new page. */}
      {(home.pages.length > 1 || editMode) && (
        <div className="flex items-center justify-center gap-1.5 mb-2" role="tablist" aria-label="Homescreen pages">
          {home.pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === page.id}
              aria-label={p.label || `Page ${i + 1}`}
              title={p.label || `Page ${i + 1}`}
              onClick={() => goToPage(i)}
              className="min-w-[24px] min-h-[24px] flex items-center justify-center"
            >
              <span
                // Other pages use the foreground colour at low opacity —
                // muted-foreground can vanish into a dark background, which
                // made it look like there was only one page.
                className={`rounded-full transition-all ${
                  p.id === page.id ? "w-2.5 h-2.5 bg-primary" : "w-2 h-2 bg-foreground opacity-25"
                }`}
              />
            </button>
          ))}
          {editMode && (
            <button
              type="button"
              onClick={handleAddPage}
              aria-label="Add page"
              title="Add page"
              className="min-w-[24px] min-h-[24px] flex items-center justify-center rounded-full text-muted-foreground hover:text-primary"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Page name / default / delete — edit mode only. */}
      {editMode && (
        <div className="flex items-center justify-center gap-1.5 mb-3">
          <input
            key={page.id}
            defaultValue={page.label}
            placeholder={`Page ${pageIdx + 1}`}
            aria-label="Page name"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== page.label) handleRenamePage(v);
            }}
            className="h-7 w-32 px-2 rounded-lg border border-border/50 bg-background text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleSetDefaultPage}
            aria-pressed={home.defaultPageId === page.id}
            aria-label="Make this the default page"
            title={home.defaultPageId === page.id ? "Default page" : "Make this the default page"}
            className={`min-w-[28px] min-h-[28px] flex items-center justify-center rounded-lg transition-colors ${
              home.defaultPageId === page.id
                ? "text-amber-500 bg-amber-500/10"
                : "text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
            }`}
          >
            <Star className="w-3.5 h-3.5" fill={home.defaultPageId === page.id ? "currentColor" : "none"} />
          </button>
          {home.pages.length > 1 && (
            <button
              type="button"
              onClick={handleDeletePage}
              aria-label="Delete this page"
              title="Delete this page (widgets move to the first page)"
              className="min-w-[28px] min-h-[28px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {widgets.length === 0 && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="w-full py-16 rounded-2xl border-2 border-dashed border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex flex-col items-center gap-2"
        >
          <Grid2x2 className="w-8 h-8" />
          <span className="text-sm font-medium">
            {home.pages.length > 1 ? "Empty page — tap to add widgets" : "Empty homescreen — tap to add widgets"}
          </span>
        </button>
      )}

      {a11yStack ? (
        canvas
      ) : !editMode ? (
        // Swipe between pages (finger drag or trackpad); the key remount
        // plays a directional slide when the page changes via dots too.
        <motion.div
          key={page.id}
          // min-height so swipes register on the empty space of sparse pages,
          // not just on the widgets themselves.
          className={home.pages.length > 1 ? "min-h-[55vh]" : undefined}
          initial={swipeDir === 0 ? false : { x: swipeDir * 72, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          {...(home.pages.length > 1
            ? {
                drag: "x",
                dragDirectionLock: true,
                dragConstraints: { left: 0, right: 0 },
                dragElastic: 0.12,
                onDragEnd: (_e, info) => {
                  if (info.offset.x < -60 || info.velocity.x < -500) goToPage(pageIdx + 1);
                  else if (info.offset.x > 60 || info.velocity.x > 500) goToPage(pageIdx - 1);
                },
              }
            : {})}
        >
          {canvas}
        </motion.div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragStart={({ active }) => setDraggingId(active.id)}
          onDragCancel={() => setDraggingId(null)}
          onDragEnd={handleDragEnd}>
          <TrashZone active={!!draggingId} />
          <SortableContext items={widgets.map((w) => w.instanceId)} strategy={rectSortingStrategy}>
            {canvas}
          </SortableContext>
        </DndContext>
      )}

      {/* Persistent bottom stack — pinned-alters bar (bottom position) above
          the quick-action bar; both float above the bottom nav and stay put
          while swiping between pages. */}
      {(barIds.length > 0 || altersBottom) && (
        <div
          className="fixed left-0 right-0 z-40 flex flex-col items-center gap-1.5 pointer-events-none"
          style={{ bottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 8px)" }}
        >
          {altersBottom && (
            <div className="pointer-events-auto max-w-full overflow-x-auto px-2 py-1 rounded-2xl bg-background/90 backdrop-blur-xl border border-border/60 shadow-lg mx-3">
              <PinnedAltersGallery showHeader={false} />
            </div>
          )}
          {barIds.length > 0 && (
            <div className="pointer-events-auto max-w-full overflow-x-auto px-3 py-1.5 rounded-2xl bg-background/90 backdrop-blur-xl border border-border/60 shadow-lg mx-3">
              <QuickCheckinButtons
                dense
                showCheckin={barIds.includes("quick_checkin")}
                hold={api?.hold || {}}
                holdProgress={api?.holdProgress || 0}
                holdActive={api?.holdActive || false}
                show={{
                  start_activity: barIds.includes("start_activity"),
                  start_symptom: barIds.includes("start_symptom"),
                  quick_task: barIds.includes("quick_task"),
                  quick_plan: barIds.includes("quick_plan"),
                }}
                on={api?.quickOn || {}}
                quickActionsSlot={api?.quickActionsSlot || null}
              />
            </div>
          )}
        </div>
      )}
      {/* Reserve space so the fixed bars don't cover the last widgets. */}
      {(barIds.length > 0 || altersBottom) && (
        <div
          style={{
            height:
              (barIds.length > 0 ? 68 : 0) +
              (altersBottom ? 96 : 0),
          }}
          aria-hidden="true"
        />
      )}

      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placedWidgetIds={page.widgets.map((w) => w.widgetId)}
        registry={registry}
        onAddWidget={handleAddWidget}
        api={widgetApi}
        userStyles={userStyles}
        onAddShortcut={(appId) => handleAddWidget("app_shortcut", { targetId: appId }, { edit: false })}
        pinOnTap={editMode}
        folders={home.drawer.folders}
        onSaveFolders={(folders) => persist({ ...home, drawer: { ...home.drawer, folders } })}
        order={home.drawer.order || []}
        onSaveOrder={(order) => persist({ ...home, drawer: { ...home.drawer, order } })}
      />

      <AssetPickerModal
        open={!!assetPickerFor}
        onClose={() => setAssetPickerFor(null)}
        onSelect={handleAssetSelected}
      />

      {/* Per-widget options sheet — derived live from home state. */}
      <WidgetConfigSheet
        onRemove={(id) => { handleRemove(id); setConfigId(null); }}
        userStyles={userStyles}
        onSaveStyle={(label, look) => persistStyles([...userStyles, { id: newStyleId(), label, look }])}
        onDeleteStyle={(id) => persistStyles(userStyles.filter((x) => x.id !== id))}
        onPickBackground={(instanceId) => setAssetPickerFor({ bg: instanceId })}
        api={widgetApi}
        widget={widgets.find((w) => w.instanceId === configId) || null}
        def={registry[widgets.find((w) => w.instanceId === configId)?.widgetId]}
        pageStyleId={home.styleMode}
        onClose={() => setConfigId(null)}
        onMode={handleMode}
        onSettings={handleSettings}
        onPickIcon={(instanceId) => setAssetPickerFor({ icon: instanceId })}
      />

      {/* Page style picker */}
      <Drawer open={stylePickerOpen} onOpenChange={(v) => { if (!v) setStylePickerOpen(false); }}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="pb-1">
            <DrawerTitle className="text-base">Homescreen style</DrawerTitle>
            <DrawerDescription className="text-xs">
              Applies to every widget on the homescreen. Individual widgets can override it from their gear menu.
            </DrawerDescription>
          </DrawerHeader>
          <div
            className="px-4 pb-6 space-y-1 overflow-y-auto overscroll-contain"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
          >
            {HOME_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { persist({ ...home, styleMode: s.id }); setStylePickerOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                  home.styleMode === s.id
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/40 hover:border-border"
                }`}
              >
                <span className="font-medium">{s.label}</span>
                <span className="text-xs text-muted-foreground block">{s.description}</span>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

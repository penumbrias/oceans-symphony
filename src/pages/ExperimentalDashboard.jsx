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
  Pencil, Check, X, Minus, Plus, LayoutGrid, ArrowUp, ArrowDown,
  Undo2, Grid2x2, Star, Trash2, Image as ImageIcon,
} from "lucide-react";
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, rectSortingStrategy, arrayMove, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WIDGET_REGISTRY } from "@/lib/widgetRegistry";
import {
  resolveExperimentalHome, effectiveMode, newInstanceId, newPageId, HOME_MODES,
  ACTION_BAR_BUTTONS,
} from "@/lib/experimentalHome";
import { getAccessibilitySettings } from "@/lib/useAccessibility";
import { useTerms } from "@/lib/useTerms";
import QuickCheckinButtons from "@/components/dashboard/QuickCheckinButtons";
import AppDrawer from "@/components/dashboard/AppDrawer";
import PinnedAltersGallery from "@/components/alters/PinnedAltersGallery";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

function useGridCols() {
  // v2 grid: twice as dense as v1 (4/8/12 instead of 2/4/6) so app-shortcut
  // icons can be quarter-width on phones; stored v1 spans are doubled on
  // read (see resolveExperimentalHome) so layouts keep their proportions.
  const calc = () => (typeof window === "undefined" ? 4 : window.innerWidth >= 1024 ? 12 : window.innerWidth >= 640 ? 8 : 4);
  const [cols, setCols] = useState(calc);
  React.useEffect(() => {
    const onResize = () => setCols(calc());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return cols;
}

const MODE_LABEL = { minimal: "Minimal", normal: "Normal", expanded: "Expanded", detailed: "Detailed" };

function SortableWidget({ widget, def, editMode, gridCols, api, onRemove, onSpan, onMode, a11yStack, onMove, styleMode = "current" }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.instanceId,
    disabled: !editMode || a11yStack,
  });
  const mode = effectiveMode(widget.mode, def.supportsModes);
  const spanCols = Math.min(widget.span?.cols || def.defaultSpan?.cols || 4, gridCols);
  const spanRows = widget.span?.rows || def.defaultSpan?.rows || 1;
  const style = a11yStack
    ? {}
    : {
        gridColumn: `span ${spanCols}`,
        minHeight: spanRows > 1 ? spanRows * 80 : undefined,
        // rectSortingStrategy assumes equal-size tiles and adds scale to its
        // transforms — with mixed spans that stretches widgets mid-drag.
        // Position-only transforms fix the "expands in weird ways" glitch.
        transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : transform),
        transition,
        zIndex: isDragging ? 40 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      };
  return (
    <div ref={setNodeRef} style={style} className="relative min-w-0">
      {editMode && (
        <div className="absolute -top-2 -right-2 z-30 flex items-center gap-1">
          {/* Mode cycle */}
          {def.supportsModes.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const idx = HOME_MODES.indexOf(mode);
                for (let i = 1; i <= HOME_MODES.length; i++) {
                  const next = HOME_MODES[(idx + i) % HOME_MODES.length];
                  if (def.supportsModes.includes(next)) { onMode(widget.instanceId, next); return; }
                }
              }}
              title={`Display mode: ${MODE_LABEL[mode]} (tap to change)`}
              className="h-6 px-1.5 rounded-full bg-background border border-border text-[0.625rem] font-medium text-muted-foreground hover:text-foreground shadow-sm"
            >
              {MODE_LABEL[mode]}
            </button>
          )}
          {/* Width steppers (grid-span) */}
          {!a11yStack && (
            <span className="h-6 flex items-center rounded-full bg-background border border-border shadow-sm overflow-hidden">
              <button type="button" aria-label="Narrower" onClick={() => onSpan(widget.instanceId, { cols: spanCols - 1 })}
                disabled={spanCols <= (def.minSpan?.cols ?? 1)}
                className="px-1 h-full text-muted-foreground hover:text-foreground disabled:opacity-30"><Minus className="w-3 h-3" /></button>
              <span className="text-[0.625rem] px-0.5 text-muted-foreground tabular-nums">{spanCols}w</span>
              <button type="button" aria-label="Wider" onClick={() => onSpan(widget.instanceId, { cols: spanCols + 1 })}
                disabled={spanCols >= Math.min(def.maxSpan?.cols ?? 6, gridCols)}
                className="px-1 h-full text-muted-foreground hover:text-foreground disabled:opacity-30"><Plus className="w-3 h-3" /></button>
            </span>
          )}
          {/* A11y-stack reorder buttons */}
          {a11yStack && (
            <span className="h-6 flex items-center rounded-full bg-background border border-border shadow-sm overflow-hidden">
              <button type="button" aria-label="Move up" onClick={() => onMove(widget.instanceId, -1)}
                className="px-1 h-full text-muted-foreground hover:text-foreground"><ArrowUp className="w-3 h-3" /></button>
              <button type="button" aria-label="Move down" onClick={() => onMove(widget.instanceId, 1)}
                className="px-1 h-full text-muted-foreground hover:text-foreground"><ArrowDown className="w-3 h-3" /></button>
            </span>
          )}
          <button
            type="button"
            aria-label={`Remove ${def.label}`}
            onClick={() => onRemove(widget.instanceId)}
            className="w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <div
        {...(editMode && !a11yStack ? { ...attributes, ...listeners } : {})}
        className={[
          // "phone" style: every widget sits in a translucent launcher-style
          // card (pairs well with a wallpaper). "barebones"/"current" add no
          // shell — components keep their own chrome.
          styleMode === "phone" ? "rounded-2xl bg-card/45 backdrop-blur-sm border border-border/30 p-2 h-full" : "",
          editMode ? "relative rounded-xl ring-1 ring-dashed ring-border/70 cursor-grab active:cursor-grabbing" : "",
        ].join(" ").trim() || undefined}
        style={editMode ? { touchAction: "none", minHeight: 56, paddingTop: 18 } : undefined}
      >
        {editMode && (
          <span className="absolute top-0.5 left-2 text-[0.625rem] uppercase tracking-wide text-muted-foreground/70 pointer-events-none">
            {def.label}
          </span>
        )}
        {def.render({ mode, settings: widget.settings || {}, instanceId: widget.instanceId, api })}
      </div>
    </div>
  );
}

export default function ExperimentalDashboard({ settingsRow, api }) {
  const qc = useQueryClient();
  const t = useTerms();
  const gridCols = useGridCols();
  const a11yStack = !!getAccessibilitySettings().a11yMode;
  const [editMode, setEditMode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);

  const home = useMemo(
    () => resolveExperimentalHome(settingsRow?.experimental_home, WIDGET_REGISTRY),
    [settingsRow?.experimental_home]
  );
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
        await base44.entities.SystemSettings.update(settingsRow.id, { experimental_home: nextHome });
      } else {
        await base44.entities.SystemSettings.create({ experimental_home: nextHome });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't save the homescreen");
    }
  }, [settingsRow?.id, qc]);

  const updatePageWidgets = useCallback((mutate) => {
    const next = {
      ...home,
      pages: home.pages.map((p) => (p.id === page.id ? { ...p, widgets: mutate(p.widgets) } : p)),
    };
    persist(next);
  }, [home, page.id, persist]);

  // ── Edit operations ────────────────────────────────────────────
  const handleRemove = (instanceId) => updatePageWidgets((ws) => ws.filter((w) => w.instanceId !== instanceId));
  const handleSpan = (instanceId, patch) =>
    updatePageWidgets((ws) => ws.map((w) => (w.instanceId === instanceId ? { ...w, span: { ...w.span, ...patch } } : w)));
  const handleMode = (instanceId, mode) =>
    updatePageWidgets((ws) => ws.map((w) => (w.instanceId === instanceId ? { ...w, mode } : w)));
  const handleMove = (instanceId, dir) =>
    updatePageWidgets((ws) => {
      const i = ws.findIndex((w) => w.instanceId === instanceId);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= ws.length) return ws;
      return arrayMove(ws, i, j);
    });
  const handleAddWidget = (widgetId, settings = {}, { edit = true } = {}) => {
    const def = WIDGET_REGISTRY[widgetId];
    if (!def) return;
    // Single-instance widgets are unique across ALL pages, not just this one.
    if (!def.supportsMultiInstance && home.pages.some((p) => p.widgets.some((w) => w.widgetId === widgetId))) {
      toast.info("Already on the homescreen");
      return;
    }
    updatePageWidgets((ws) => [
      ...ws,
      { instanceId: newInstanceId(), widgetId, span: { ...(def.defaultSpan || { cols: 4, rows: 1 }) }, mode: "normal", settings },
    ]);
    toast.success(`${def.label} added`);
    if (edit) {
      setDrawerOpen(false);
      setEditMode(true);
    }
    // Pin-while-editing keeps the drawer open so several apps can be pinned
    // in a row.
  };

  // Current → phone → barebones → current.
  const cycleStyleMode = () => {
    const order = ["current", "phone", "barebones"];
    const next = order[(order.indexOf(home.styleMode) + 1) % order.length];
    persist({ ...home, styleMode: next });
  };
  const setWallpaper = (url) => {
    persist({ ...home, wallpaper: { url: url || "" } });
    setWallpaperPickerOpen(false);
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
  const handleBackToClassic = () => persist({ ...home, enabled: false });
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );
  const handleDragEnd = ({ active, over }) => {
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
  const widgets = page.widgets.filter((w) => WIDGET_REGISTRY[w.widgetId]);
  // Widgets that embed sub-surfaces need to know what else is placed —
  // e.g. CurrentFronters hides its inline status note when the standalone
  // status_note widget is on the page (mirrors classic layoutEnabled logic).
  const widgetApi = { ...api, statusNotePlaced: widgets.some((w) => w.widgetId === "status_note") };

  const canvas = (
    <div
      style={a11yStack ? undefined : { display: "grid", gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gap: home.styleMode === "barebones" ? "0.375rem" : "0.75rem", alignItems: "start" }}
      className={a11yStack ? "space-y-3" : undefined}
    >
      {widgets.map((w) => (
        <SortableWidget
          key={w.instanceId}
          widget={w}
          def={WIDGET_REGISTRY[w.widgetId]}
          editMode={editMode}
          gridCols={gridCols}
          api={widgetApi}
          a11yStack={a11yStack}
          onRemove={handleRemove}
          onSpan={handleSpan}
          onMode={handleMode}
          onMove={handleMove}
          styleMode={home.styleMode}
        />
      ))}
    </div>
  );

  return (
    <div className="pt-1 relative isolate" data-tour="experimental-home" data-home-style={home.styleMode}>
      {/* Wallpaper — fixed under everything in this stacking context; the
          isolate on the root keeps the negative z-index from escaping. */}
      {wallpaperUrl && (
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <img src={wallpaperUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-background/55" />
        </div>
      )}
      {/* Edit-mode toolbar */}
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
              onClick={cycleStyleMode}
              title="Widget style: current / phone / barebones"
              className="text-[0.625rem] px-2 py-1 rounded-full border border-border/40 text-muted-foreground whitespace-nowrap hover:text-foreground transition-all"
            >
              Style: {home.styleMode === "phone" ? "Phone" : home.styleMode === "barebones" ? "Barebones" : "Current"}
            </button>
            <span className="flex items-center rounded-full border border-border/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setWallpaperPickerOpen(true)}
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
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <LayoutGrid className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          aria-pressed={editMode}
          aria-label={editMode ? "Done editing" : "Edit homescreen"}
          title={editMode ? "Done" : "Edit homescreen"}
          className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-colors ${
            editMode ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          {editMode ? <Check className="w-5 h-5" /> : <Pencil className="w-4 h-4" />}
        </button>
      </div>

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
                className={`rounded-full transition-all ${
                  p.id === page.id ? "w-2.5 h-2.5 bg-primary" : "w-2 h-2 bg-muted-foreground/70"
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
        placedWidgetIds={home.pages.flatMap((p) => p.widgets.map((w) => w.widgetId))}
        onAddWidget={handleAddWidget}
        onAddShortcut={(appId) => handleAddWidget("app_shortcut", { targetId: appId }, { edit: false })}
        pinOnTap={editMode}
      />

      <AssetPickerModal
        open={wallpaperPickerOpen}
        onClose={() => setWallpaperPickerOpen(false)}
        onSelect={setWallpaper}
      />
    </div>
  );
}

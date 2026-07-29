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
import {
  Pencil, Check, X, Minus, Plus, LayoutGrid, ArrowUp, ArrowDown,
  Undo2, Grid2x2,
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
  resolveExperimentalHome, effectiveMode, newInstanceId, HOME_MODES,
  ACTION_BAR_BUTTONS,
} from "@/lib/experimentalHome";
import { getAccessibilitySettings } from "@/lib/useAccessibility";
import QuickCheckinButtons from "@/components/dashboard/QuickCheckinButtons";
import AppDrawer from "@/components/dashboard/AppDrawer";

function useGridCols() {
  const calc = () => (typeof window === "undefined" ? 2 : window.innerWidth >= 1024 ? 6 : window.innerWidth >= 640 ? 4 : 2);
  const [cols, setCols] = useState(calc);
  React.useEffect(() => {
    const onResize = () => setCols(calc());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return cols;
}

const MODE_LABEL = { minimal: "Minimal", normal: "Normal", expanded: "Expanded", detailed: "Detailed" };

function SortableWidget({ widget, def, editMode, gridCols, api, onRemove, onSpan, onMode, a11yStack, onMove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.instanceId,
    disabled: !editMode || a11yStack,
  });
  const mode = effectiveMode(widget.mode, def.supportsModes);
  const spanCols = Math.min(widget.span?.cols || def.defaultSpan?.cols || 2, gridCols);
  const spanRows = widget.span?.rows || def.defaultSpan?.rows || 1;
  const style = a11yStack
    ? {}
    : {
        gridColumn: `span ${spanCols}`,
        minHeight: spanRows > 1 ? spanRows * 80 : undefined,
        transform: CSS.Transform.toString(transform),
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
        className={editMode ? "relative rounded-xl ring-1 ring-dashed ring-border/70 cursor-grab active:cursor-grabbing" : undefined}
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
  const gridCols = useGridCols();
  const a11yStack = !!getAccessibilitySettings().a11yMode;
  const [editMode, setEditMode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const home = useMemo(
    () => resolveExperimentalHome(settingsRow?.experimental_home, WIDGET_REGISTRY),
    [settingsRow?.experimental_home]
  );
  // Phase 1: single page — always the default page.
  const page = home.pages.find((p) => p.id === home.defaultPageId) || home.pages[0];

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
  const handleAddWidget = (widgetId) => {
    const def = WIDGET_REGISTRY[widgetId];
    if (!def) return;
    if (!def.supportsMultiInstance && page.widgets.some((w) => w.widgetId === widgetId)) {
      toast.info("Already on the homescreen");
      return;
    }
    updatePageWidgets((ws) => [
      ...ws,
      { instanceId: newInstanceId(), widgetId, span: { ...(def.defaultSpan || { cols: 2, rows: 1 }) }, mode: "normal", settings: {} },
    ]);
    toast.success(`${def.label} added`);
    setDrawerOpen(false);
    setEditMode(true);
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

  const barIds = home.actionBar.enabled ? home.actionBar.buttonIds : [];
  const widgets = page.widgets.filter((w) => WIDGET_REGISTRY[w.widgetId]);
  // Widgets that embed sub-surfaces need to know what else is placed —
  // e.g. CurrentFronters hides its inline status note when the standalone
  // status_note widget is on the page (mirrors classic layoutEnabled logic).
  const widgetApi = { ...api, statusNotePlaced: widgets.some((w) => w.widgetId === "status_note") };

  const canvas = (
    <div
      style={a11yStack ? undefined : { display: "grid", gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gap: "0.75rem", alignItems: "start" }}
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
        />
      ))}
    </div>
  );

  return (
    <div className="pt-1" data-tour="experimental-home">
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

      {widgets.length === 0 && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="w-full py-16 rounded-2xl border-2 border-dashed border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex flex-col items-center gap-2"
        >
          <Grid2x2 className="w-8 h-8" />
          <span className="text-sm font-medium">Empty homescreen — tap to add widgets</span>
        </button>
      )}

      {a11yStack || !editMode ? (
        canvas
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgets.map((w) => w.instanceId)} strategy={rectSortingStrategy}>
            {canvas}
          </SortableContext>
        </DndContext>
      )}

      {/* Persistent quick-action bar — floats above the bottom nav and (in
          later phases) stays put while swiping between pages. */}
      {barIds.length > 0 && (
        <div
          className="fixed left-0 right-0 z-40 flex justify-center pointer-events-none"
          style={{ bottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px) + 8px)" }}
        >
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
        </div>
      )}
      {/* Reserve space so the action bar doesn't cover the last widgets. */}
      {barIds.length > 0 && <div style={{ height: 68 }} aria-hidden="true" />}

      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placedWidgetIds={widgets.map((w) => w.widgetId)}
        onAddWidget={handleAddWidget}
      />
    </div>
  );
}

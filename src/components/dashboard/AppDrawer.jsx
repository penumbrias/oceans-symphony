// The experimental homescreen's app drawer — a bottom sheet with two tabs:
//   Apps        — every page in the app (reuses QuickNavMenu's grid items,
//                 so colours/icons/labels stay identical to the classic
//                 nav grid), tap to navigate.
//   Add widget  — the widget registry grouped by category; tap to add an
//                 instance to the current page. Widgets already placed
//                 show an informational "added" tag but can be added
//                 again — duplicates with different options are allowed
//                 (v0.231.0).

import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X, LayoutGrid, PlusSquare, Check, Plus, Folder, FolderOpen, FolderPlus, ChevronLeft, Trash2, List, Layers } from "lucide-react";
import {
  DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter, useDroppable,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { useTerms } from "@/lib/useTerms";
import { buildGridItems } from "@/lib/navCatalogue";
import { useModPagesVersion } from "@/lib/mods/registry";
import { useExperimentalOn } from "@/lib/experimentalFeatures";
import { WIDGET_REGISTRY, widgetLabel, widgetDescription } from "@/lib/widgetRegistry";
import { groupWidgetEntries, widgetEntryMatches } from "@/lib/widgetMenuGroups";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { effectiveMode, HOME_MODES } from "@/lib/experimentalHome";
import { HOME_STYLES, getStyleLook } from "@/lib/homeStyles";
import { lookToStyle, USER_STYLE_PREFIX } from "@/lib/widgetLook";
import { ChoiceRow, Chips, StackedRow } from "@/components/shared/SettingRows";
import { WidgetSubject } from "@/lib/boardSubject";
import { useLinkedPreviewSettings } from "@/v2/linkedProfileWidgets";

const MODE_LABEL = { minimal: "Minimal", normal: "Normal", expanded: "Expanded", detailed: "Detailed" };

// One widget crashing must not take the whole gallery down with it.
class PreviewBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return <p className="text-xs text-muted-foreground p-3">Preview unavailable</p>;
    }
    return this.props.children;
  }
}

// A live render of the actual widget, Android-widget-picker style — the
// real component with the user's real data, just not interactive. `styleId`
// previews a page style (shell class) or a saved user style (look vars).
// A profile widget meant for anywhere previews with the first record of
// its kind (useLinkedPreviewSettings), not its "choose which" note.
function WidgetPreview({ def, mode = "normal", api, styleId = "", userStyles = [], maxHeight = 170, height = null }) {
  const settings = useLinkedPreviewSettings(def);
  // Same pipeline a placed widget uses (widgetLookFor): a built-in style is
  // its LOOK vars from getStyleLook, a saved style is its stored look. The
  // old "shell class" for built-ins painted nothing any more, so tapping a
  // built-in in the picker changed nothing while saved styles did.
  const look = !styleId ? null
    : styleId.startsWith(USER_STYLE_PREFIX)
      ? (userStyles.find((st) => `${USER_STYLE_PREFIX}${st.id}` === styleId)?.look || null)
      : getStyleLook(styleId);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none overflow-hidden"
      style={{ ...(look ? lookToStyle(look) : null), ...(height ? { height } : { maxHeight }), borderRadius: "var(--v2-radius, 8px)" }}
    >
      <PreviewBoundary>
        <WidgetSubject def={def} settings={settings}>{def.render({ mode, settings, instanceId: `preview_${mode}`, api })}</WidgetSubject>
      </PreviewBoundary>
    </div>
  );
}

// The picture on a library card: the live preview drawn at a phone-widget
// width and scaled down to the card, mounted only once the card scrolls
// near the screen (a category holds up to a few dozen widgets, each one
// the real thing with real data).
const THUMB_WIDTH = 320;
function WidgetThumb({ def, api, height = 104 }) {
  const ref = React.useRef(null);
  const [width, setWidth] = useState(0);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(([e]) => setWidth(e.contentRect.width)) : null;
    ro?.observe(el);
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return () => ro?.disconnect(); }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "240px" });
    io.observe(el);
    return () => { ro?.disconnect(); io.disconnect(); };
  }, []);
  const scale = width ? width / THUMB_WIDTH : 0;
  return (
    <div ref={ref} className="relative overflow-hidden rounded-lg bg-muted/30" style={{ height }}>
      {seen && scale > 0 && (
        <div style={{ width: THUMB_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <WidgetPreview def={def} api={api} height={height / scale} />
        </div>
      )}
      {/* The bottom fades out — a cropped preview, not a broken one. */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background/90 to-transparent pointer-events-none" />
    </div>
  );
}

// Tapping a widget in the library opens this: the same row grammar as the
// widget inspector (docs/inspector-design-guide.md) — Version, Display and
// Style as rows, a live preview between them, one primary "Add to page"
// button — so a widget is added configured rather than fixed afterwards.
// An entry standing for several versions of one thing (WIDGET_FAMILIES)
// picks the version first; everything below follows it.
function WidgetDetail({ entry, api, userStyles, onBack, onAdd, t, placedCount }) {
  const variants = entry.variants || null;
  const [variantId, setVariantId] = useState(entry.id);
  const current = variants?.find((v) => v.id === variantId) || { id: entry.id, def: entry.def };
  const { id, def } = current;
  const modes = HOME_MODES.filter((m) => (def.supportsModes || ["normal"]).includes(m));
  const [mode, setMode] = useState(effectiveMode("normal", def.supportsModes));
  // A version without the picked display size falls back to its own.
  useEffect(() => {
    if (!(def.supportsModes || ["normal"]).includes(mode)) setMode(effectiveMode("normal", def.supportsModes));
  }, [def]); // eslint-disable-line react-hooks/exhaustive-deps
  const [styleId, setStyleId] = useState("");
  const styleOptions = [
    { value: "", label: "Page style" },
    ...userStyles.map((st) => ({ value: `${USER_STYLE_PREFIX}${st.id}`, label: `${st.label} · yours` })),
    ...HOME_STYLES.filter((st) => st.id !== "current").map((st) => ({ value: st.id, label: st.label })),
  ];
  const title = entry.family?.label ? applyTerms(entry.family.label, t) : widgetLabel(entry.def, t);
  const n = placedCount(id);
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-start gap-2 pb-2">
        <button type="button" onClick={onBack} aria-label="All widgets" title="All widgets"
          className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{widgetDescription(def, t)}</p>
          {n > 0 && (
            <p className="text-[0.6875rem] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Check className="w-3 h-3" /> {n === 1 ? "Already on this page" : `On this page ${n} times`}
            </p>
          )}
        </div>
      </div>

      {variants && (
        <ChoiceRow label="Version" value={variantId} onChange={setVariantId}
          options={variants.map((v) => ({ value: v.id, label: applyTerms(v.label, t) }))} />
      )}

      {modes.length > 1 && (
        <ChoiceRow label="Display" value={mode} onChange={setMode}
          options={modes.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
      )}

      <div className="my-2 rounded-xl border border-border/50 p-2 bg-background/40">
        <WidgetPreview key={id} def={def} mode={mode} api={api} styleId={styleId} userStyles={userStyles} maxHeight={260} />
      </div>

      <StackedRow label="Style" hint="How the box is drawn; the page style is the default">
        <Chips label="Style" options={styleOptions} value={styleId} onChange={(v) => setStyleId(v || "")} />
      </StackedRow>

      <button type="button"
        onClick={() => onAdd(id, styleId ? { style: styleId } : {}, mode)}
        className="mt-3 w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5">
        <Plus className="w-4 h-4" /> Add to page
      </button>
    </div>
  );
}

// Hold-to-enter-edit, phone style: a stationary press flips the drawer's
// apps into edit mode ("similar to Apple" per the spec — Apple's hold is
// well under a second, so 700ms, not a literal three).
function useHoldToEdit(onHold, enabled = true) {
  const ref = React.useRef(null);
  return {
    onPointerDown: (e) => {
      if (!enabled || e.button === 1 || e.button === 2) return;
      const sx = e.clientX, sy = e.clientY;
      const cancel = () => { clearTimeout(ref.current); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", cancel); };
      const move = (ev) => { if (Math.abs(ev.clientX - sx) > 8 || Math.abs(ev.clientY - sy) > 8) cancel(); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", cancel);
      ref.current = setTimeout(() => { cancel(); try { navigator.vibrate?.(10); } catch { /* none */ } onHold(); }, 700);
    },
    onContextMenu: (e) => { if (enabled) e.preventDefault(); },
  };
}

// A draggable app tile for edit mode (dnd-kit sortable, position-only
// transforms — same lesson as the widget canvas).
function SortableAppTile({ app, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      style={{
        transform: DndCSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        touchAction: "none",
        zIndex: isDragging ? 40 : undefined,
      }}
      className="select-none">
      {children}
    </div>
  );
}

// A folder tile that accepts app drops while editing.
function DroppableFolderTile({ folder, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder:${folder.id}` });
  return (
    <div ref={setNodeRef}
      className={isOver ? "rounded-2xl ring-2 ring-primary/70 scale-105 transition-transform" : "transition-transform"}>
      {children}
    </div>
  );
}

// One app tile (icon + label + optional pin badge) — shared between the
// folder view and the main grid.
function AppTile({ app, pinOnTap, onAddShortcut, onOpen }) {
  const Icon = app.icon;
  return (
    <div className="relative">
      <button type="button" onClick={onOpen} className="w-full flex flex-col items-center gap-1.5 group">
        <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${app.color} group-hover:scale-105 transition-transform`}>
          <Icon className="w-5 h-5" />
        </span>
        <span className="text-[0.6875rem] text-center leading-tight text-muted-foreground group-hover:text-foreground line-clamp-2">
          {app.label}
        </span>
      </button>
      {pinOnTap && onAddShortcut && (
        <button
          type="button"
          aria-label={`Pin ${app.label} to the homescreen`}
          title="Pin to homescreen"
          onClick={(e) => { e.stopPropagation(); onAddShortcut(app.id); }}
          className="absolute -top-1.5 -right-0.5 w-5 h-5 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/60"
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}


// pinOnTap: while the homescreen is in edit mode, tapping an app on the
// Apps tab PINS it to the page instead of navigating (the little + does the
// same either way). The drawer stays open so several apps can be pinned in
// a row. Folders come from experimental_home.drawer.folders via props.
export default function AppDrawer({
  open, onClose, placedWidgetIds = [], onAddWidget, onAddShortcut, pinOnTap = false,
  registry = WIDGET_REGISTRY,
  folders = [], onSaveFolders,
  order = [], onSaveOrder,
  api = null, userStyles = [],
  initialTab = null,
  onDropWidget = null,   // (widgetId, {x, y}) — hold a widget card, drag, drop it on a spot
  // A profile board (v0.290.0) has no app shortcuts: only the widget tab.
  widgetsOnly = false,
}) {
  const t = useTerms();
  const navigate = useNavigate();
  const [tab, setTab] = useState(widgetsOnly ? "widgets" : "apps");
  // Callers can steer which tab a given open lands on (the empty-page
  // "tap to add widgets" placeholder wants the Add-widget tab, not Apps).
  useEffect(() => {
    if (open && initialTab) setTab(initialTab);
  }, [open, initialTab]);
  const [search, setSearch] = useState("");
  const [openFolderId, setOpenFolderId] = useState(null);
  // Apps edit mode (hold any tile): reorder by drag, drop onto a folder to
  // file it, New-folder tile, per-folder add/remove. Replaces "Organize".
  const [appsEdit, setAppsEdit] = useState(false);
  const [folderAddOpen, setFolderAddOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [widgetSearch, setWidgetSearch] = useState("");
  // Which group is open; null = the group tiles the library opens on.
  const [widgetGroup, setWidgetGroup] = useState(null);

  const modNavV = useModPagesVersion();
  const apps = useMemo(() => buildGridItems(t.Alters, t.System), [t.Alters, t.System, modNavV]);
  const experimentalFeaturesOn = useExperimentalOn();
  const appById = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const filteredApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? apps.filter((a) => a.label.toLowerCase().includes(q)) : apps;
  }, [apps, search]);

  // While searching, folders are bypassed (flat results). Otherwise apps in
  // folders are hidden from the main grid and reachable through the folder.
  const searching = search.trim().length > 0;
  const inFolder = useMemo(() => new Set(folders.flatMap((f) => f.appIds)), [folders]);
  const orderedApps = useMemo(() => {
    if (!order.length) return filteredApps;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...filteredApps].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  }, [filteredApps, order]);
  const gridApps = searching ? orderedApps : orderedApps.filter((a) => !inFolder.has(a.id));
  const openFolder = folders.find((f) => f.id === openFolderId) || null;

  // How many copies of each widget this page already holds (informational —
  // duplicates with different options are a real use case).
  const placedCount = useMemo(() => {
    const m = new Map();
    for (const id of placedWidgetIds) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [placedWidgetIds]);

  // The add-widget list, grouped by what each widget is for, versions of
  // one thing folded into one entry (widgetMenuGroups.js). Needs & goals
  // widgets are experimental — left out until switched on.
  const entryLabel = (e) => (e.family?.label ? applyTerms(e.family.label, t) : widgetLabel(e.def, t));
  const placedFor = (e) => (e.variants || [e]).reduce((n, v) => n + (placedCount.get(v.id) || 0), 0);
  const widgetQuery = widgetSearch.trim().toLowerCase();
  const widgetGroups = useMemo(() => {
    const entries = Object.entries(registry).filter(([, d]) =>
      d && !d.hiddenFromDrawer && (d.category !== "needs" || experimentalFeaturesOn));
    return groupWidgetEntries(entries, entryLabel);
  }, [registry, experimentalFeaturesOn, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownWidgetGroups = useMemo(() => {
    if (widgetQuery) {
      const matches = (e) => widgetEntryMatches(e, widgetQuery, (d) => widgetLabel(d, t), (d) => widgetDescription(d, t))
        || entryLabel(e).toLowerCase().includes(widgetQuery);
      return widgetGroups
        .map((g) => ({
          ...g,
          items: g.items.filter(matches),
          sections: g.sections?.map((sec) => ({ ...sec, items: sec.items.filter(matches) })).filter((sec) => sec.items.length > 0),
        }))
        .filter((g) => g.items.length > 0);
    }
    return widgetGroups.filter((g) => g.group.id === widgetGroup);
  }, [widgetGroups, widgetGroup, widgetQuery, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const detailEntry = useMemo(() => {
    if (!detailId) return null;
    for (const g of widgetGroups) {
      const hit = g.items.find((e) => e.id === detailId);
      if (hit) return hit;
    }
    return registry[detailId] ? { id: detailId, def: registry[detailId] } : null;
  }, [detailId, widgetGroups, registry]);

  // Hooks stay ABOVE the early return — a hook after `if (!open) return`
  // shifts the hook order the moment the drawer opens, which is exactly the
  // "rendered more hooks" crash.
  const holdProps = useHoldToEdit(() => setAppsEdit(true), !!onSaveFolders && !appsEdit && !searching);
  // Hold a widget card, then drag: the drawer fades out of the way, a
  // ghost chip follows the finger, and letting go over the page drops the
  // widget AT that spot (owner ask — Add always appended to the bottom).
  // The drawer stays MOUNTED (visibility hidden) during the drag: on
  // touch, pointer events are implicitly captured by the element that was
  // pressed, and unmounting it would end the stream mid-drag.
  const [dragW, setDragW] = useState(null); // { id, label, x, y }
  const startWidgetHold = (e, id, label) => {
    if (!onDropWidget) return;
    if (e.button !== undefined && e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const state = { active: false };
    const timer = setTimeout(() => {
      state.active = true;
      try { navigator.vibrate?.(10); } catch { /* no haptics */ }
      setDragW({ id, label, x: sx, y: sy });
    }, 300);
    const end = () => {
      clearTimeout(timer);
      setDragW(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("touchmove", prevent);
    };
    const move = (ev) => {
      if (!state.active) {
        // Moving before the hold fires is a scroll, not a drag.
        if (Math.abs(ev.clientX - sx) > 8 || Math.abs(ev.clientY - sy) > 8) end();
        return;
      }
      setDragW((w) => (w ? { ...w, x: ev.clientX, y: ev.clientY } : w));
    };
    const prevent = (ev) => { if (state.active) ev.preventDefault(); };
    const up = (ev) => {
      const wasActive = state.active;
      end();
      if (wasActive) onDropWidget(id, { x: ev.clientX, y: ev.clientY });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", end);
    window.addEventListener("touchmove", prevent, { passive: false });
  };
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );

  if (!open) return null;

  const openApp = (app) => {
    if (appsEdit) return; // editing: taps arrange, they don't navigate
    if (pinOnTap && onAddShortcut) { onAddShortcut(app.id); return; }
    onClose();
    navigate(app.path);
  };


  const saveFolder = (id, patch) =>
    onSaveFolders?.(folders.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const newFolder = () =>
    onSaveFolders?.([...folders, { id: `f_${Date.now().toString(36)}`, label: "Folder", appIds: [] }]);

  const handleAppDragEnd = ({ active, over }) => {
    if (!over) return;
    const overId = String(over.id);
    if (overId.startsWith("folder:")) {
      const fid = overId.slice(7);
      const f = folders.find((x) => x.id === fid);
      if (f && !f.appIds.includes(active.id)) saveFolder(fid, { appIds: [...f.appIds, active.id] });
      return;
    }
    if (active.id === over.id) return;
    const ids = gridApps.map((a) => a.id);
    const from = ids.indexOf(active.id), to = ids.indexOf(overId);
    if (from === -1 || to === -1) return;
    onSaveOrder?.(arrayMove(ids, from, to));
  };

  return (
    <>
    {/* The drag ghost — a chip under the finger while placing a widget. */}
    {dragW && createPortal(
      <div aria-hidden="true" className="fixed z-[200] pointer-events-none px-3 py-1.5 rounded-xl border border-primary/60 bg-primary/15 text-primary text-sm font-medium shadow-lg"
        style={{ left: dragW.x, top: dragW.y, transform: "translate(-50%, -120%)" }}>
        {dragW.label}
      </div>,
      document.body
    )}
    <div className="fixed inset-0 z-[95] flex items-end justify-center" role="dialog" aria-label="App drawer"
      style={{ visibility: dragW ? "hidden" : undefined }}>
      <button type="button" aria-label="Close drawer" onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-background border-t border-x border-border/60 rounded-t-2xl shadow-2xl flex flex-col"
        // max() with --home-edit-bar-h: while the board is in edit mode the
        // z-70 edit bar overlays this panel's bottom edge (the drawer lives
        // inside the board's transform, so its z-95 can't beat a
        // body-portaled bar) — pad clear of whichever bar is taller.
        style={{ maxHeight: "80vh", paddingBottom: "calc(max(var(--bottom-nav-height, 56px), var(--home-edit-bar-h, 0px)) + var(--os-sab))" }}
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-border/40">
          {/* Outside edit mode this is a plain app drawer — no widget tab. */}
          {pinOnTap && widgetsOnly ? (
            <div className="flex-1 py-1.5 text-sm font-medium flex items-center gap-1.5">
              <PlusSquare className="w-4 h-4" /> Add widget
            </div>
          ) : pinOnTap ? (
            <div className="flex gap-1 p-0.5 bg-muted/30 rounded-lg flex-1">
              <button type="button" onClick={() => setTab("apps")}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${tab === "apps" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <LayoutGrid className="w-4 h-4" /> Apps
              </button>
              <button type="button" onClick={() => setTab("widgets")}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${tab === "widgets" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <PlusSquare className="w-4 h-4" /> Add widget
              </button>
            </div>
          ) : (
            <p className="flex-1 text-sm font-medium flex items-center gap-1.5 px-1">
              <LayoutGrid className="w-4 h-4 text-muted-foreground" /> Apps
            </p>
          )}
          {/* Grid ⇄ list: hop over to the sidebar's grouped list of the
              same pages. lg:hidden — the sidebar drawer only exists below
              lg (desktop shows nav in the header instead). */}
          <button type="button"
            onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("os-open-sidebar")); }}
            aria-label="Switch to the navigation list" title="List view"
            className="p-2 text-muted-foreground hover:text-foreground lg:hidden"><List className="w-5 h-5" /></button>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-2 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {(tab === "apps" || !pinOnTap) && !widgetsOnly ? (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search apps…"
                className="w-full h-9 px-3 mb-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {pinOnTap && !appsEdit && (
                <p className="mb-3 -mt-1 text-center text-[0.6875rem] text-primary/90">Editing — tap an app to pin it</p>
              )}
              {appsEdit && (
                <div className="mb-3 -mt-1 flex items-center justify-center gap-3">
                  <p className="text-[0.6875rem] text-primary/90">Drag to reorder, drop onto a folder to file it</p>
                  <button type="button" onClick={() => setAppsEdit(false)}
                    className="text-[0.6875rem] px-2.5 py-1 rounded-full bg-primary text-primary-foreground font-medium">
                    Done
                  </button>
                </div>
              )}
              {openFolder ? (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenFolderId(null)}
                    className="mb-3 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> All apps
                  </button>
                  <div className="mb-2 flex items-center gap-1.5">
                    <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    {appsEdit ? (
                      <input defaultValue={openFolder.label || "Folder"} maxLength={40}
                        onBlur={(e) => saveFolder(openFolder.id, { label: e.target.value.trim() || "Folder" })}
                        className="flex-1 h-8 px-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                    ) : (
                      <p className="text-sm font-medium">{openFolder.label || "Folder"}</p>
                    )}
                    {appsEdit && (
                      <button type="button" aria-label="Delete folder"
                        onClick={() => { onSaveFolders?.(folders.filter((f) => f.id !== openFolder.id)); setOpenFolderId(null); }}
                        className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                    {openFolder.appIds.map((id) => appById.get(id)).filter(Boolean).map((app) => (
                      <div key={app.id} className="relative">
                        <AppTile app={app} pinOnTap={pinOnTap} onAddShortcut={onAddShortcut} onOpen={() => openApp(app)} />
                        {appsEdit && (
                          <button type="button" aria-label={`Remove ${app.label} from folder`}
                            onClick={() => saveFolder(openFolder.id, { appIds: openFolder.appIds.filter((x) => x !== app.id) })}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-destructive shadow-sm">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    {/* The Samsung-style plus: add apps from inside the folder. */}
                    {(appsEdit || pinOnTap) && (
                      <button type="button" onClick={() => setFolderAddOpen(true)}
                        className="w-full flex flex-col items-center gap-1.5 group">
                        <span className="w-12 h-12 rounded-2xl border-2 border-dashed border-border/60 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-primary/50">
                          <Plus className="w-5 h-5" />
                        </span>
                        <span className="text-[0.6875rem] text-muted-foreground">Add</span>
                      </button>
                    )}
                  </div>
                  {folderAddOpen && (
                    <div className="mt-3 space-y-1 max-h-56 overflow-y-auto overscroll-contain border-t border-border/40 pt-2">
                      {apps.filter((a) => !openFolder.appIds.includes(a.id)).map((a) => {
                        const AddIcon = a.icon;
                        return (
                          <button key={a.id} type="button"
                            onClick={() => saveFolder(openFolder.id, { appIds: [...openFolder.appIds, a.id] })}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left hover:bg-muted/40">
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${a.color}`}>
                              <AddIcon className="w-3.5 h-3.5" />
                            </span>
                            <span className="flex-1 text-sm truncate">{a.label}</span>
                            <Plus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          </button>
                        );
                      })}
                      <button type="button" onClick={() => setFolderAddOpen(false)}
                        className="w-full text-center text-xs text-muted-foreground py-1.5">Close</button>
                    </div>
                  )}
                </>
              ) : (
                <DndContext sensors={dndSensors} collisionDetection={closestCenter}
                  onDragEnd={appsEdit ? handleAppDragEnd : undefined}>
                <SortableContext items={appsEdit ? gridApps.map((a) => a.id) : []} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3" {...holdProps}>
                  {/* New folder — edit mode only, replaces the old Organize flow. */}
                  {appsEdit && !searching && (
                    <button type="button" onClick={newFolder}
                      className="w-full flex flex-col items-center gap-1.5 group">
                      <span className="w-12 h-12 rounded-2xl border-2 border-dashed border-border/60 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-primary/50">
                        <FolderPlus className="w-5 h-5" />
                      </span>
                      <span className="text-[0.6875rem] text-muted-foreground">New folder</span>
                    </button>
                  )}
                  {/* Folder tiles first (hidden while searching — search is flat) */}
                  {!searching && folders.filter((f) => f.appIds.length > 0 || pinOnTap || appsEdit).map((f) => {
                    const preview = f.appIds.map((id) => appById.get(id)).filter(Boolean).slice(0, 4);
                    return (
                      <DroppableFolderTile key={f.id} folder={f}>
                      <button
                        type="button"
                        onClick={() => setOpenFolderId(f.id)}
                        className="w-full flex flex-col items-center gap-1.5 group"
                      >
                        <span className="w-12 h-12 rounded-2xl bg-muted/40 border border-border/40 grid grid-cols-2 gap-0.5 p-1.5 group-hover:scale-105 transition-transform">
                          {preview.length > 0 ? preview.map((app) => {
                            const MiniIcon = app.icon;
                            return (
                              <span key={app.id} className={`rounded-md flex items-center justify-center ${app.color}`}>
                                <MiniIcon className="w-2.5 h-2.5" />
                              </span>
                            );
                          }) : <Folder className="w-4 h-4 m-auto col-span-2 text-muted-foreground" />}
                        </span>
                        <span className="text-[0.6875rem] text-center leading-tight text-muted-foreground group-hover:text-foreground line-clamp-2">
                          {f.label || "Folder"}
                        </span>
                      </button>
                      </DroppableFolderTile>
                    );
                  })}
                  {gridApps.map((app) => (
                    appsEdit
                      ? (
                        <SortableAppTile key={app.id} app={app}>
                          <AppTile app={app} pinOnTap={pinOnTap} onAddShortcut={onAddShortcut} onOpen={() => openApp(app)} />
                        </SortableAppTile>
                      )
                      : <AppTile key={app.id} app={app} pinOnTap={pinOnTap} onAddShortcut={onAddShortcut} onOpen={() => openApp(app)} />
                  ))}
                </div>
                </SortableContext>
                </DndContext>
              )}
            </>
          ) : (
            detailEntry ? (
              <WidgetDetail
                key={detailEntry.id}
                entry={detailEntry}
                api={api}
                userStyles={userStyles}
                t={t}
                placedCount={(id) => placedCount.get(id) || 0}
                onBack={() => setDetailId(null)}
                onAdd={(id, settings, mode) => { onAddWidget?.(id, settings, { mode }); setDetailId(null); }}
              />
            ) : (
            <div>
              {/* Search and the group strip stay put while the list scrolls
                  (the inspector's fixed tab strip, in library form). The
                  library opens on the groups as tiles; inside a group the
                  strip hops between groups, "All groups" goes back. */}
              <div className="sticky -top-4 z-10 -mx-4 px-4 pt-0 pb-2 bg-background space-y-2">
                <input
                  value={widgetSearch}
                  onChange={(e) => setWidgetSearch(e.target.value)}
                  placeholder="Search widgets…"
                  aria-label="Search widgets"
                  className="w-full h-10 px-3 rounded-xl border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {!widgetQuery && widgetGroup && (
                  <div role="tablist" aria-label="Widget groups"
                    className="flex gap-1.5 overflow-x-auto overscroll-x-contain -mx-4 px-4 pb-0.5 [scrollbar-width:none]"
                    style={{ WebkitOverflowScrolling: "touch" }}>
                    <button type="button" onClick={() => setWidgetGroup(null)}
                      className="text-xs pl-2 pr-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground whitespace-nowrap flex-shrink-0 flex items-center gap-0.5">
                      <ChevronLeft className="w-3.5 h-3.5" /> All groups
                    </button>
                    {widgetGroups.map((g) => g.group).map((g) => (
                      <button key={g.id} type="button" role="tab" aria-selected={widgetGroup === g.id}
                        ref={(el) => { if (el && widgetGroup === g.id) el.scrollIntoView?.({ inline: "nearest", block: "nearest" }); }}
                        onClick={() => setWidgetGroup(g.id)}
                        className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap flex-shrink-0 ${
                          widgetGroup === g.id
                            ? "text-primary border-primary bg-primary/10 font-medium"
                            : "border-border/50 text-muted-foreground hover:text-foreground"
                        }`}>
                        {applyTerms(g.label, t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!widgetQuery && !widgetGroup ? (
                // The groups as tiles: what each holds, and how many.
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {widgetGroups.map(({ group, items }) => {
                    const Icon = group.icon || PlusSquare;
                    return (
                      <button key={group.id} type="button" onClick={() => setWidgetGroup(group.id)}
                        className="text-left rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 p-3 flex flex-col gap-1.5 min-h-[6.5rem]">
                        <span className="flex items-center justify-between gap-2">
                          <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{items.length}</span>
                        </span>
                        <span className="text-sm font-medium leading-tight">{applyTerms(group.label, t)}</span>
                        {group.hint && (
                          <span className="text-[0.6875rem] text-muted-foreground leading-snug line-clamp-2">{applyTerms(group.hint, t)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  {shownWidgetGroups.length === 0 && (
                    <p className="text-xs text-muted-foreground py-6 text-center">No widgets match “{widgetSearch.trim()}”.</p>
                  )}
                  {shownWidgetGroups.map(({ group, items, sections }) => (
                    <div key={group.id} className="pb-2">
                      {widgetQuery ? (
                        <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground pt-2 pb-1">
                          {applyTerms(group.label, t)}
                        </p>
                      ) : group.hint ? (
                        <p className="text-xs text-muted-foreground pt-1 pb-2">{applyTerms(group.hint, t)}</p>
                      ) : null}
                      {(sections || [{ group: null, items }]).map((sec) => (
                        <div key={sec.group?.id || "all"}>
                          {sec.group && (
                            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground pt-2 pb-1">
                              {applyTerms(sec.group.label, t)}
                            </p>
                          )}
                          {/* Cards with a live preview, two across on a
                              phone: picture, name, what it does, a labelled
                              Add (full words, never a bare +). */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {sec.items.map((entry) => {
                              // Under its kind's heading a profile widget
                              // needs no "Group:" in front of its name.
                              const label = (sec.group && entry.def.menuLabel) ? applyTerms(entry.def.menuLabel, t) : entryLabel(entry);
                              const n = placedFor(entry);
                              const description = entry.family?.description
                                ? applyTerms(entry.family.description, t) : widgetDescription(entry.def, t);
                              return (
                                <div key={entry.id}
                                  onPointerDown={(e) => startWidgetHold(e, entry.id, label)}
                                  className="rounded-xl border border-border/50 bg-background p-1.5 flex flex-col gap-1.5">
                                  <button type="button" onClick={() => setDetailId(entry.id)}
                                    aria-label={`${label}: preview and options`}
                                    className="text-left flex flex-col gap-1.5 min-w-0">
                                    <WidgetThumb def={entry.def} api={api} />
                                    <span className="px-0.5 min-w-0">
                                      <span className="flex items-center gap-1 min-w-0">
                                        <span className="text-[0.8125rem] font-medium truncate">{label}</span>
                                        {n > 0 && (
                                          <span className="text-[0.625rem] text-muted-foreground flex items-center gap-0.5 flex-shrink-0 tabular-nums" title="On this page">
                                            <Check className="w-3 h-3" />{n > 1 ? `×${n}` : ""}
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-[0.6875rem] text-muted-foreground leading-snug line-clamp-2">{description}</span>
                                    </span>
                                  </button>
                                  <div className="flex items-center gap-1 mt-auto px-0.5">
                                    {entry.variants ? (
                                      <button type="button" onClick={() => setDetailId(entry.id)}
                                        className="text-[0.6875rem] text-muted-foreground flex items-center gap-0.5 min-w-0 truncate">
                                        <Layers className="w-3 h-3 flex-shrink-0" /> {entry.variants.length} versions
                                      </button>
                                    ) : <span />}
                                    <button type="button" onClick={() => onAddWidget?.(entry.id)}
                                      aria-label={`Add ${label}`} title={`Add ${label}`}
                                      className="ml-auto h-7 px-2.5 rounded-full border border-primary/60 text-primary text-xs font-medium flex items-center gap-1 flex-shrink-0">
                                      <Plus className="w-3.5 h-3.5" /> Add
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
              <p className="text-[0.6875rem] text-muted-foreground text-center pt-2">
                {onDropWidget ? "Tap a widget for its versions and sizes · hold and drag to place it" : "Tap a widget for its versions and sizes"}
              </p>
            </div>
            )
          )}
        </div>
      </div>


    </div>
    </>
  );
}

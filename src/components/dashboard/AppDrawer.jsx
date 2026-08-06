// The experimental homescreen's app drawer — a bottom sheet with two tabs:
//   Apps        — every page in the app (reuses QuickNavMenu's grid items,
//                 so colours/icons/labels stay identical to the classic
//                 nav grid), tap to navigate.
//   Add widget  — the widget registry grouped by category; tap to add an
//                 instance to the current page. Single-instance widgets
//                 already placed are disabled with an "added" tag.

import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, LayoutGrid, PlusSquare, Check, Plus, Folder, FolderOpen, FolderPlus, ChevronLeft, ChevronRight, Trash2, Pencil } from "lucide-react";
import {
  DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter, useDroppable,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { useTerms } from "@/lib/useTerms";
import { buildGridItems } from "@/lib/navCatalogue";
import { WIDGET_REGISTRY, WIDGET_CATEGORIES, widgetLabel, widgetDescription } from "@/lib/widgetRegistry";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { effectiveMode, HOME_MODES } from "@/lib/experimentalHome";
import { HOME_STYLES, getStyleShell } from "@/lib/homeStyles";
import { lookToStyle, USER_STYLE_PREFIX } from "@/lib/widgetLook";

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
function WidgetPreview({ def, mode = "normal", api, styleId = "", userStyles = [], maxHeight = 170 }) {
  const shell = styleId && !styleId.startsWith(USER_STYLE_PREFIX) ? getStyleShell(styleId) : "";
  const userLook = styleId.startsWith(USER_STYLE_PREFIX)
    ? userStyles.find((st) => `${USER_STYLE_PREFIX}${st.id}` === styleId)?.look
    : null;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none overflow-hidden ${shell || ""}`}
      style={{ ...(userLook ? lookToStyle(userLook) : null), maxHeight, borderRadius: "var(--v2-radius, 8px)" }}
    >
      <PreviewBoundary>
        {def.render({ mode, settings: {}, instanceId: `preview_${mode}`, api })}
      </PreviewBoundary>
    </div>
  );
}

// A key-sized widget (a quick-action button, a clock) doesn't need a
// full-height card with its own footer — it needs to look like the small
// thing it is. Those get a dense grid; everything else keeps the big card.
const isKeySized = (def) =>
  (def?.defaultSpan?.cols ?? 4) <= 2 && (def?.defaultSpan?.rows ?? 1) <= 1;

// Tapping a widget in the gallery opens this: flip through its display
// modes, try a style, then add it configured that way — instead of adding
// blind and fixing it afterwards.
function WidgetDetail({ id, def, api, userStyles, onBack, onAdd, t }) {
  const modes = HOME_MODES.filter((m) => (def.supportsModes || ["normal"]).includes(m));
  const [mode, setMode] = useState(effectiveMode("normal", def.supportsModes));
  const [styleId, setStyleId] = useState("");
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-3.5 h-3.5" /> All widgets
      </button>
      <div>
        <p className="text-sm font-semibold">{widgetLabel(def, t)}</p>
        <p className="text-xs text-muted-foreground">{widgetDescription(def, t)}</p>
      </div>

      <div className="rounded-xl border border-border/50 p-2 bg-background/40">
        <WidgetPreview def={def} mode={mode} api={api} styleId={styleId} userStyles={userStyles} maxHeight={260} />
      </div>

      {modes.length > 1 && (
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Display mode</p>
          <div className="flex flex-wrap gap-1.5">
            {modes.map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  mode === m ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                }`}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Style</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setStyleId("")}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              !styleId ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
            }`}>
            Inherit page style
          </button>
          {userStyles.map((st) => (
            <button key={st.id} type="button" onClick={() => setStyleId(`${USER_STYLE_PREFIX}${st.id}`)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                styleId === `${USER_STYLE_PREFIX}${st.id}` ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
              }`}>
              {st.label} · yours
            </button>
          ))}
          {HOME_STYLES.filter((st) => st.id !== "current").map((st) => (
            <button key={st.id} type="button" onClick={() => setStyleId(st.id)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                styleId === st.id ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
              }`}>
              {st.label}
            </button>
          ))}
        </div>
      </div>

      <button type="button"
        onClick={() => onAdd(id, styleId ? { style: styleId } : {}, mode)}
        className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
        Add to page
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
}) {
  const t = useTerms();
  const navigate = useNavigate();
  const [tab, setTab] = useState("apps");
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
  // Which widget sections are expanded. The first (Home & dashboard)
  // starts open so the tab never looks empty.
  const [openCats, setOpenCats] = useState({ home: true });
  // Per-card preview mode — cycled right on the card, no detail view needed.
  const [cardModes, setCardModes] = useState({});
  const cycleCardMode = (id, def) => {
    const modes = HOME_MODES.filter((m) => (def.supportsModes || ["normal"]).includes(m));
    if (modes.length < 2) return;
    setCardModes((prev) => {
      const cur = prev[id] || effectiveMode("normal", def.supportsModes);
      return { ...prev, [id]: modes[(modes.indexOf(cur) + 1) % modes.length] };
    });
  };

  const apps = useMemo(() => buildGridItems(t.Alters, t.System), [t.Alters, t.System]);
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

  const placed = useMemo(() => new Set(placedWidgetIds), [placedWidgetIds]);

  // Hooks stay ABOVE the early return — a hook after `if (!open) return`
  // shifts the hook order the moment the drawer opens, which is exactly the
  // "rendered more hooks" crash.
  const holdProps = useHoldToEdit(() => setAppsEdit(true), !!onSaveFolders && !appsEdit && !searching);
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
    <div className="fixed inset-0 z-[95] flex items-end justify-center" role="dialog" aria-label="App drawer">
      <button type="button" aria-label="Close drawer" onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-background border-t border-x border-border/60 rounded-t-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "80vh", paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-border/40">
          {/* Outside edit mode this is a plain app drawer — no widget tab. */}
          {pinOnTap ? (
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
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-2 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {tab === "apps" || !pinOnTap ? (
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
            detailId && registry[detailId] ? (
              <WidgetDetail
                id={detailId}
                def={registry[detailId]}
                api={api}
                userStyles={userStyles}
                t={t}
                onBack={() => setDetailId(null)}
                onAdd={(id, settings, mode) => { onAddWidget?.(id, settings, { mode }); setDetailId(null); }}
              />
            ) : (
            <div className="space-y-4">
              <input
                value={widgetSearch}
                onChange={(e) => setWidgetSearch(e.target.value)}
                placeholder="Search widgets…"
                className="w-full h-10 px-3 rounded-xl border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {WIDGET_CATEGORIES.map((cat) => {
                const q = widgetSearch.trim().toLowerCase();
                const widgets = Object.entries(registry).filter(([, d]) =>
                  d.category === cat.id && !d.hiddenFromDrawer
                  && (!q || widgetLabel(d, t).toLowerCase().includes(q) || widgetDescription(d, t).toLowerCase().includes(q)));
                if (widgets.length === 0) return null;
                // Sections collapse (owner request): with a section per
                // page the list is long, so only what you opened stays
                // open. A search always expands what it matched.
                const searching = !!q;
                const open = searching || !!openCats[cat.id];
                return (
                  <div key={cat.id} className="border-b border-border/30 pb-2">
                    <button
                      type="button"
                      onClick={() => setOpenCats((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                      aria-expanded={open}
                      className="w-full flex items-center gap-2 py-1.5 text-left"
                    >
                      <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`} />
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground flex-1 truncate">
                        {applyTerms(cat.label, t)}
                      </span>
                      <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{widgets.length}</span>
                    </button>
                    {/* Key-sized widgets, densely — a row of little buttons
                        rather than a column of mostly-empty cards. */}
                    {open && widgets.some(([, d]) => isKeySized(d)) && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pb-2">
                        {widgets.filter(([, d]) => isKeySized(d)).map(([id, def]) => {
                          const already = !def.supportsMultiInstance && placed.has(id);
                          return (
                            <div key={id}
                              className={`rounded-xl border overflow-hidden flex flex-col ${
                                already ? "border-border/30 opacity-60" : "border-border/50 hover:border-primary/50"
                              }`}>
                              <button type="button" onClick={() => setDetailId(id)} className="px-1.5 pt-1.5" aria-label={`${widgetLabel(def, t)} options`}>
                                <WidgetPreview def={def} mode={effectiveMode("normal", def.supportsModes)} api={api} userStyles={userStyles} maxHeight={44} />
                              </button>
                              <div className="flex items-center gap-1 px-1.5 pb-1.5 pt-1">
                                <span className="text-[0.6875rem] text-muted-foreground truncate flex-1">{widgetLabel(def, t)}</span>
                                <button type="button" disabled={already} onClick={() => onAddWidget?.(id)}
                                  aria-label={`Add ${widgetLabel(def, t)}`}
                                  className="text-xs px-2 py-0.5 rounded-full border border-primary/50 text-primary disabled:opacity-40 flex-shrink-0">
                                  {already ? <Check className="w-3 h-3" /> : "Add"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${open ? "" : "hidden"}`}>
                      {widgets.filter(([, d]) => !isKeySized(d)).map(([id, def]) => {
                        const already = !def.supportsMultiInstance && placed.has(id);
                        const cardMode = cardModes[id] || effectiveMode("normal", def.supportsModes);
                        const multiMode = (def.supportsModes || []).length > 1;
                        return (
                          <div key={id}
                            className={`rounded-xl border text-left transition-colors overflow-hidden ${
                              already ? "border-border/30 opacity-60" : "border-border/50 hover:border-primary/50"
                            }`}>
                            <button type="button" onClick={() => setDetailId(id)}
                              className="w-full text-left">
                              <div className="flex items-center gap-2 px-3 pt-2">
                                <span className="text-sm font-medium flex-1 truncate">{widgetLabel(def, t)}</span>
                                {already && (
                                  <span className="text-[0.6875rem] text-muted-foreground flex items-center gap-0.5 flex-shrink-0">
                                    <Check className="w-3 h-3" /> added
                                  </span>
                                )}
                              </div>
                              {/* The widget itself, live — what it will actually
                                  look like with your data, not an icon standing
                                  in for it. */}
                              <div className="px-2 py-2">
                                <WidgetPreview def={def} mode={cardMode} api={api} userStyles={userStyles} maxHeight={140} />
                              </div>
                            </button>
                            <div className="flex items-center justify-between px-3 pb-2 gap-2">
                              <button type="button" onClick={() => setDetailId(id)}
                                className="text-xs text-muted-foreground hover:text-foreground">
                                Options
                              </button>
                              {multiMode && (
                                <button type="button" onClick={() => cycleCardMode(id, def)}
                                  className="text-xs px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
                                  {MODE_LABEL[cardMode]}
                                </button>
                              )}
                              <button type="button" disabled={already}
                                onClick={() => onAddWidget?.(id)}
                                className="text-xs px-2.5 py-1 rounded-full border border-primary/50 text-primary disabled:opacity-40">
                                Add
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            )
          )}
        </div>
      </div>


    </div>
  );
}

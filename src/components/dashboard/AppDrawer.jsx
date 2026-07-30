// The experimental homescreen's app drawer — a bottom sheet with two tabs:
//   Apps        — every page in the app (reuses QuickNavMenu's grid items,
//                 so colours/icons/labels stay identical to the classic
//                 nav grid), tap to navigate.
//   Add widget  — the widget registry grouped by category; tap to add an
//                 instance to the current page. Single-instance widgets
//                 already placed are disabled with an "added" tag.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, LayoutGrid, PlusSquare, Check, Plus, Folder, FolderOpen, ChevronLeft, Trash2, Pencil } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { buildGridItems } from "@/lib/navCatalogue";
import { WIDGET_REGISTRY, WIDGET_CATEGORIES } from "@/lib/widgetRegistry";

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

// Folder management overlay: list folders (create/rename/delete); tapping
// one shows a searchable checklist of apps to include. An app lives in at
// most one folder — checking it here removes it from any other folder.
function OrganizeFolders({ apps, folders, onSave, onClose }) {
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const selected = folders.find((f) => f.id === selectedId) || null;

  const newFolder = () => {
    const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    onSave([...folders, { id, label: `Folder ${folders.length + 1}`, appIds: [] }]);
    setSelectedId(id);
  };
  const renameFolder = (id, label) =>
    onSave(folders.map((f) => (f.id === id ? { ...f, label: label.slice(0, 40) } : f)));
  const deleteFolder = (id) => {
    onSave(folders.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const toggleApp = (appId) => {
    if (!selected) return;
    const has = selected.appIds.includes(appId);
    onSave(folders.map((f) => {
      if (f.id === selected.id) {
        return { ...f, appIds: has ? f.appIds.filter((a) => a !== appId) : [...f.appIds, appId] };
      }
      // one folder per app — checking removes it elsewhere
      return has ? f : { ...f, appIds: f.appIds.filter((a) => a !== appId) };
    }));
  };

  const q = search.trim().toLowerCase();
  const list = q ? apps.filter((a) => a.label.toLowerCase().includes(q)) : apps;

  return (
    <div className="fixed inset-0 z-[97] flex items-end justify-center" role="dialog" aria-label="Organize app folders">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-2xl bg-background border-t border-x border-border/60 rounded-t-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "75vh", paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-border/40">
          {selected ? (
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Back to folders"
              className="p-1.5 -ml-1 text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /></button>
          ) : (
            <Folder className="w-4 h-4 text-muted-foreground" />
          )}
          <p className="flex-1 text-sm font-medium truncate">
            {selected ? (selected.label || "Folder") : "App folders"}
          </p>
          <button type="button" onClick={onClose} aria-label="Close organizer"
            className="p-2 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-2" style={{ WebkitOverflowScrolling: "touch" }}>
          {!selected ? (
            <>
              {folders.map((f) => (
                <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50">
                  <input
                    defaultValue={f.label}
                    placeholder="Folder name"
                    aria-label={`Rename ${f.label || "folder"}`}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== f.label) renameFolder(f.id, v); }}
                    className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                  />
                  <span className="text-[0.6875rem] text-muted-foreground flex-shrink-0">{f.appIds.length} apps</span>
                  <button type="button" onClick={() => setSelectedId(f.id)} aria-label={`Choose apps for ${f.label || "folder"}`}
                    className="min-w-[28px] min-h-[28px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => deleteFolder(f.id)} aria-label={`Delete ${f.label || "folder"}`}
                    className="min-w-[28px] min-h-[28px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={newFolder}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-border/50 text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center justify-center gap-1.5">
                <Plus className="w-4 h-4" /> New folder
              </button>
            </>
          ) : (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search apps…"
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="space-y-1">
                {list.map((app) => {
                  const Icon = app.icon;
                  const checked = selected.appIds.includes(app.id);
                  return (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => toggleApp(app.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors ${
                        checked ? "border-primary/50 bg-primary/5" : "border-border/40 hover:border-border"
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${app.color}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="flex-1 text-sm truncate">{app.label}</span>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        checked ? "bg-primary border-primary text-primary-foreground" : "border-border"
                      }`}>
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// pinOnTap: while the homescreen is in edit mode, tapping an app on the
// Apps tab PINS it to the page instead of navigating (the little + does the
// same either way). The drawer stays open so several apps can be pinned in
// a row. Folders come from experimental_home.drawer.folders via props.
export default function AppDrawer({
  open, onClose, placedWidgetIds = [], onAddWidget, onAddShortcut, pinOnTap = false,
  folders = [], onSaveFolders,
}) {
  const t = useTerms();
  const navigate = useNavigate();
  const [tab, setTab] = useState("apps");
  const [search, setSearch] = useState("");
  const [openFolderId, setOpenFolderId] = useState(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);

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
  const gridApps = searching ? filteredApps : filteredApps.filter((a) => !inFolder.has(a.id));
  const openFolder = folders.find((f) => f.id === openFolderId) || null;

  const placed = useMemo(() => new Set(placedWidgetIds), [placedWidgetIds]);

  if (!open) return null;

  const openApp = (app) => {
    if (pinOnTap && onAddShortcut) { onAddShortcut(app.id); return; }
    onClose();
    navigate(app.path);
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
              {pinOnTap && (
                <div className="mb-3 -mt-1 flex items-center justify-center gap-3">
                  <p className="text-[0.6875rem] text-primary/90">Editing — tap an app to pin it</p>
                  {onSaveFolders && (
                    <button
                      type="button"
                      onClick={() => setOrganizeOpen(true)}
                      className="text-[0.6875rem] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <Folder className="w-3 h-3" /> Organize
                    </button>
                  )}
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
                  <p className="mb-2 text-sm font-medium flex items-center gap-1.5">
                    <FolderOpen className="w-4 h-4 text-muted-foreground" /> {openFolder.label || "Folder"}
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                    {openFolder.appIds.map((id) => appById.get(id)).filter(Boolean).map((app) => (
                      <AppTile key={app.id} app={app} pinOnTap={pinOnTap} onAddShortcut={onAddShortcut} onOpen={() => openApp(app)} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                  {/* Folder tiles first (hidden while searching — search is flat) */}
                  {!searching && folders.filter((f) => f.appIds.length > 0 || pinOnTap).map((f) => {
                    const preview = f.appIds.map((id) => appById.get(id)).filter(Boolean).slice(0, 4);
                    return (
                      <button
                        key={f.id}
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
                    );
                  })}
                  {gridApps.map((app) => (
                    <AppTile key={app.id} app={app} pinOnTap={pinOnTap} onAddShortcut={onAddShortcut} onOpen={() => openApp(app)} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {WIDGET_CATEGORIES.map((cat) => {
                const widgets = Object.entries(WIDGET_REGISTRY).filter(([, d]) => d.category === cat.id && !d.hiddenFromDrawer);
                if (widgets.length === 0) return null;
                return (
                  <div key={cat.id}>
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{cat.label}</p>
                    <div className="space-y-1">
                      {widgets.map(([id, def]) => {
                        const Icon = def.icon;
                        const already = !def.supportsMultiInstance && placed.has(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            disabled={already}
                            onClick={() => onAddWidget?.(id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors ${
                              already
                                ? "border-border/30 opacity-50 cursor-not-allowed"
                                : "border-border/50 hover:border-primary/50 hover:bg-primary/5"
                            }`}
                          >
                            {Icon && <Icon className="w-4 h-4 text-primary flex-shrink-0" />}
                            <span className="flex-1 min-w-0">
                              <span className="text-sm font-medium block">{def.label}</span>
                              <span className="text-xs text-muted-foreground block truncate">{def.description}</span>
                            </span>
                            {already && (
                              <span className="text-[0.6875rem] text-muted-foreground flex items-center gap-0.5 flex-shrink-0">
                                <Check className="w-3 h-3" /> added
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {organizeOpen && onSaveFolders && (
        <OrganizeFolders
          apps={apps}
          folders={folders}
          onSave={onSaveFolders}
          onClose={() => setOrganizeOpen(false)}
        />
      )}
    </div>
  );
}

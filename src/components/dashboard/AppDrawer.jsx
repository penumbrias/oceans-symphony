// The experimental homescreen's app drawer — a bottom sheet with two tabs:
//   Apps        — every page in the app (reuses QuickNavMenu's grid items,
//                 so colours/icons/labels stay identical to the classic
//                 nav grid), tap to navigate.
//   Add widget  — the widget registry grouped by category; tap to add an
//                 instance to the current page. Single-instance widgets
//                 already placed are disabled with an "added" tag.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, LayoutGrid, PlusSquare, Check, Plus } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { buildGridItems } from "@/lib/navCatalogue";
import { WIDGET_REGISTRY, WIDGET_CATEGORIES } from "@/lib/widgetRegistry";

// pinOnTap: while the homescreen is in edit mode, tapping an app on the
// Apps tab PINS it to the page instead of navigating (the little + does the
// same either way). The drawer stays open so several apps can be pinned in
// a row.
export default function AppDrawer({ open, onClose, placedWidgetIds = [], onAddWidget, onAddShortcut, pinOnTap = false }) {
  const t = useTerms();
  const navigate = useNavigate();
  const [tab, setTab] = useState("apps");
  const [search, setSearch] = useState("");

  const apps = useMemo(() => buildGridItems(t.Alters, t.System), [t.Alters, t.System]);
  const filteredApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? apps.filter((a) => a.label.toLowerCase().includes(q)) : apps;
  }, [apps, search]);

  const placed = useMemo(() => new Set(placedWidgetIds), [placedWidgetIds]);

  if (!open) return null;

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
                <p className="mb-3 -mt-1 text-[0.6875rem] text-center text-primary/90">
                  Editing — tap an app to pin it to the page
                </p>
              )}
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {filteredApps.map((app) => {
                  const Icon = app.icon;
                  return (
                    <div key={app.id} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (pinOnTap && onAddShortcut) { onAddShortcut(app.id); return; }
                          onClose();
                          navigate(app.path);
                        }}
                        className="w-full flex flex-col items-center gap-1.5 group"
                      >
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
                })}
              </div>
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
    </div>
  );
}

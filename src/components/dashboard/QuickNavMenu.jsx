import React, { useState, useMemo, useCallback } from "react";
import { useTerms } from "@/lib/useTerms";
import { Link } from "react-router-dom";
import { Users, Clock, BarChart2, Settings, BookOpen, CheckSquare, ClipboardList, Sparkles, Activity, Zap, GitBranch, GitMerge, LayoutGrid, List, FileText, Heart, Bell, Vote, Shield, MapPin, UserRound, X as XIcon, Pencil, Check } from "lucide-react";
import { usePendingReminderInstances } from "@/lib/remindersScheduler";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DEFAULT_CONFIG } from "@/utils/navigationConfig";
import GlobalSearch from "./GlobalSearch";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function buildNavGroups(altersLabel, systemLabel) {
  return {
    [systemLabel]: [
      { id: "alters",   label: altersLabel, icon: Users,     path: "/Home" },
      { id: "friends",  label: "Friends",   icon: UserRound, path: "/friends" },
      { id: "groups",   label: "Groups",    icon: Users,     path: "/groups" },
      { id: "settings", label: "Settings",  icon: Settings,  path: "/settings" },
    ],
    "Tracking": [
      { id: "checkin",      label: `${systemLabel} Meeting`,  icon: Sparkles,   path: "/system-checkin" },
      { id: "checkin-log",  label: "Check-In Log",            icon: Heart,      path: "/checkin-log" },
      { id: "activities",   label: "Activities",              icon: Zap,        path: "/activities" },
      { id: "tasks",        label: "Daily Tasks",             icon: CheckSquare,   path: "/tasks" },
      { id: "todo",         label: "To-Do List",              icon: ClipboardList, path: "/todo" },
      { id: "sleep",        label: "Sleep",                   icon: Activity,   path: "/sleep" },
    ],
    "Journal & Content": [
      { id: "journals", label: "Journals", icon: BookOpen, path: "/journals" },
      { id: "polls",    label: "Polls",    icon: Vote,     path: "/polls" },
    ],
    "Tools": [
      { id: "reminders",      label: "Reminders",       icon: Bell,        path: "/reminders" },
      { id: "therapy-report", label: "Therapy Report",  icon: FileText,    path: "/therapy-report" },
      { id: "support",        label: "Support & Learn", icon: BookOpen,    path: "/grounding" },
      { id: "safety-plan",    label: "Safety Plan",     icon: Shield,      path: "/safety-plan" },
    ],
    "Analytics": [
      { id: "analytics",        label: "Analytics",              icon: BarChart2, path: "/analytics" },
      { id: "system-map",       label: `${systemLabel} Map`,     icon: GitBranch, path: "/system-map" },
      { id: "timeline",         label: "Timeline",               icon: Clock,     path: "/timeline" },
      { id: "system-history",   label: `${systemLabel} History`, icon: GitMerge,  path: "/system-history" },
      { id: "location-history", label: "Location History",       icon: MapPin,    path: "/location-history" },
    ],
  };
}

function buildGridItems(altersLabel, systemLabel) {
  return [
    { id: "reminders",       label: "Reminders",              icon: Bell,          path: "/reminders",        color: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
    { id: "alters",          label: altersLabel,              icon: Users,         path: "/Home",             color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
    { id: "checkin",         label: `${systemLabel} Meeting`, icon: Sparkles,      path: "/system-checkin",   color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
    { id: "activities",      label: "Activities",             icon: Zap,           path: "/activities",       color: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
    { id: "analytics",       label: "Analytics",              icon: BarChart2,     path: "/analytics",        color: "bg-green-500/15 text-green-600 dark:text-green-400" },
    { id: "therapy-report",  label: "Therapy Report",         icon: FileText,      path: "/therapy-report",   color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
    { id: "support",         label: "Support & Learn",        icon: Heart,         path: "/grounding",        color: "bg-red-500/15 text-red-600 dark:text-red-400" },
    { id: "checkin-log",     label: "Check-In Log",           icon: Heart,         path: "/checkin-log",      color: "bg-pink-500/15 text-pink-600 dark:text-pink-400" },
    { id: "sleep",           label: "Sleep",                  icon: Activity,      path: "/sleep",            color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
    { id: "timeline",        label: "Timeline",               icon: Clock,         path: "/timeline",         color: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
    { id: "system-map",      label: `${systemLabel} Map`,     icon: GitBranch,     path: "/system-map",       color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
    { id: "journals",        label: "Journals",               icon: BookOpen,      path: "/journals",         color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    { id: "tasks",           label: "Daily Tasks",            icon: CheckSquare,   path: "/tasks",            color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
    { id: "todo",            label: "To-Do List",             icon: ClipboardList, path: "/todo",             color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    { id: "groups",          label: "Groups",                 icon: Users,         path: "/groups",           color: "bg-lime-500/15 text-lime-600 dark:text-lime-400" },
    { id: "safety-plan",     label: "Safety Plan",            icon: Shield,        path: "/safety-plan",      color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
    { id: "polls",           label: "Polls",                  icon: Vote,          path: "/polls",            color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
    { id: "system-history",  label: `${systemLabel} History`, icon: GitMerge,      path: "/system-history",   color: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400" },
    { id: "location-history",label: "Location History",       icon: MapPin,        path: "/location-history", color: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" },
    { id: "settings",        label: "Settings",               icon: Settings,      path: "/settings",         color: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
    { id: "home",            label: "Home",                   icon: CheckSquare,   path: "/",                 color: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
    { id: "friends",         label: "Friends",                icon: UserRound,     path: "/friends",          color: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  ];
}

// ── Sortable tile ──────────────────────────────────────────────────────────────

function SortableTile({ item, editMode, onRemove, pendingCount }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const Icon = item.icon;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const tileInner = (
    <div
      className={`bg-card px-3 py-1 rounded-2xl flex flex-col items-center gap-2 border transition-all h-full ${
        editMode
          ? "border-primary/30 border-dashed bg-muted/10 cursor-grab active:cursor-grabbing"
          : "border-border/50 hover:bg-muted/30 hover:border-border cursor-pointer group"
      }`}
      {...(editMode ? { ...attributes, ...listeners } : {})}
    >
      <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
        <Icon className="w-5 h-5" />
        {!editMode && item.id === "reminders" && pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
            {pendingCount > 9 ? "9+" : pendingCount}
          </span>
        )}
      </div>
      <span className={`text-xs font-medium text-foreground text-center leading-tight ${editMode ? "" : "group-hover:text-primary transition-colors"}`}>
        {item.label}
      </span>
    </div>
  );

  return (
    <div ref={setNodeRef} style={style} className={`relative select-none ${editMode ? "touch-none" : ""}`}>
      {editMode ? tileInner : <Link to={item.path}>{tileInner}</Link>}
      {editMode && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onRemove(item.id)}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow z-20 hover:bg-destructive/80 transition-colors"
          aria-label={`Remove ${item.label}`}
        >
          <XIcon className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

const NAV_DISPLAY_CYCLE = ["list", "2", "3", "4", "5"];

export default function QuickNavMenu() {
  const terms = useTerms();
  const queryClient = useQueryClient();

  const [navDisplayMode, setNavDisplayMode] = useState(() => {
    const saved = localStorage.getItem("nav_display_mode");
    if (saved) return saved;
    if (localStorage.getItem("nav_grid_layout") === "true") {
      return localStorage.getItem("nav_grid_cols") || "3";
    }
    return "list";
  });

  const [editMode, setEditMode] = useState(false);
  const [localOrder, setLocalOrder] = useState(null); // null = use persisted order
  const [saving, setSaving] = useState(false);

  const cycleNavDisplay = () => {
    if (editMode) return; // lock layout toggle during edit
    const next = NAV_DISPLAY_CYCLE[(NAV_DISPLAY_CYCLE.indexOf(navDisplayMode) + 1) % NAV_DISPLAY_CYCLE.length];
    setNavDisplayMode(next);
    localStorage.setItem("nav_display_mode", next);
  };

  const { data: pendingInstances = [] } = usePendingReminderInstances();
  const pendingCount = pendingInstances.filter(i => i.status === "fired").length;

  const { data: systemSettingsData = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  const navConfig = useMemo(() => {
    return systemSettingsData?.[0]?.navigation_config || DEFAULT_CONFIG;
  }, [systemSettingsData]);

  const NAV_GROUPS = useMemo(() => buildNavGroups(terms.Alters, terms.System), [terms.Alters, terms.System]);
  const GRID_ITEMS = useMemo(() => buildGridItems(terms.Alters, terms.System), [terms.Alters, terms.System]);

  const configuredGridItems = useMemo(() => {
    const removed = navConfig.dashboardGridRemoved || [];
    const mergedGrid = [
      ...navConfig.dashboardGrid,
      ...DEFAULT_CONFIG.dashboardGrid.filter(id => !navConfig.dashboardGrid.includes(id) && !removed.includes(id)),
    ];
    return mergedGrid.map(id => GRID_ITEMS.find(item => item.id === id)).filter(Boolean);
  }, [GRID_ITEMS, navConfig.dashboardGrid, navConfig.dashboardGridRemoved]);

  // Items shown in the grid: use localOrder during edit, persisted order otherwise
  const displayItems = useMemo(() => {
    if (!localOrder) return configuredGridItems;
    return localOrder.map(id => GRID_ITEMS.find(item => item.id === id)).filter(Boolean);
  }, [localOrder, configuredGridItems, GRID_ITEMS]);

  // DnD sensors — pointer needs distance threshold; touch needs delay so scroll still works
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleEnterEdit = useCallback(() => {
    setLocalOrder(configuredGridItems.map(i => i.id));
    setEditMode(true);
  }, [configuredGridItems]);

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return;
    setLocalOrder(prev => {
      const oldIndex = prev.indexOf(active.id);
      const newIndex = prev.indexOf(over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const handleRemoveInEdit = useCallback((itemId) => {
    setLocalOrder(prev => prev.filter(id => id !== itemId));
  }, []);

  const handleDoneEdit = useCallback(async () => {
    if (!localOrder) { setEditMode(false); return; }
    setSaving(true);
    try {
      const settings = systemSettingsData?.[0];
      const removed = navConfig.dashboardGridRemoved || [];
      // Any item in the original grid that's no longer in localOrder was removed here
      const removedNow = configuredGridItems.map(i => i.id).filter(id => !localOrder.includes(id));
      const newRemoved = [...new Set([...removed, ...removedNow])];
      const newConfig = { ...navConfig, dashboardGrid: localOrder, dashboardGridRemoved: newRemoved };

      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { navigation_config: newConfig });
      } else {
        await base44.entities.SystemSettings.create({ navigation_config: newConfig });
      }
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } finally {
      setSaving(false);
      setEditMode(false);
      setLocalOrder(null);
    }
  }, [localOrder, navConfig, configuredGridItems, systemSettingsData, queryClient]);

  return (
    <div className="space-y-4" data-tour="quick-nav">
      {/* Header with search and layout controls */}
      <div className="flex gap-2 items-center">
        <GlobalSearch />
        {navDisplayMode !== "list" && (
          editMode ? (
            <button
              onClick={handleDoneEdit}
              disabled={saving}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              Done
            </button>
          ) : (
            <button
              onClick={handleEnterEdit}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              title="Rearrange tiles"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
          )
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleNavDisplay}
          disabled={editMode}
          title={navDisplayMode === "list" ? "Switch to grid view" : `${navDisplayMode}-col grid — tap to ${navDisplayMode === "5" ? "switch to list" : "add column"}`}
          className="flex-shrink-0"
        >
          {navDisplayMode === "list"
            ? <LayoutGrid className="h-4 w-4" />
            : <span className="text-xs font-bold leading-none">{navDisplayMode}</span>
          }
        </Button>
      </div>

      {/* Edit mode hint */}
      {editMode && (
        <p className="text-xs text-muted-foreground text-center">
          Drag to rearrange · tap × to remove · tap Done to save
        </p>
      )}

      {/* Grid layout */}
      {navDisplayMode !== "list" && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={displayItems.map(i => i.id)} strategy={rectSortingStrategy}>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${navDisplayMode}, minmax(0, 1fr))` }}
            >
              {displayItems.map(item => (
                <SortableTile
                  key={item.id}
                  item={item}
                  editMode={editMode}
                  onRemove={handleRemoveInEdit}
                  pendingCount={pendingCount}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* List layout — always shows all pages, no edit mode here */}
      {navDisplayMode === "list" && (
        <div className="space-y-6">
          {Object.entries(NAV_GROUPS).map(([groupName, items]) => (
            <div key={groupName}>
              <p className="text-muted-foreground mr-1 mb-1 ml-2 text-xs font-semibold uppercase tracking-wider">
                {groupName}
              </p>
              <div className="space-y-2">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.path} to={item.path}>
                      <div className="bg-card px-4 py-2 rounded-lg flex items-center gap-3 border border-border/50 hover:bg-muted/50 hover:border-border transition-all cursor-pointer group">
                        <div className="text-muted-foreground group-hover:text-primary transition-colors">
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="text-foreground px-2 text-sm font-extralight lowercase group-hover:text-primary transition-colors flex-1">
                          {item.label}
                        </span>
                        {item.id === "reminders" && pendingCount > 0 && (
                          <span className="w-5 h-5 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                            {pendingCount > 9 ? "9+" : pendingCount}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState, useMemo } from "react";
import { useTerms } from "@/lib/useTerms";
import { Link } from "react-router-dom";
import { Users, Clock, BarChart2, Settings, BookOpen, CheckSquare, Sparkles, Activity, Zap, GitBranch, LayoutGrid, List, FileText, Heart, Bell, Vote } from "lucide-react";
import { usePendingReminderInstances } from "@/lib/remindersScheduler";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DEFAULT_CONFIG } from "@/utils/navigationConfig";
import GlobalSearch from "./GlobalSearch";

function buildNavGroups(altersLabel, systemLabel, frontLabel, switchLabel) {
  return {
    [systemLabel]: [
    { id: "alters", label: altersLabel, icon: Users, path: "/Home" },
    { id: "groups", label: "Groups", icon: Users, path: "/groups" },
    { id: "settings", label: "Settings", icon: Settings, path: "/settings" }],

    "Tracking": [
    { id: "daily-tasks", label: "Daily Tasks", icon: CheckSquare, path: "/tasks" },
    { id: "checkin-log", label: "Check-In Log", icon: Heart, path: "/checkin-log" },
    { id: "activities", label: "Activities", icon: Zap, path: "/activities" },
    { id: "sleep", label: "Sleep", icon: Activity, path: "/sleep" },
    { id: "checkin", label: `${systemLabel} Check-In`, icon: Sparkles, path: "/system-checkin" }],

    "Tools": [
    { id: "therapy-report", label: "Therapy Report", icon: CheckSquare, path: "/therapy-report" },
    { id: "support", label: "Support & Learn", icon: BookOpen, path: "/grounding" },
    { id: "reminders", label: "Reminders", icon: Bell, path: "/reminders" }],

    "Analytics": [
    { id: "analytics", label: "Analytics", icon: BarChart2, path: "/analytics" },
    { id: "system-map", label: `${systemLabel} Map`, icon: GitBranch, path: "/system-map" },
    { id: "timeline", label: "Timeline", icon: Clock, path: "/timeline" }],

    "Journal": [
    { id: "journals", label: "Journals", icon: BookOpen, path: "/journals" }]

  };
}

function buildGridItems(altersLabel, frontLabel, systemLabel) {
  return [
  { id: "alters", label: altersLabel, icon: Users, path: "/Home", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  { id: "checkin", label: `${systemLabel} Check-In`, icon: Sparkles, path: "/system-checkin", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  { id: "activities", label: "Activities", icon: Zap, path: "/activities", color: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
  { id: "analytics", label: "Analytics", icon: BarChart2, path: "/analytics", color: "bg-green-500/15 text-green-600 dark:text-green-400" },
  { id: "therapy-report", label: "Therapy Report", icon: FileText, path: "/therapy-report", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { id: "support", label: "Support & Learn", icon: Heart, path: "/grounding", color: "bg-red-500/15 text-red-600 dark:text-red-400" },
  { id: "checkin-log", label: "Check-In Log", icon: Heart, path: "/checkin-log", color: "bg-pink-500/15 text-pink-600 dark:text-pink-400" },
  { id: "sleep", label: "Sleep", icon: Activity, path: "/sleep", color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  { id: "timeline", label: "Timeline", icon: Clock, path: "/timeline", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  { id: "system-map", label: `${systemLabel} Map`, icon: GitBranch, path: "/system-map", color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  { id: "journals", label: "Journals", icon: BookOpen, path: "/journals", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { id: "daily-tasks", label: "Daily Tasks", icon: CheckSquare, path: "/tasks", color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  { id: "groups", label: "Groups", icon: Users, path: "/groups", color: "bg-lime-500/15 text-lime-600 dark:text-lime-400" },
  { id: "tasks", label: "Daily Tasks", icon: CheckSquare, path: "/tasks", color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
{ id: "safety-plan", label: "Safety Plan", icon: Heart, path: "/safety-plan", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  { id: "settings", label: "Settings", icon: Settings, path: "/settings", color: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
  { id: "reminders", label: "Reminders", icon: Bell, path: "/reminders", color: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  { id: "polls", label: "Polls", icon: Vote, path: "/polls", color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" }];
}

export default function QuickNavMenu() {
  const terms = useTerms();
  const [isGridLayout, setIsGridLayout] = useState(() => localStorage.getItem("nav_grid_layout") === "true");
  const { data: pendingInstances = [] } = usePendingReminderInstances();
  const pendingCount = pendingInstances.filter(i => i.status === "fired").length;
  
  const { data: systemSettingsData = [] } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: () => base44.entities.SystemSettings.list()
  });

  const navConfig = useMemo(() => {
    return systemSettingsData?.[0]?.navigation_config || DEFAULT_CONFIG;
  }, [systemSettingsData]);

  const NAV_GROUPS = useMemo(() => buildNavGroups(terms.Alters, terms.System, terms.Front, terms.Switch), [terms.Alters, terms.System, terms.Front, terms.Switch]);
  const GRID_ITEMS = useMemo(() => buildGridItems(terms.Alters, terms.Front, terms.System), [terms.Alters, terms.Front, terms.System]);

  const configuredGridItems = useMemo(() => {
    return navConfig.dashboardGrid
      .map(id => GRID_ITEMS.find(item => item.id === id))
      .filter(Boolean);
  }, [GRID_ITEMS, navConfig.dashboardGrid]);

  const configuredGroups = useMemo(() => {
    const filtered = {};
    Object.entries(NAV_GROUPS).forEach(([group, items]) => {
      const configuredItems = items.filter(item => navConfig.dashboardGrid.includes(item.id));
      if (configuredItems.length > 0) {
        filtered[group] = configuredItems;
      }
    });
    return filtered;
  }, [NAV_GROUPS, navConfig.dashboardGrid]);

  // Always show all items since search is now global
  const filteredGroups = configuredGroups;
  const filteredGridItems = configuredGridItems;

  return (
    <div className="space-y-4">
      {/* Header with search and layout toggle */}
      <div className="flex gap-2 items-center">
        <GlobalSearch />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            const newState = !isGridLayout;
            setIsGridLayout(newState);
            localStorage.setItem("nav_grid_layout", newState ? "true" : "false");
          }}
          title={isGridLayout ? "Switch to list view" : "Switch to grid view"}>
          
          {isGridLayout ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
        </Button>
      </div>

      {/* Grid Layout */}
      {isGridLayout &&
      <div className="grid grid-cols-3 gap-2">
              {configuredGridItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path}>
                    <div className="bg-card px-3 py-1 rounded-2xl flex flex-col items-center gap-2 border border-border/50 hover:bg-muted/30 hover:border-border transition-all cursor-pointer group">
                      <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
                        <Icon className="w-5 h-5" />
                        {item.id === "reminders" && pendingCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                            {pendingCount > 9 ? "9+" : pendingCount}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors text-center">
                        {item.label}
                      </span>
                    </div>
                  </Link>);

          })}
            </div>
      }

      {/* List Layout */}
      {!isGridLayout &&
      <div className="space-y-6">
          {Object.entries(configuredGroups).map(([groupName, items]) =>
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
                        <span className="text-foreground px-2 text-sm font-extralight text-right lowercase group-hover:text-primary transition-colors">
                          {item.label}
                        </span>
                      </div>
                    </Link>);

            })}
              </div>
            </div>
        )}
        </div>
      }
    </div>);

}
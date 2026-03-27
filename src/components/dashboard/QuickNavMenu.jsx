import React, { useState, useMemo } from "react";
import { useTerms } from "@/lib/useTerms";
import { Link } from "react-router-dom";
import { Users, Clock, BarChart2, Settings, BookOpen, CheckSquare, Sparkles, Activity, Zap, ClipboardList, GitBranch, Search, X, LayoutGrid, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function buildNavGroups(altersLabel, systemLabel, frontLabel, switchLabel) {
  return {
    [systemLabel]: [
    { label: altersLabel, icon: Users, path: "/Home" },
    { label: "Settings", icon: Settings, path: "/settings" }],

    "Tracking": [
    { label: "Daily Tasks", icon: CheckSquare, path: "/tasks" },
    { label: "To-Do List", icon: CheckSquare, path: "/todo" },
    { label: "Diary Cards", icon: ClipboardList, path: "/diary" },
    { label: "Activities", icon: Zap, path: "/activities" },
    { label: "Sleep", icon: Activity, path: "/sleep" },
    { label: "Check-In", icon: Sparkles, path: "/system-checkin" }],

    "Analytics": [
    { label: "Analytics", icon: BarChart2, path: "/analytics" },
    { label: `Co-${frontLabel}ing`, icon: GitBranch, path: "/cofronting-analytics" },
    { label: `${systemLabel} Map`, icon: GitBranch, path: "/system-map" },
    { label: "Timeline", icon: Clock, path: "/timeline" }],

    "Journal": [
    { label: "Journals", icon: BookOpen, path: "/journals" }]

  };
}

function buildGridItems(altersLabel, frontLabel, systemLabel) {
  return [
  { label: altersLabel, icon: Users, path: "/Home", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  { label: "Analytics", icon: BarChart2, path: "/analytics", color: "bg-green-500/15 text-green-600 dark:text-green-400" },
  { label: "Journals", icon: BookOpen, path: "/journals", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { label: "Daily Tasks", icon: CheckSquare, path: "/tasks", color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  { label: "Check-In", icon: Sparkles, path: "/system-checkin", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  { label: "Settings", icon: Settings, path: "/settings", color: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
  { label: "Diary Cards", icon: ClipboardList, path: "/diary", color: "bg-pink-500/15 text-pink-600 dark:text-pink-400" },
  { label: "Activities", icon: Zap, path: "/activities", color: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
  { label: "Sleep", icon: Activity, path: "/sleep", color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  { label: `Co-${frontLabel}ing`, icon: GitBranch, path: "/cofronting-analytics", color: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" },
  { label: `${systemLabel} Map`, icon: GitBranch, path: "/system-map", color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  { label: "Timeline", icon: Clock, path: "/timeline", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400" }];

}

export default function QuickNavMenu() {
  const terms = useTerms();
  const [searchQuery, setSearchQuery] = useState("");
  const [isGridLayout, setIsGridLayout] = useState(() => localStorage.getItem("nav_grid_layout") === "true");
  const NAV_GROUPS = useMemo(() => buildNavGroups(terms.Alters, terms.System, terms.Front, terms.Switch), [terms.Alters, terms.System, terms.Front, terms.Switch]);
  const GRID_ITEMS = useMemo(() => buildGridItems(terms.Alters, terms.Front, terms.System), [terms.Alters, terms.Front, terms.System]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return NAV_GROUPS;

    const query = searchQuery.toLowerCase();
    const filtered = {};

    Object.entries(NAV_GROUPS).forEach(([group, items]) => {
      const matches = items.filter((item) =>
      item.label.toLowerCase().includes(query)
      );
      if (matches.length > 0) {
        filtered[group] = matches;
      }
    });

    return filtered;
  }, [searchQuery]);

  const filteredGridItems = useMemo(() => {
    if (!searchQuery.trim()) return GRID_ITEMS;
    return GRID_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <div className="space-y-4">
      {/* Header with search and layout toggle */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9" />
          
          {searchQuery &&
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground">
            
              <X className="h-4 w-4" />
            </button>
          }
        </div>
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
      <div>
          {filteredGridItems.length > 0 ?
        <div className="grid grid-cols-3 gap-2">
              {filteredGridItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path}>
                    <div className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-border/50 bg-card hover:bg-muted/30 hover:border-border transition-all cursor-pointer group">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors text-center">
                        {item.label}
                      </span>
                    </div>
                  </Link>);

          })}
            </div> :

        <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No items found</p>
            </div>
        }
        </div>
      }

      {/* List Layout */}
      {!isGridLayout &&
      <div className="space-y-6">
          {Object.entries(filteredGroups).map(([groupName, items]) =>
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

          {searchQuery && Object.keys(filteredGroups).length === 0 &&
        <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No items found</p>
            </div>
        }
        </div>
      }
    </div>);

}
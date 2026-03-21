import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Users, Clock, BarChart2, Settings, BookOpen, CheckSquare, Sparkles, Activity, Zap, ClipboardList, GitBranch, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

const NAV_GROUPS = {
  "System": [
    { label: "Members", icon: Users, path: "/Home" },
    { label: "Settings", icon: Settings, path: "/settings" },
  ],
  "Tracking": [
    { label: "Daily Tasks", icon: CheckSquare, path: "/tasks" },
    { label: "To-Do List", icon: CheckSquare, path: "/todo" },
    { label: "Diary Cards", icon: ClipboardList, path: "/diary" },
    { label: "Activities", icon: Zap, path: "/activities" },
    { label: "Sleep", icon: Activity, path: "/sleep" },
    { label: "Check-In", icon: Sparkles, path: "/system-checkin" },
  ],
  "Analytics": [
    { label: "Front History", icon: Clock, path: "/front-history" },
    { label: "Analytics", icon: BarChart2, path: "/analytics" },
    { label: "Co-Fronting", icon: GitBranch, path: "/cofronting-analytics" },
    { label: "Timeline", icon: Clock, path: "/timeline" },
  ],
  "Journal": [
    { label: "Journals", icon: BookOpen, path: "/journals" },
  ],
};

export default function QuickNavMenu() {
  const [searchQuery, setSearchQuery] = useState("");

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

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search navigation..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="space-y-6">
        {Object.entries(filteredGroups).map(([groupName, items]) => (
          <div key={groupName}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {groupName}
            </p>
            <div className="space-y-2">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.path} to={item.path}>
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card hover:bg-muted/50 hover:border-border transition-all cursor-pointer group">
                      <div className="text-muted-foreground group-hover:text-primary transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {item.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* No results message */}
      {searchQuery && Object.keys(filteredGroups).length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">No items found for "{searchQuery}"</p>
        </div>
      )}
    </div>
  );
}
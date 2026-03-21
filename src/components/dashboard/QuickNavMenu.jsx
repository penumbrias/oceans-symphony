import React from "react";
import { Link } from "react-router-dom";
import { Users, Clock, BarChart2, Settings, BookOpen, ClipboardList, CheckSquare, Sparkles } from "lucide-react";

const NAV_ITEMS = [
  { label: "Members", icon: Users, path: "/Home", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  { label: "History", icon: Clock, path: "/front-history", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { label: "Analytics", icon: BarChart2, path: "/analytics", color: "bg-green-500/15 text-green-600 dark:text-green-400" },
  { label: "Journals", icon: BookOpen, path: "/journals", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { label: "Diary Cards", icon: ClipboardList, path: "/diary", color: "bg-pink-500/15 text-pink-600 dark:text-pink-400" },
  { label: "Daily Tasks", icon: CheckSquare, path: "/tasks", color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  { label: "Check-In", icon: Sparkles, path: "/system-checkin", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  { label: "Settings", icon: Settings, path: "/settings", color: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
];

export default function QuickNavMenu() {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Access</p>
      <div className="grid grid-cols-3 gap-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.path} to={item.path}>
              <div className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-border/50 bg-card hover:bg-muted/30 hover:border-border transition-all cursor-pointer group">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
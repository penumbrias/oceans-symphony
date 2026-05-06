import React, { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTerms } from "@/lib/useTerms";
import { Users, Clock, BarChart2, Settings, BookOpen, CheckSquare, Sparkles, Activity, Zap, GitBranch, GitMerge, FileText, Heart, Bell, Vote, Shield, X } from "lucide-react";
import { usePendingReminderInstances } from "@/lib/remindersScheduler";
import { cn } from "@/lib/utils";

function buildSidebarGroups(altersLabel, systemLabel) {
  return [
    {
      label: systemLabel,
      items: [
        { id: "alters",   label: altersLabel,   icon: Users,    path: "/Home" },
        { id: "groups",   label: "Groups",       icon: Users,    path: "/groups" },
        { id: "settings", label: "Settings",     icon: Settings, path: "/settings" },
      ],
    },
    {
      label: "Tracking",
      items: [
        { id: "checkin",     label: `${systemLabel} Meeting`,   icon: Sparkles,    path: "/system-checkin" },
        { id: "checkin-log", label: "Check-In Log",            icon: Heart,       path: "/checkin-log" },
        { id: "activities",  label: "Activities",              icon: Zap,         path: "/activities" },
        { id: "tasks",       label: "Daily Tasks",             icon: CheckSquare, path: "/tasks" },
        { id: "sleep",       label: "Sleep",                   icon: Activity,    path: "/sleep" },
      ],
    },
    {
      label: "Journal & Content",
      items: [
        { id: "journals", label: "Journals", icon: BookOpen, path: "/journals" },
        { id: "polls",    label: "Polls",    icon: Vote,     path: "/polls" },
      ],
    },
    {
      label: "Tools",
      items: [
        { id: "reminders",      label: "Reminders",       icon: Bell,     path: "/reminders" },
        { id: "therapy-report", label: "Therapy Report",  icon: FileText, path: "/therapy-report" },
        { id: "support",        label: "Support & Learn", icon: BookOpen, path: "/grounding" },
        { id: "safety-plan",    label: "Safety Plan",     icon: Shield,   path: "/safety-plan" },
      ],
    },
    {
      label: "Analytics",
      items: [
        { id: "analytics",       label: "Analytics",          icon: BarChart2,  path: "/analytics" },
        { id: "system-map",     label: `${systemLabel} Map`, icon: GitBranch,  path: "/system-map" },
        { id: "timeline",       label: "Timeline",           icon: Clock,      path: "/timeline" },
        { id: "system-history", label: "System History",     icon: GitMerge,   path: "/system-history" },
      ],
    },
  ];
}

export default function SidebarNav({ open, onClose }) {
  const location = useLocation();
  const terms = useTerms();
  const { data: pendingInstances = [] } = usePendingReminderInstances();
  const pendingCount = pendingInstances.filter(i => i.status === "fired").length;
  const groups = useMemo(() => buildSidebarGroups(terms.Alters, terms.System), [terms.Alters, terms.System]);

  // Close on navigation
  useEffect(() => { onClose(); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    const handler = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-[100] bg-background/60 backdrop-blur-sm sm:hidden transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={cn(
          "fixed top-0 left-0 h-full z-[101] w-72 bg-background border-r border-border/50 flex flex-col transition-transform duration-300 ease-in-out sm:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Safe-area + header */}
        <div style={{ paddingTop: "env(safe-area-inset-top, 0px)" }} className="bg-background/95 backdrop-blur-xl border-b border-border/50 flex-shrink-0">
          <div className="flex items-center justify-between px-4 h-14">
            <span className="font-display text-base font-semibold text-foreground">Navigation</span>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable nav list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {groups.map(({ label, items }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1.5">
                {label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.path === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.path);
                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.id === "reminders" && pendingCount > 0 && (
                        <span className="w-5 h-5 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                          {pendingCount > 9 ? "9+" : pendingCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Shared navigation catalogue — the single source for "every app surface a
// user can jump to", with icons, colours, and term-aware labels.
//
// Extracted from QuickNavMenu.jsx (Phase 2 of the experimental homescreen)
// so the quick-nav grid, the app drawer, and app-shortcut widgets all read
// the same list. QuickNavMenu re-exports these for back-compat.
//
// These are static builders (no hooks) — callers resolve user terms first
// (`useTerms()`) and pass the labels in, same as navigationConfig's
// resolveLabel pattern.

import {
  Users, Clock, BarChart2, Settings, BookOpen, CheckSquare, ClipboardList,
  Sparkles, Activity, Zap, GitBranch, GitMerge, FileText, Heart, Bell, Vote,
  Shield, MapPin, UserRound, Pin, MessageSquare, Images, Contact, CalendarRange } from "lucide-react";

export function buildNavGroups(altersLabel, systemLabel) {
  return {
    [systemLabel]: [
      { id: "alters",   label: altersLabel,            icon: Users,         path: "/Home" },
      { id: "presences",label: "New Presences",        icon: Sparkles,      path: "/presences" },
      { id: "chat",     label: `${systemLabel} Chat`,  icon: MessageSquare, path: "/chat" },
      { id: "friends",  label: "Friends",              icon: UserRound,     path: "/friends" },
      { id: "planner",  label: "Planner",              icon: CalendarRange, path: "/planner" },
      { id: "contacts", label: "Contacts",             icon: Contact,       path: "/contacts" },
      { id: "groups",   label: "Groups",               icon: Users,         path: "/groups" },
      { id: "assets",   label: "Image Assets",         icon: Images,        path: "/assets" },
      { id: "settings", label: "Settings",             icon: Settings,      path: "/settings" },
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

export function buildGridItems(altersLabel, systemLabel) {
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
    { id: "assets",          label: "Image Assets",           icon: Images,        path: "/assets",           color: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400" },
    { id: "safety-plan",     label: "Safety Plan",            icon: Shield,        path: "/safety-plan",      color: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
    { id: "polls",           label: "Polls",                  icon: Vote,          path: "/polls",            color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
    { id: "system-history",  label: `${systemLabel} History`, icon: GitMerge,      path: "/system-history",   color: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400" },
    { id: "location-history",label: "Location History",       icon: MapPin,        path: "/location-history", color: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" },
    { id: "settings",        label: "Settings",               icon: Settings,      path: "/settings",         color: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
    { id: "home",            label: "Home",                   icon: CheckSquare,   path: "/",                 color: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
    { id: "friends",         label: "Friends",                icon: UserRound,     path: "/friends",          color: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
    { id: "planner",         label: "Planner",                icon: CalendarRange, path: "/planner",          color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
    { id: "contacts",        label: "Contacts",               icon: Contact,       path: "/contacts",         color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
    { id: "bulletins",       label: "Bulletin Board",         icon: Pin,           path: "/bulletins",        color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    { id: "unblend",         label: "Help me unblend",        icon: Heart,         path: "/unblend",          color: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400" },
    { id: "get-to-know-me",  label: "Get to know me",         icon: Sparkles,      path: "/get-to-know-me",   color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
    { id: "presences",       label: "New Presences",          icon: Sparkles,      path: "/presences",        color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
    { id: "chat",            label: `${systemLabel} Chat`,    icon: MessageSquare, path: "/chat",             color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  ];
}

// Find one grid item by id (used by app-shortcut widgets).
export function findGridItem(items, targetId) {
  return items.find((i) => i.id === targetId) || null;
}

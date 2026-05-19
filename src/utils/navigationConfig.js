import { Home, Users, Sparkles, BookOpen, CheckSquare, Clock, FileText, GitFork, BarChart2, Zap, Activity, Heart, Users2, Settings, Shield, Vote, Bell, GitMerge, MapPin, ClipboardList, UserRound, Pin } from "lucide-react";

export const ALL_PAGES = [
  { id: "home", label: "Home", path: "/", icon: Home },
  { id: "alters", label: "Alters", path: "/Home", icon: Users },
  { id: "checkin", label: "Meeting", path: "/system-checkin", icon: Sparkles },
  { id: "journals", label: "Journals", path: "/journals", icon: BookOpen },
  { id: "tasks", label: "Tasks", path: "/tasks", icon: CheckSquare },
  { id: "todo", label: "To-Do List", path: "/todo", icon: ClipboardList },
  { id: "timeline", label: "Timeline", path: "/timeline", icon: Clock },
  { id: "therapy-report", label: "Therapy Report", path: "/therapy-report", icon: FileText },
  { id: "system-map", label: "System Map", path: "/system-map", icon: GitFork },
  { id: "analytics", label: "Analytics", path: "/analytics", icon: BarChart2 },
  { id: "activities", label: "Activities", path: "/activities", icon: Zap },
  { id: "sleep", label: "Sleep", path: "/sleep", icon: Activity },
  { id: "support", label: "Support & Learn", path: "/grounding", icon: Heart },
  { id: "safety-plan", label: "Safety Plan", path: "/safety-plan", icon: Shield },
  { id: "groups", label: "Groups", path: "/groups", icon: Users2 },
  { id: "polls", label: "Polls", path: "/polls", icon: Vote },
  { id: "settings", label: "Settings", path: "/settings", icon: Settings },
  { id: "checkin-log", label: "Check-In Log", path: "/checkin-log", icon: Heart },
  { id: "reminders", label: "Reminders", path: "/reminders", icon: Bell },
  { id: "system-history", label: "System History", path: "/system-history", icon: GitMerge },
  { id: "location-history", label: "Location History", path: "/location-history", icon: MapPin },
  { id: "friends", label: "Friends", path: "/friends", icon: UserRound },
  { id: "bulletins", label: "Bulletin Board", path: "/bulletins", icon: Pin },
];

export const DEFAULT_CONFIG = {
  topBar: ["home", "alters", "checkin", "journals", "tasks"],
  bottomBar: ["home", "alters", "checkin", "journals", "tasks"],
  // Dashboard grid default: every page except "home" (since the grid lives
  // on Home itself), ordered by intent rather than alphabetically:
  //   1) Daily capture flow  — alters, meeting, timeline, journals, tasks, to-do, check-in log
  //   2) Tracking            — activities, sleep, location, analytics
  //   3) System internals    — groups, system map, system history, polls
  //   4) Care & support      — support, safety plan, therapy report
  //   5) Sharing & reminders — reminders, friends
  //   6) Settings            — settings
  dashboardGrid: [
    "alters",
    "checkin",
    "timeline",
    "journals",
    "tasks",
    "todo",
    "checkin-log",
    "activities",
    "sleep",
    "location-history",
    "analytics",
    "groups",
    "system-map",
    "system-history",
    "polls",
    "support",
    "safety-plan",
    "therapy-report",
    "reminders",
    "friends",
    "settings",
  ],
  // `bulletins` defaults to removed because the dashboard's own
  // bulletin block (DashboardLayoutSettings → "Bulletin board") is
  // enabled by default, and surfacing the same content via a grid
  // tile would just duplicate it. Users who hide the dashboard
  // bulletin block can re-add the tile from Settings → Appearance →
  // Navigation (or wherever NavigationSettings exposes the removed
  // list).
  dashboardGridRemoved: ["bulletins"], // pages explicitly removed by the user — never auto-re-added
};

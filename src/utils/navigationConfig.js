import { Home, Users, Sparkles, BookOpen, CheckSquare, Clock, FileText, GitFork, BarChart2, Zap, Activity, Heart, Users2, Settings, ClipboardList, Shield } from "lucide-react";

export const ALL_PAGES = [
  { id: 'reminders', label: 'Reminders', path: '/settings#reminders', icon: 'Bell' },
  { id: "home", label: "Home", path: "/", icon: Home },
  { id: "alters", label: "Alters", path: "/Home", icon: Users },
  { id: "checkin", label: "Check-In", path: "/system-checkin", icon: Sparkles },
  { id: "journals", label: "Journals", path: "/journals", icon: BookOpen },
  { id: "tasks", label: "Tasks", path: "/tasks", icon: CheckSquare },
  { id: "timeline", label: "Timeline", path: "/timeline", icon: Clock },
  { id: "therapy-report", label: "Therapy Report", path: "/therapy-report", icon: FileText },
  { id: "system-map", label: "System Map", path: "/system-map", icon: GitFork },
  { id: "analytics", label: "Analytics", path: "/analytics", icon: BarChart2 },
  { id: "activities", label: "Activities", path: "/activities", icon: Zap },
  { id: "sleep", label: "Sleep", path: "/sleep", icon: Activity },
  { id: "support", label: "Support & Learn", path: "/grounding", icon: Heart },
  { id: "safety-plan", label: "Safety Plan", path: "/safety-plan", icon: Shield },
  { id: "groups", label: "Groups", path: "/groups", icon: Users2 },
  { id: "settings", label: "Settings", path: "/settings", icon: Settings },
  { id: "diary-cards", label: "Diary Cards", path: "/diary", icon: ClipboardList },
];

export const DEFAULT_CONFIG = {
  topBar: ["home", "alters", "checkin", "journals", "tasks"],
  bottomBar: ["home", "alters", "checkin", "journals", "tasks"],
  dashboardGrid: [
    "alters",
    "checkin",
    "activities",
    "analytics",
    "therapy-report",
    "support",
    "diary-cards",
    "sleep",
    "timeline",
    "system-map",
    "journals",
    "daily-tasks",
    "co-fronting",
    "groups",
    "settings"
  ],
};
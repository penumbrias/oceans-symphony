import React from "react";
import { Link } from "react-router-dom";
import { CheckSquare, Calendar, Activity, BookOpen, GitBranch, BarChart3, Heart, Moon, Settings, Layers, Vote } from "lucide-react";

const features = [
  {
    name: "Tasks",
    path: "/tasks",
    icon: CheckSquare,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    description: "Manage to-do lists and goals",
  },
  {
    name: "Timeline",
    path: "/timeline",
    icon: Calendar,
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    description: "View chronological history",
  },
  {
    name: "Activities",
    path: "/activities",
    icon: Activity,
    color: "bg-green-500/10 text-green-600 dark:text-green-400",
    description: "Track what you're doing",
  },
  {
    name: "Diary",
    path: "/diary",
    icon: BookOpen,
    color: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    description: "Daily diary cards",
  },
  {
    name: "Journals",
    path: "/journals",
    icon: Layers,
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    description: "Write journal entries",
  },
  {
    name: "Front History",
    path: "/front-history",
    icon: GitBranch,
    color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    description: "Track system switches",
  },
  {
    name: "Analytics",
    path: "/analytics",
    icon: BarChart3,
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    description: "View insights and stats",
  },
  {
    name: "Sleep",
    path: "/sleep",
    icon: Moon,
    color: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    description: "Log sleep data",
  },
  {
    name: "System Check-In",
    path: "/system-checkin",
    icon: Heart,
    color: "bg-red-500/10 text-red-600 dark:text-red-400",
    description: "Daily check-in ritual",
  },
  {
    name: "Polls",
    path: "/polls",
    icon: Vote,
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    description: "Community votes",
  },
  {
    name: "Settings",
    path: "/settings",
    icon: Settings,
    color: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
    description: "Manage preferences",
  },
];

export default function FeatureTiles() {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Features</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {features.map(({ name, path, icon: Icon, color, description }) => (
          <Link key={path} to={path}>
            <div className="h-full bg-card border border-border rounded-lg p-3 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium leading-tight group-hover:text-primary transition-colors">{name}</p>
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
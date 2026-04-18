import { useNavigate } from "react-router-dom";
import {
  Users,
  Sparkles,
  Zap,
  BarChart3,
  Activity,
  Moon,
  FileText,
  Map,
  Heart,
} from "lucide-react";

const GRID_ITEMS = [
  { id: "alters", label: "Alters", icon: Users, path: "/Home" },
  { id: "checkin", label: "Check-In", icon: Sparkles, path: "/system-checkin" },
  { id: "activities", label: "Activities", icon: Activity, path: "/activities" },
  { id: "analytics", label: "Analytics", icon: BarChart3, path: "/analytics" },
  { id: "therapy-report", label: "Therapy Report", icon: FileText, path: "/therapy-report" },
  { id: "support", label: "Support & Learn", icon: Heart, path: "/grounding" },
  { id: "system-map", label: "System Map", icon: Map, path: "/system-map" },
  { id: "sleep", label: "Sleep", icon: Moon, path: "/sleep" },
  { id: "timeline", label: "Timeline", icon: Zap, path: "/timeline" },
];

export default function DashboardGrid({ visibleItems = ["alters", "checkin", "activities", "analytics", "therapy-report", "support"] }) {
  const navigate = useNavigate();

  const filtered = GRID_ITEMS.filter(item => visibleItems.includes(item.id));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 my-6">
      {filtered.map(item => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border/60 hover:border-primary/30 hover:bg-primary/5 transition-all group min-h-[100px] justify-center"
          >
            <Icon className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-xs font-medium text-center text-foreground group-hover:text-primary transition-colors">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
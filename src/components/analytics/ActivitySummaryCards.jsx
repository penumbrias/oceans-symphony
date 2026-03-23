import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { startOfDay, endOfDay, differenceInMinutes } from "date-fns";
import { Activity, Clock, Zap, TrendingUp } from "lucide-react";

export default function ActivitySummaryCards({ activities = [], categories = [], from, to }) {
  const stats = useMemo(() => {
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });
    const fromMs = startOfDay(from).getTime();
    const toMs = endOfDay(to).getTime();
    const filtered = activities.filter(a => {
      const t = new Date(a.timestamp).getTime();
      return t >= fromMs && t <= toMs;
    });

    const totalDuration = filtered.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
    const uniqueCategories = new Set(filtered.flatMap(a => a.activity_category_ids || [])).size;
    const avgDuration = filtered.length > 0 ? totalDuration / filtered.length : 0;

    // Most common activity — each category counted independently
    const countByLabel = {};
    filtered.forEach(act => {
      const ids = act.activity_category_ids || [];
      if (ids.length === 0) {
        const label = act.activity_name || "Unknown";
        countByLabel[label] = (countByLabel[label] || 0) + 1;
      } else {
        ids.forEach(id => {
          const cat = catMap[id];
          if (cat) countByLabel[cat.name] = (countByLabel[cat.name] || 0) + 1;
        });
      }
    });
    const topActivity = Object.entries(countByLabel).sort((a, b) => b[1] - a[1])[0];

    return { count: filtered.length, totalDuration, uniqueCategories, avgDuration, topActivity };
  }, [activities, categories, from, to]);

  const items = [
    { icon: Activity, label: "Total Activities", value: stats.count, color: "text-primary" },
    { icon: Clock, label: "Total Hours", value: stats.totalDuration > 0 ? `${(stats.totalDuration / 60).toFixed(1)}h` : "0h", color: "text-blue-500" },
    { icon: Zap, label: "Unique Types", value: stats.uniqueCategories, color: "text-amber-500" },
    { icon: TrendingUp, label: "Avg Duration", value: stats.avgDuration > 0 ? `${Math.round(stats.avgDuration)}m` : "—", color: "text-emerald-500" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map(({ icon: Icon, label, value, color }) => (
          <Card key={label} className="p-4 flex flex-col gap-1">
            <Icon className={`w-4 h-4 ${color}`} />
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>
      {stats.topActivity && (
        <Card className="p-4 flex items-center gap-3">
          <div className="text-2xl">🏆</div>
          <div>
            <p className="text-xs text-muted-foreground">Most frequent activity</p>
            <p className="font-semibold">{stats.topActivity[0]}</p>
            <p className="text-xs text-muted-foreground">{stats.topActivity[1]} times</p>
          </div>
        </Card>
      )}
    </div>
  );
}
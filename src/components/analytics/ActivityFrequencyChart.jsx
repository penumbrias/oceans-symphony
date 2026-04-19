import React, { useMemo } from "react";
import { startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Card } from "@/components/ui/card";

const COLORS = [
  "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b",
  "#ec4899", "#6366f1", "#14b8a6", "#f97316", "#a855f7"
];

export default function ActivityFrequencyChart({ activities = [], categories = [], from, to }) {
  const activityStats = useMemo(() => {
    const fromMs = startOfDay(from).getTime();
    const toMs = endOfDay(to).getTime();

    const stats = {};
    const categoryMap = {};
    categories.forEach(c => { categoryMap[c.id] = c; });

    activities.forEach(activity => {
      const actTime = new Date(activity.timestamp).getTime();
      if (actTime >= fromMs && actTime <= toMs) {
        // Each category ID on an activity is counted independently
        const catIds = activity.activity_category_ids || [];
        const entries = catIds.length > 0
          ? catIds.map(id => ({ name: categoryMap[id]?.name, color: categoryMap[id]?.color, id }))
          : [{ name: activity.activity_name || "Unnamed", color: "#8b5cf6", id: null }];

        entries.forEach(({ name, color, id }) => {
          if (!name) return;
          if (!stats[name]) stats[name] = { name, count: 0, duration: 0, color: color || "#8b5cf6" };
          stats[name].count += 1;
          stats[name].duration += activity.duration_minutes || 0;
        });
      }
    });

    return Object.values(stats).sort((a, b) => b.count - a.count);
  }, [activities, categories, from, to]);

  if (activityStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-muted-foreground text-sm">No activities recorded in this date range.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Frequency Chart */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">Activity Frequency</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={activityStats} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
            <YAxis
              dataKey="name"
              type="category"
              width={90}
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
              tickFormatter={(v) => v && v.length > 10 ? v.slice(0, 10) + "…" : v}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px"
              }}
              formatter={(value) => [value, "Count"]}
            />
            <Bar dataKey="count" fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Duration Total */}
      {activityStats.some(a => a.duration > 0) && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-4">Total Duration by Activity (hours)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={activityStats} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
              <YAxis
                dataKey="name"
                type="category"
                width={90}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v) => v && v.length > 10 ? v.slice(0, 10) + "…" : v}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px"
                }}
                formatter={(value) => [(value / 60).toFixed(1), "Hours"]}
              />
              <Bar dataKey="duration" fill="hsl(var(--accent))" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Distribution Pie */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">Activity Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={activityStats}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label
            >
              {activityStats.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px"
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {/* Stats table */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Summary</h3>
        <div className="space-y-2">
          {activityStats.map((stat, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
              <div className="flex items-center gap-2 flex-1">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: stat.color || COLORS[idx % COLORS.length] }}
                />
                <span className="font-medium">{stat.name}</span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{stat.count}x</span>
                {stat.duration > 0 && <span>{(stat.duration / 60).toFixed(1)}h</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
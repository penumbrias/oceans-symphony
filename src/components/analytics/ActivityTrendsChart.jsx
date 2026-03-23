import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { startOfDay, endOfDay, eachDayOfInterval, format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function ActivityTrendsChart({ activities = [], categories = [], from, to }) {
  const { chartData, lines } = useMemo(() => {
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    const fromDay = startOfDay(from);
    const toDay = endOfDay(to);
    const filtered = activities.filter(a => {
      const t = new Date(a.timestamp).getTime();
      return t >= fromDay.getTime() && t <= toDay.getTime();
    });

    // Top 5 activities by count — each category counted independently
    const countByLabel = {};
    const colorByLabel = {};
    filtered.forEach(act => {
      const ids = act.activity_category_ids || [];
      if (ids.length === 0) {
        const label = act.activity_name || "Unknown";
        countByLabel[label] = (countByLabel[label] || 0) + 1;
        colorByLabel[label] = "#8b5cf6";
      } else {
        ids.forEach(id => {
          const cat = catMap[id];
          if (!cat) return;
          countByLabel[cat.name] = (countByLabel[cat.name] || 0) + 1;
          colorByLabel[cat.name] = cat.color || "#8b5cf6";
        });
      }
    });

    const topLabels = Object.entries(countByLabel)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label]) => label);

    const days = eachDayOfInterval({ start: fromDay, end: toDay });
    const chartData = days.map(day => {
      const dayStr = format(day, "MMM d");
      const dayMs = day.getTime();
      const dayEndMs = endOfDay(day).getTime();
      const row = { day: dayStr };
      topLabels.forEach(label => { row[label] = 0; });
      filtered.forEach(act => {
        const t = new Date(act.timestamp).getTime();
        if (t >= dayMs && t <= dayEndMs) {
          const ids = act.activity_category_ids || [];
          const labels = ids.length > 0
            ? ids.map(id => catMap[id]?.name).filter(Boolean)
            : [act.activity_name || "Unknown"];
          labels.forEach(label => {
            if (topLabels.includes(label)) row[label] = (row[label] || 0) + 1;
          });
        }
      });
      return row;
    });

    const lines = topLabels.map(label => ({ label, color: colorByLabel[label] }));
    return { chartData, lines };
  }, [activities, categories, from, to]);

  if (lines.length === 0) return null;

  // Downsample if too many days
  const display = chartData.length > 60
    ? chartData.filter((_, i) => i % Math.ceil(chartData.length / 60) === 0)
    : chartData;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-1">Activity Trends Over Time</h3>
      <p className="text-xs text-muted-foreground mb-4">Top 5 activities — daily counts</p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={display}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {lines.map(({ label, color }) => (
            <Line key={label} type="monotone" dataKey={label} stroke={color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
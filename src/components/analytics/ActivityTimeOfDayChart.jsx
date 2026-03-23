import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { startOfDay, endOfDay, getHours } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function ActivityTimeOfDayChart({ activities = [], categories = [], from, to }) {
  const { hourData, topActivityBins } = useMemo(() => {
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    const fromMs = startOfDay(from).getTime();
    const toMs = endOfDay(to).getTime();
    const filtered = activities.filter(a => {
      const t = new Date(a.timestamp).getTime();
      return t >= fromMs && t <= toMs;
    });

    // Hours of day distribution
    const hourCounts = Array(24).fill(0);
    filtered.forEach(act => {
      const h = getHours(new Date(act.timestamp));
      hourCounts[h]++;
    });

    const hourData = HOURS.map(h => ({
      hour: `${String(h).padStart(2, "0")}:00`,
      count: hourCounts[h],
    }));

    const peak = Math.max(...hourCounts);

    return { hourData, peak };
  }, [activities, categories, from, to]);

  const peak = Math.max(...hourData.map(d => d.count));

  if (hourData.every(d => d.count === 0)) return null;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-1">Activities by Time of Day</h3>
      <p className="text-xs text-muted-foreground mb-4">When are activities most commonly logged?</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={hourData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="hour" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" interval={1} />
          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
            formatter={(v) => [v, "Activities"]}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {hourData.map((entry, i) => (
              <Cell
                key={i}
                fill={`hsl(265 60% ${peak > 0 ? Math.round(70 - (entry.count / peak) * 40) : 70}%)`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
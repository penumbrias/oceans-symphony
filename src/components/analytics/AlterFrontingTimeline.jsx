import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { startOfDay, endOfDay, eachDayOfInterval, format, differenceInMinutes } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useTerms } from "@/lib/useTerms";

export default function AlterFrontingTimeline({ sessions = [], alters = [], from, to }) {
  const terms = useTerms();
  const { chartData, topAlters } = useMemo(() => {
    const fromDay = startOfDay(from);
    const toDay = endOfDay(to);

    const filtered = sessions.filter(s => {
      const st = new Date(s.start_time).getTime();
      return st >= fromDay.getTime() && st <= toDay.getTime();
    });

    // Find top 5 alters by total fronting time
    const alterTotals = {};
    filtered.forEach(s => {
      const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
      const start = new Date(s.start_time);
      const end = s.end_time ? new Date(s.end_time) : new Date();
      const mins = Math.max(differenceInMinutes(end, start), 0);
      ids.forEach(id => { alterTotals[id] = (alterTotals[id] || 0) + mins; });
    });

    const topAlterIds = Object.entries(alterTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const topAlters = topAlterIds.map(id => alters.find(a => a.id === id)).filter(Boolean);

    const days = eachDayOfInterval({ start: fromDay, end: toDay });
    const chartData = days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      const row = { day: format(day, "MMM d") };
      topAlters.forEach(alter => { row[alter.alias || alter.name] = 0; });

      filtered.forEach(s => {
        const sStart = new Date(s.start_time);
        const sEnd = s.end_time ? new Date(s.end_time) : new Date();
        if (sStart > dayEnd || sEnd < dayStart) return;
        const clampedStart = sStart < dayStart ? dayStart : sStart;
        const clampedEnd = sEnd > dayEnd ? dayEnd : sEnd;
        const mins = Math.max(differenceInMinutes(clampedEnd, clampedStart), 0);
        const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
        ids.forEach(id => {
          const alter = topAlters.find(a => a.id === id);
          if (alter) row[alter.alias || alter.name] = ((row[alter.alias || alter.name] || 0) + mins / 60);
        });
      });

      // Round
      topAlters.forEach(alter => {
        row[alter.alias || alter.name] = parseFloat((row[alter.alias || alter.name] || 0).toFixed(2));
      });

      return row;
    });

    // Downsample if too many days
    const display = chartData.length > 60
      ? chartData.filter((_, i) => i % Math.ceil(chartData.length / 60) === 0)
      : chartData;

    return { chartData: display, topAlters };
  }, [sessions, alters, from, to]);

  if (topAlters.length === 0) return null;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-1">Top 5 {terms.Alters} — {terms.Fronting} Hours Per Day</h3>
      <p className="text-xs text-muted-foreground mb-4">Stacked daily hours for the most active {terms.alters}</p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" unit="h" />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
            formatter={(v) => [`${v}h`]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {topAlters.map(alter => (
            <Bar key={alter.id} dataKey={alter.alias || alter.name} stackId="a" fill={alter.color || "#8b5cf6"} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
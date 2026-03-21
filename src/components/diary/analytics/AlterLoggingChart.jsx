import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

const COLORS = ["#7c3aed", "#db2777", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#6366f1"];

export default function AlterLoggingChart({ filteredCards, altersById }) {
  // Count diary entries per alter
  const counts = {};
  filteredCards.forEach((c) => {
    (c.fronting_alter_ids || []).forEach((id) => {
      const name = altersById[id]?.name || `Unknown (${id.slice(0, 6)})`;
      counts[name] = (counts[name] || 0) + 1;
    });
  });

  const data = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Mood averages per alter
  const moodSums = {};
  const moodCounts = {};
  filteredCards.forEach((c) => {
    const mood = c.checklist?.symptoms?.overall_mood;
    if (mood === undefined) return;
    (c.fronting_alter_ids || []).forEach((id) => {
      const name = altersById[id]?.name || `Unknown`;
      moodSums[name] = (moodSums[name] || 0) + mood;
      moodCounts[name] = (moodCounts[name] || 0) + 1;
    });
  });

  const moodData = Object.entries(moodSums)
    .map(([name, sum]) => ({ name, avgMood: +(sum / moodCounts[name]).toFixed(2), entries: moodCounts[name] }))
    .sort((a, b) => b.avgMood - a.avgMood);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No alter data yet — make sure to select fronting alters when creating diary cards.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border/50 rounded-xl p-4">
        <p className="text-sm font-medium mb-4">Diary entries per alter</p>
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="count" name="Entries" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {moodData.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <p className="text-sm font-medium mb-4">Average mood when each alter fronts</p>
          <ResponsiveContainer width="100%" height={Math.max(180, moodData.length * 36)}>
            <BarChart data={moodData} layout="vertical" margin={{ left: 4, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v, _, props) => [`${v} / 5 (${props.payload.entries} entries)`, "Avg mood"]}
              />
              <Bar dataKey="avgMood" name="Avg mood" radius={[0, 4, 4, 0]}>
                {moodData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
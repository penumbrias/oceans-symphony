import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

const COLORS = ["#7c3aed", "#db2777", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#6366f1"];

export default function AlterLoggingChart({ filteredCards, altersById, alterTendencies = [] }) {
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

  // Emotional misery tendencies per alter (how each alter tends to rate it)
  const emotionalMiseryData = alterTendencies
    .map((tendency) => {
      const name = altersById[tendency.alterId]?.name || `Unknown`;
      return {
        name,
        avg_emotional_misery: tendency.avg_emotional_misery ?? 0,
        avg_joy: tendency.avg_joy ?? 0,
        entries: tendency.entryCount,
      };
    })
    .filter((d) => d.avg_emotional_misery !== undefined)
    .sort((a, b) => b.avg_emotional_misery - a.avg_emotional_misery);

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

      {emotionalMiseryData.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <p className="text-sm font-medium mb-4">Emotional misery tendencies per alter</p>
          <p className="text-xs text-muted-foreground mb-3">How each alter tends to rate emotional misery (lower is better)</p>
          <ResponsiveContainer width="100%" height={Math.max(180, emotionalMiseryData.length * 36)}>
            <BarChart data={emotionalMiseryData} layout="vertical" margin={{ left: 4, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v, _, props) => [`${v.toFixed(1)} / 10 (${props.payload.entries} entries)`, "Avg rating"]}
              />
              <Bar dataKey="avg_emotional_misery" name="Emotional misery" radius={[0, 4, 4, 0]}>
                {emotionalMiseryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
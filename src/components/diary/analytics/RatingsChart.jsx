import React, { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { SYMPTOMS } from "../SymptomsChecklistPanel";

const RATING_SYMPTOMS = SYMPTOMS.filter((s) => s.type === "rating");
const COLORS = ["#7c3aed", "#db2777", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#6366f1", "#a78bfa", "#f97316"];

// Extra fields beyond checklist symptoms
const EXTRA = [
  { id: "emotional_misery", label: "Emotional Misery" },
  { id: "joy", label: "Joy" },
  { id: "self_harm_urge", label: "Self-Harm Urge" },
];

const ALL_LINES = [...RATING_SYMPTOMS, ...EXTRA];

export default function RatingsChart({ ratingData }) {
  const [selected, setSelected] = useState(
    new Set(["overall_mood", "anxiety", "depression", "energy_levels"])
  );

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Only show lines that have any data
  const available = ALL_LINES.filter((l) =>
    ratingData.some((row) => row[l.id] !== undefined)
  );

  if (ratingData.length < 2) {
    return <p className="text-sm text-muted-foreground text-center py-8">Need at least 2 entries to show trends.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Toggle pills */}
      <div className="flex flex-wrap gap-1.5">
        {available.map((l, i) => (
          <button
            key={l.id}
            onClick={() => toggle(l.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              selected.has(l.id)
                ? "text-white border-transparent"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
            style={selected.has(l.id) ? { background: COLORS[i % COLORS.length] } : {}}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-4">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={ratingData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            />
            {available.map((l, i) =>
              selected.has(l.id) ? (
                <Line
                  key={l.id}
                  type="monotone"
                  dataKey={l.id}
                  name={l.label}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ) : null
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
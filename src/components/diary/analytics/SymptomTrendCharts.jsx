import React, { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format, parseISO } from "date-fns";

const COLORS = {
  overall_mood: "#8b5cf6",
  energy_levels: "#fbbf24",
  anxiety: "#ef4444",
  depression: "#0ea5e9",
  feeling_overwhelmed: "#f97316",
  feeling_manic: "#ec4899",
  trouble_sleeping: "#6366f1",
  feeling_irritable: "#d946ef",
  emotional_numbness: "#06b6d4",
  random_switch: "#10b981",
  triggered_switch: "#84cc16",
  amnesia_memory: "#f59e0b",
  lack_of_motivation: "#64748b",
};

const NUMERIC_SYMPTOMS = [
  "overall_mood",
  "energy_levels",
  "anxiety",
  "depression",
  "feeling_overwhelmed",
  "feeling_manic",
  "trouble_sleeping",
  "feeling_irritable",
  "emotional_numbness",
  "lack_of_motivation",
];

export default function SymptomTrendCharts({ dailyAggregates }) {
  const [selected, setSelected] = useState(
    new Set(["overall_mood", "anxiety", "energy_levels", "depression"])
  );

  const chartData = useMemo(() => {
    return dailyAggregates.map((day) => ({
      date: format(parseISO(day.date), "MMM d"),
      ...Object.fromEntries(
        NUMERIC_SYMPTOMS.map((s) => [
          s,
          day.checklist?.symptoms?.[s] !== undefined ? day.checklist.symptoms[s] : null,
        ])
      ),
    }));
  }, [dailyAggregates]);

  const availableSymptoms = NUMERIC_SYMPTOMS.filter((s) =>
    chartData.some((d) => d[s] !== null && d[s] !== undefined)
  );

  const toggle = (symptom) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(symptom) ? next.delete(symptom) : next.add(symptom);
      return next;
    });
  };

  const formatLabel = (key) => {
    return key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  if (chartData.length < 2) {
    return <p className="text-sm text-muted-foreground text-center py-6">Need at least 2 entries to show trends.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {availableSymptoms.map((s) => (
          <button
            key={s}
            onClick={() => toggle(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              selected.has(s) ? "border-transparent text-white" : "border-border text-muted-foreground hover:border-primary/40"
            }`}
            style={selected.has(s) ? { backgroundColor: COLORS[s] || "#888" } : {}}
          >
            {formatLabel(s)}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-4">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(value) => (value !== null ? value.toFixed(1) : "—")}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {availableSymptoms.map((s) =>
              selected.has(s) ? (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  name={formatLabel(s)}
                  stroke={COLORS[s] || "#888"}
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
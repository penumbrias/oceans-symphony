import React, { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ComposedChart, Bar } from "recharts";
import { format, parseISO } from "date-fns";

const COLORS = {
  avg_emotional_misery: "#ef4444",
  avg_joy: "#10b981",
  avg_physical_misery: "#f59e0b",
  avg_urge_self_harm: "#db2777",
  total_skills: "#8b5cf6",
};

export default function MetricFluctuationsChart({ dailyAggregates, metrics = ["avg_emotional_misery", "avg_joy"] }) {
  const [selected, setSelected] = useState(new Set(metrics));

  // Transform data for chart
  const chartData = dailyAggregates.map((day) => ({
    date: format(parseISO(day.date), "MMM d"),
    ...Object.fromEntries(metrics.map((m) => [m, day[m]])),
  }));

  const toggle = (metric) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(metric) ? next.delete(metric) : next.add(metric);
      return next;
    });
  };

  if (chartData.length < 2) {
    return <p className="text-sm text-muted-foreground text-center py-6">Need at least 2 days to show trends.</p>;
  }

  const availableMetrics = metrics.filter((m) =>
    chartData.some((d) => d[m] !== undefined && d[m] !== null)
  );

  const metricLabels = {
    avg_emotional_misery: "Emotional Misery",
    avg_joy: "Joy",
    avg_physical_misery: "Physical Misery",
    avg_urge_self_harm: "Self-Harm Urge",
    total_skills: "Skills Practiced",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {availableMetrics.map((m) => (
          <button
            key={m}
            onClick={() => toggle(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              selected.has(m) ? "border-transparent text-white" : "border-border text-muted-foreground hover:border-primary/40"
            }`}
            style={selected.has(m) ? { backgroundColor: COLORS[m] } : {}}
          >
            {metricLabels[m] || m}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(value) => (value !== undefined ? value.toFixed(1) : "—")}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {availableMetrics.map((m) =>
              selected.has(m) ? (
                <Line
                  key={m}
                  type="monotone"
                  dataKey={m}
                  name={metricLabels[m] || m}
                  stroke={COLORS[m]}
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
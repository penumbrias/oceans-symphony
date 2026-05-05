import React, { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { computeMonthlyTrend } from "@/lib/analyticsEngine";

export default function LongTermSymptomTrend({ symptomCheckIns, symptoms, baseline }) {
  const [selected, setSelected] = useState(null);

  const ratingSymptoms = useMemo(
    () => symptoms.filter(s => s.type === "rating" && !s.is_archived).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    [symptoms]
  );

  const monthlyData = useMemo(
    () => computeMonthlyTrend(symptomCheckIns, symptoms),
    [symptomCheckIns, symptoms]
  );

  const defaultSelected = useMemo(
    () => new Set(ratingSymptoms.slice(0, 4).map(s => s.id)),
    [ratingSymptoms]
  );
  const effectiveSelected = selected || defaultSelected;

  const toggle = (id) => {
    setSelected(prev => {
      const current = prev || defaultSelected;
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Only show symptoms that have data
  const symptomsWithData = useMemo(
    () => ratingSymptoms.filter(s => monthlyData.some(row => row[s.id] !== undefined)),
    [ratingSymptoms, monthlyData]
  );

  if (monthlyData.length < 2) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">Need at least 2 months of data to show long-term trends.</p>
        <p className="text-xs text-muted-foreground mt-1">Keep logging symptoms via Quick Check-In.</p>
      </div>
    );
  }

  if (!symptomsWithData.length) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">No symptom trend data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Monthly averages going back across all recorded history. This is where long-term progress (or patterns) become visible even when day-to-day variation makes it hard to see.
      </p>

      {/* Symptom selector */}
      <div className="flex flex-wrap gap-2">
        {symptomsWithData.map(s => (
          <button
            key={s.id}
            onClick={() => toggle(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              effectiveSelected.has(s.id)
                ? "border-transparent text-white"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
            style={effectiveSelected.has(s.id) ? { backgroundColor: s.color || "#8b5cf6" } : {}}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v) => v !== null && v !== undefined ? Number(v).toFixed(1) : "—"}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {symptomsWithData.map(s =>
              effectiveSelected.has(s.id) ? (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.id}
                  name={s.label}
                  stroke={s.color || "#8b5cf6"}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                />
              ) : null
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary: direction of change for each symptom */}
      {monthlyData.length >= 3 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Direction of change</h3>
          <div className="grid grid-cols-2 gap-2">
            {symptomsWithData.map(s => {
              const dataPoints = monthlyData.map(row => row[s.id]).filter(v => v !== undefined);
              if (dataPoints.length < 2) return null;
              const first3Avg = dataPoints.slice(0, Math.ceil(dataPoints.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(dataPoints.length / 2);
              const last3Avg = dataPoints.slice(-Math.ceil(dataPoints.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(dataPoints.length / 2);
              const delta = last3Avg - first3Avg;
              const isPositive = s.is_positive;
              const improving = isPositive ? delta > 0.1 : delta < -0.1;
              const worsening = isPositive ? delta < -0.1 : delta > 0.1;
              return (
                <div key={s.id} className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-2">
                  {s.color && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />}
                  <span className="text-xs font-medium flex-1 truncate">{s.label}</span>
                  <span className={`text-xs font-semibold ${improving ? "text-green-500" : worsening ? "text-orange-500" : "text-muted-foreground"}`}>
                    {improving ? "↓ Improving" : worsening ? "↑ Rising" : "→ Stable"}
                  </span>
                </div>
              );
            }).filter(Boolean)}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Monthly averages across {monthlyData.length} months of data. Short-term variation evens out, revealing longer-term direction.
      </p>
    </div>
  );
}

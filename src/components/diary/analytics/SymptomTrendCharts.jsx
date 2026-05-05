import React, { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Legacy hardcoded keys kept for backwards-compat with any old DiaryCard.checklist data
const LEGACY_COLORS = {
  overall_mood: "#8b5cf6",
  energy_levels: "#fbbf24",
  anxiety: "#ef4444",
  depression: "#0ea5e9",
  feeling_overwhelmed: "#f97316",
  feeling_manic: "#ec4899",
  trouble_sleeping: "#6366f1",
  feeling_irritable: "#d946ef",
  emotional_numbness: "#06b6d4",
  lack_of_motivation: "#64748b",
};

export default function SymptomTrendCharts({ dailyAggregates }) {
  const [selected, setSelected] = useState(null); // null = use defaults (first 4)

  const { data: allSymptomCheckIns = [] } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => base44.entities.SymptomCheckIn.list(),
  });

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const symptomMap = useMemo(() =>
    Object.fromEntries(symptoms.map((s) => [s.id, s])),
    [symptoms]
  );

  const dateSet = useMemo(() => new Set(dailyAggregates.map((d) => d.date)), [dailyAggregates]);

  // Group rating-type SymptomCheckIns by date → symptomId → averaged value
  const ciByDate = useMemo(() => {
    const map = {};
    const counts = {};
    allSymptomCheckIns.forEach((sc) => {
      if (!sc.timestamp || !sc.symptom_id) return;
      const dateStr = sc.timestamp.substring(0, 10);
      if (!dateSet.has(dateStr)) return;
      const sym = symptomMap[sc.symptom_id];
      if (sym?.type !== "rating") return;
      if (sc.severity === null || sc.severity === undefined) return;
      const val = Number(sc.severity);
      if (!map[dateStr]) { map[dateStr] = {}; counts[dateStr] = {}; }
      if (map[dateStr][sc.symptom_id] === undefined) {
        map[dateStr][sc.symptom_id] = val;
        counts[dateStr][sc.symptom_id] = 1;
      } else {
        counts[dateStr][sc.symptom_id]++;
        map[dateStr][sc.symptom_id] = Math.round(
          (map[dateStr][sc.symptom_id] * (counts[dateStr][sc.symptom_id] - 1) + val) /
            counts[dateStr][sc.symptom_id] * 10
        ) / 10;
      }
    });
    return map;
  }, [allSymptomCheckIns, symptomMap, dateSet]);

  const ratingSymptoms = useMemo(() =>
    symptoms.filter((s) => s.type === "rating" && !s.is_archived).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    [symptoms]
  );

  // Build chart data merging new (entity-based) and legacy (DiaryCard.checklist) sources
  const chartData = useMemo(() => {
    return dailyAggregates.map((day) => {
      const row = { date: format(parseISO(day.date), "MMM d") };
      ratingSymptoms.forEach((s) => {
        const v = ciByDate[day.date]?.[s.id];
        if (v !== undefined) row[s.id] = v;
      });
      Object.keys(LEGACY_COLORS).forEach((key) => {
        const v = day.checklist?.symptoms?.[key];
        if (v !== undefined) row[key] = v;
      });
      return row;
    });
  }, [dailyAggregates, ciByDate, ratingSymptoms]);

  // All metrics that have at least one data point
  const allMetrics = useMemo(() => {
    const metrics = [];
    ratingSymptoms.forEach((s) => {
      if (chartData.some((d) => d[s.id] !== undefined)) {
        metrics.push({ id: s.id, label: s.label, color: s.color || "#8b5cf6" });
      }
    });
    // Legacy fallback (only if a key has data AND isn't already covered by a new-system symptom)
    const newIds = new Set(metrics.map((m) => m.id));
    Object.entries(LEGACY_COLORS).forEach(([key, color]) => {
      if (!newIds.has(key) && chartData.some((d) => d[key] !== undefined)) {
        const label = key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        metrics.push({ id: key, label, color });
      }
    });
    return metrics;
  }, [chartData, ratingSymptoms]);

  const defaultSelected = useMemo(() =>
    new Set(allMetrics.slice(0, 4).map((m) => m.id)),
    [allMetrics]
  );

  const effectiveSelected = selected || defaultSelected;

  const toggle = (id) => {
    setSelected((prev) => {
      const current = prev || defaultSelected;
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (chartData.length < 2) {
    return <p className="text-sm text-muted-foreground text-center py-6">Need at least 2 entries to show trends.</p>;
  }

  if (allMetrics.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No symptom trend data for this period. Log symptoms via Quick Check-In to see trends here.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {allMetrics.map((m) => (
          <button
            key={m.id}
            onClick={() => toggle(m.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              effectiveSelected.has(m.id)
                ? "border-transparent text-white"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
            style={effectiveSelected.has(m.id) ? { backgroundColor: m.color } : {}}
          >
            {m.label}
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
              formatter={(value) => (value !== null && value !== undefined ? Number(value).toFixed(1) : "—")}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {allMetrics.map((m) =>
              effectiveSelected.has(m.id) ? (
                <Line
                  key={m.id}
                  type="monotone"
                  dataKey={m.id}
                  name={m.label}
                  stroke={m.color}
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

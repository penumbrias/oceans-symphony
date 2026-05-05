import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from "recharts";
import { computePreSwitchSignature } from "@/lib/analyticsEngine";

export default function PreSwitchSignature({ frontingSessions, symptomCheckIns, symptoms, baseline }) {
  const signature = useMemo(
    () => computePreSwitchSignature(frontingSessions, symptomCheckIns, baseline),
    [frontingSessions, symptomCheckIns, baseline]
  );

  const ratingSymptoms = useMemo(
    () => symptoms.filter(s => s.type === "rating" && !s.is_archived).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    [symptoms]
  );

  const triggeredCount = frontingSessions.filter(s => s.is_triggered_switch).length;

  const chartData = useMemo(() => {
    return ratingSymptoms
      .filter(s => signature[s.id] !== undefined)
      .map(s => ({
        id: s.id,
        name: s.label,
        color: s.color || "#8b5cf6",
        preMean: signature[s.id].preMean,
        baseline: signature[s.id].baselineMean,
        elevation: signature[s.id].elevation ?? 0,
      }))
      .sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0));
  }, [signature, ratingSymptoms]);

  if (!triggeredCount) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">No triggered switches recorded yet.</p>
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">No symptom check-ins found in the 24 hours before switches.</p>
        <p className="text-xs text-muted-foreground mt-1">Log symptoms regularly via Quick Check-In to see your pre-switch pattern.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Average symptom levels in the 24 hours before a triggered switch, compared to your personal baseline.
        This reveals your warning sign pattern — the symptoms that tend to be elevated before a switch happens.
      </p>

      <div className="bg-card border border-border/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-1">Symptom elevation before triggered switches</h3>
        <p className="text-xs text-muted-foreground mb-4">Bars show deviation from baseline (0 = at baseline)</p>
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 40 }}>
            <XAxis
              type="number"
              domain={["auto", "auto"]}
              tick={{ fontSize: 10 }}
              tickFormatter={v => v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)}
            />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={110} />
            <Tooltip
              formatter={(val) => [
                `${val > 0 ? "+" : ""}${val.toFixed(2)} from baseline`,
                "Elevation"
              ]}
            />
            <ReferenceLine x={0} stroke="hsl(var(--border))" strokeWidth={2} />
            <Bar dataKey="elevation" radius={[0, 4, 4, 0]}>
              {chartData.map(entry => (
                <Cell
                  key={entry.id}
                  fill={
                    entry.elevation >= 1.0 ? "#ef4444" :
                    entry.elevation >= 0.5 ? "#f97316" :
                    entry.elevation >= 0.1 ? "#facc15" :
                    entry.elevation <= -0.5 ? "#22c55e" :
                    entry.elevation <= -0.1 ? "#86efac" :
                    "hsl(var(--muted))"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Ranked warning signs */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Your warning sign ranking</h3>
        {chartData
          .filter(d => d.elevation > 0.1)
          .map((d, i) => (
            <div key={d.id} className="flex items-center gap-3">
              <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
              <div className="flex-1 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-sm font-medium">{d.name}</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-orange-500">+{d.elevation.toFixed(2)}</span>
                <span className="text-xs text-muted-foreground ml-1">above avg</span>
              </div>
            </div>
          ))}
        {chartData.every(d => d.elevation <= 0.1) && (
          <p className="text-xs text-muted-foreground">No symptoms show consistent elevation before switches yet. More data will reveal patterns over time.</p>
        )}
      </div>

      <div className="bg-muted/20 rounded-lg p-3 text-xs text-muted-foreground">
        Based on {triggeredCount} triggered switch{triggeredCount !== 1 ? "es" : ""} and symptom check-ins
        logged within 24 hours before them.
      </div>
    </div>
  );
}

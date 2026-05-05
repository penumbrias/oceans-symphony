import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { computeRecoveryTime } from "@/lib/analyticsEngine";

const TRIGGER_LABELS = {
  sensory: "👂 Sensory", emotional: "💙 Emotional", interpersonal: "👥 Interpersonal",
  trauma_reminder: "⚡ Trauma reminder", physical: "🫀 Physical",
  internal: "🧠 Internal", unknown: "❓ Unknown",
};

const COLORS = ["#8b5cf6", "#f43f5e", "#f97316", "#3b82f6", "#14b8a6", "#a855f7", "#64748b"];

export default function RecoveryTime({ frontingSessions, symptomCheckIns, baseline }) {
  const { averageHours, byCategory } = useMemo(
    () => computeRecoveryTime(frontingSessions, symptomCheckIns, baseline),
    [frontingSessions, symptomCheckIns, baseline]
  );

  const categoryData = useMemo(() => {
    return Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, hours], i) => ({
        cat,
        label: TRIGGER_LABELS[cat] || cat,
        hours,
        color: COLORS[i % COLORS.length],
      }));
  }, [byCategory]);

  if (averageHours === null && !categoryData.length) {
    return (
      <div className="py-10 text-center space-y-1">
        <p className="text-sm text-muted-foreground">Not enough data yet to estimate recovery time.</p>
        <p className="text-xs text-muted-foreground">
          This analysis needs triggered switches plus symptom check-ins logged in the hours after them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        How long it typically takes for symptoms to return within your personal baseline range after a triggered switch.
        Shorter times indicate better resilience or more effective coping.
      </p>

      {/* Overall average */}
      {averageHours !== null && (
        <div className="bg-card border border-border/50 rounded-xl p-4 flex items-center gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Average recovery time</p>
            <p className="text-3xl font-bold text-foreground">{averageHours}h</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {averageHours < 4 ? "Quick recovery" :
               averageHours < 12 ? "Moderate recovery" :
               averageHours < 24 ? "Slower recovery" : "Extended recovery period"}
            </p>
          </div>
          <div className="flex-1">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/60 transition-all"
                style={{ width: `${Math.min(100, (averageHours / 48) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0h</span>
              <span>24h</span>
              <span>48h</span>
            </div>
          </div>
        </div>
      )}

      {/* By trigger category */}
      {categoryData.length > 1 && (
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Recovery time by trigger type</h3>
          <ResponsiveContainer width="100%" height={Math.max(150, categoryData.length * 45)}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 40 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} unit="h" />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={130} />
              <Tooltip formatter={(v) => [`${v}h`, "Avg recovery"]} />
              <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                {categoryData.map(entry => (
                  <Cell key={entry.cat} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            Different trigger types may take different amounts of time to recover from.
            A shorter bar means symptoms returned to baseline faster after that type of trigger.
          </p>
        </div>
      )}

      {categoryData.length === 1 && (
        <div className="bg-card border border-border/50 rounded-xl p-3 flex items-center gap-3">
          <span className="text-lg">{categoryData[0].label.split(" ")[0]}</span>
          <div>
            <p className="text-sm font-medium">{categoryData[0].label}</p>
            <p className="text-xs text-muted-foreground">{categoryData[0].hours}h average recovery</p>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Recovery is defined as all tracked symptoms returning within one standard deviation of your personal baseline.
        Based on all triggered switches with follow-up symptom data.
      </p>
    </div>
  );
}

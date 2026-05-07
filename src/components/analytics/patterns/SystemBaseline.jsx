import React, { useMemo } from "react";
import { startOfDay, endOfDay } from "date-fns";
import { computeBaselineDeviation } from "@/lib/analyticsEngine";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function zScoreLabel(z) {
  if (z > 1.5)  return { label: "Significantly elevated", icon: TrendingUp,   color: "text-red-500" };
  if (z > 0.5)  return { label: "Somewhat elevated",      icon: TrendingUp,   color: "text-orange-400" };
  if (z < -1.5) return { label: "Significantly lower",    icon: TrendingDown, color: "text-green-500" };
  if (z < -0.5) return { label: "Somewhat lower",         icon: TrendingDown, color: "text-sky-400" };
  return          { label: "Near baseline",               icon: Minus,        color: "text-muted-foreground" };
}

export default function SystemBaseline({ symptomCheckIns, symptoms, baseline, from, to }) {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();

  const deviation = useMemo(
    () => computeBaselineDeviation(symptomCheckIns, baseline, fromMs, toMs),
    [symptomCheckIns, baseline, fromMs, toMs]
  );

  const ratingSymptoms = useMemo(
    () => symptoms.filter(s => s.type === "rating" && !s.is_archived).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    [symptoms]
  );

  const baselineSymptoms = Object.keys(baseline);
  if (!baselineSymptoms.length) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">No baseline data yet — keep logging symptoms via Quick Check-In.</p>
      </div>
    );
  }

  const symptomsWithDeviation = ratingSymptoms.filter(s => deviation[s.id]);
  const symptomsWithBaseline = ratingSymptoms.filter(s => baseline[s.id]);

  // Overall system state: average z-score across all symptoms
  const zScores = symptomsWithDeviation.map(s => deviation[s.id].zScore);
  const avgZ = zScores.length ? zScores.reduce((a, b) => a + b, 0) / zScores.length : null;

  const stateLabel = avgZ === null ? null : zScoreLabel(avgZ);
  const StateIcon = stateLabel?.icon;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        How the selected date range compares to your personal baseline (your typical levels across all recorded history).
      </p>

      {/* System-level state */}
      {stateLabel && (
        <div className={`flex items-center gap-3 bg-card border border-border/50 rounded-xl p-4`}>
          <StateIcon className={`w-5 h-5 flex-shrink-0 ${stateLabel.color}`} />
          <div>
            <p className="text-sm font-semibold text-foreground">Overall system state this period</p>
            <p className={`text-sm ${stateLabel.color}`}>{stateLabel.label}</p>
          </div>
          {avgZ !== null && (
            <span className="ml-auto text-xs font-mono text-muted-foreground">
              z = {avgZ > 0 ? "+" : ""}{avgZ.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Per-symptom detail */}
      <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">Symptom-by-symptom comparison</h3>
        {symptomsWithBaseline.map(s => {
          const b = baseline[s.id];
          const d = deviation[s.id];
          const hasCurrent = !!d;
          const { label: sLabel, icon: SIcon, color: sColor } = hasCurrent ? zScoreLabel(d.zScore) : { label: "No data this period", icon: Minus, color: "text-muted-foreground" };

          const baselinePct = Math.min(100, Math.round((b.mean / 5) * 100));
          const currentPct = hasCurrent ? Math.min(100, Math.round((d.currentMean / 5) * 100)) : null;

          return (
            <div key={s.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {s.color && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />}
                  <span className="text-sm font-medium">{s.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasCurrent && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        {d.currentMean.toFixed(1)} vs {b.mean.toFixed(1)} avg
                      </span>
                      <SIcon className={`w-3.5 h-3.5 ${sColor}`} />
                    </>
                  )}
                  {!hasCurrent && <span className="text-xs text-muted-foreground">No data this period</span>}
                </div>
              </div>

              {/* Bar: baseline in muted, current overlaid */}
              <div className="relative h-2 bg-muted/40 rounded-full overflow-hidden">
                {/* Baseline bar (faded) */}
                <div
                  className="absolute h-full rounded-full opacity-30"
                  style={{ width: `${baselinePct}%`, backgroundColor: s.color || "hsl(var(--primary))" }}
                />
                {/* Current bar */}
                {hasCurrent && currentPct !== null && (
                  <div
                    className="absolute h-full rounded-full"
                    style={{ width: `${currentPct}%`, backgroundColor: s.color || "hsl(var(--primary))", opacity: 0.8 }}
                  />
                )}
              </div>

              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>0</span>
                <span className="text-xs" style={{ color: s.color ? s.color + "99" : undefined }}>
                  baseline {b.mean.toFixed(1)}
                  {b.stdDev > 0 && ` ± ${b.stdDev.toFixed(1)}`}
                </span>
                <span>5</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Baseline computed from {Math.max(...baselineSymptoms.map(id => baseline[id]?.n || 0))} check-ins.
        Brighter bars = current period; faded = personal average.
      </p>
    </div>
  );
}

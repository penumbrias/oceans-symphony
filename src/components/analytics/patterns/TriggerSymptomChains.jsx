import React, { useMemo } from "react";
import { computeTriggerSymptomChains } from "@/lib/analyticsEngine";

const TRIGGER_LABELS = {
  sensory:         "👂 Sensory",
  emotional:       "💙 Emotional",
  interpersonal:   "👥 Interpersonal",
  trauma_reminder: "⚡ Trauma reminder",
  physical:        "🫀 Physical",
  internal:        "🧠 Internal",
  unknown:         "❓ Unknown",
};

function deltaColor(delta) {
  if (delta === null) return "bg-muted/30 text-muted-foreground";
  if (delta >= 1.0)  return "bg-red-500/80 text-white";
  if (delta >= 0.5)  return "bg-orange-400/80 text-white";
  if (delta >= 0.2)  return "bg-yellow-400/70 text-foreground";
  if (delta <= -0.5) return "bg-green-500/70 text-white";
  if (delta <= -0.2) return "bg-green-400/50 text-foreground";
  return "bg-muted/30 text-muted-foreground";
}

export default function TriggerSymptomChains({ frontingSessions, symptomCheckIns, symptoms, baseline }) {
  const chains = useMemo(
    () => computeTriggerSymptomChains(frontingSessions, symptomCheckIns, baseline),
    [frontingSessions, symptomCheckIns, baseline]
  );

  const ratingSymptoms = useMemo(
    () => symptoms.filter(s => s.type === "rating" && !s.is_archived).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    [symptoms]
  );

  const categories = Object.keys(chains).sort();

  if (!categories.length) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">No triggered switches with categories recorded yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Mark triggered switches in Quick Check-In to see this analysis.</p>
      </div>
    );
  }

  // Only show symptoms that appear in at least one chain
  const relevantSymptoms = ratingSymptoms.filter(s =>
    categories.some(cat => chains[cat][s.id] !== undefined)
  );

  if (!relevantSymptoms.length) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">No symptom check-ins found near triggered switches.</p>
        <p className="text-xs text-muted-foreground mt-1">Log symptoms via Quick Check-In close to when switches happen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Average symptom levels in the 24 hours following a triggered switch, compared to your personal baseline.
          Cells show the difference: <span className="text-red-500 font-medium">red = elevated</span>,{" "}
          <span className="text-green-600 font-medium">green = lower than usual</span>.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[400px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card text-left px-3 py-2 font-semibold text-foreground border-b border-border/50 z-10">
                Trigger type
              </th>
              {relevantSymptoms.map(s => (
                <th key={s.id} className="px-2 py-2 font-medium text-muted-foreground border-b border-border/50 text-center min-w-[70px]">
                  <div className="flex flex-col items-center gap-0.5">
                    {s.color && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />}
                    <span>{s.label}</span>
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 font-medium text-muted-foreground border-b border-border/50 text-center">Events</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, idx) => {
              const catData = chains[cat];
              const eventCount = frontingSessions.filter(
                s => s.is_triggered_switch && s.trigger_category === cat
              ).length;
              return (
                <tr key={cat} className={idx % 2 === 0 ? "bg-card/50" : "bg-muted/20"}>
                  <td className="sticky left-0 bg-inherit px-3 py-2 font-medium text-foreground border-b border-border/50 z-10 whitespace-nowrap">
                    {TRIGGER_LABELS[cat] || cat}
                  </td>
                  {relevantSymptoms.map(s => {
                    const d = catData[s.id];
                    const delta = d?.delta ?? null;
                    return (
                      <td key={s.id} className="px-2 py-2 text-center border-b border-border/50">
                        {d ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${deltaColor(delta)}`}>
                            {delta !== null ? (delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)) : "—"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center border-b border-border/50 text-muted-foreground font-medium">
                    {eventCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-muted/20 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
        <p>Numbers show how much higher (+) or lower (−) symptom levels are after that trigger type compared to your personal average.</p>
        <p>Based on all {frontingSessions.filter(s => s.is_triggered_switch).length} triggered switches in your history.</p>
      </div>
    </div>
  );
}

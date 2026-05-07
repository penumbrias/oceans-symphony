import React, { useMemo, useState } from "react";
import { computeHabitSymptomCorrelation } from "@/lib/analyticsEngine";

function DeltaChip({ delta, isPositive }) {
  if (delta === null || Math.abs(delta) < 0.1) return <span className="text-xs text-muted-foreground">—</span>;
  // For negative symptoms: lower when habit done = good (green)
  // For positive symptoms: higher when habit done = good (green)
  const beneficial = isPositive ? delta > 0 : delta < 0;
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
      beneficial ? "bg-green-500/20 text-green-600 dark:text-green-400"
                 : "bg-orange-400/20 text-orange-600 dark:text-orange-400"
    }`}>
      {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
    </span>
  );
}

export default function HabitSymptomCorrelation({ symptomCheckIns, symptoms }) {
  const { habits, symptoms: regularSymptoms, result } = useMemo(
    () => computeHabitSymptomCorrelation(symptomCheckIns, symptoms),
    [symptomCheckIns, symptoms]
  );

  const [selectedHabitId, setSelectedHabitId] = useState(null);
  const [view, setView] = useState("sameday"); // "sameday" | "nextday"

  const symptomMap = useMemo(
    () => Object.fromEntries(regularSymptoms.map(s => [s.id, s])),
    [regularSymptoms]
  );

  if (!habits.length) {
    return (
      <div className="py-10 text-center space-y-1">
        <p className="text-sm text-muted-foreground">No habits set up yet.</p>
        <p className="text-xs text-muted-foreground">Add habits in Settings to track their effect on symptoms.</p>
      </div>
    );
  }

  const habitsWithData = habits.filter(h => result[h.id] && Object.keys(result[h.id]).length > 0);
  if (!habitsWithData.length) {
    return (
      <div className="py-10 text-center space-y-1">
        <p className="text-sm text-muted-foreground">Not enough overlapping data yet.</p>
        <p className="text-xs text-muted-foreground">Log both habits and symptoms on the same days to see correlations.</p>
      </div>
    );
  }

  const activeHabitId = selectedHabitId || habitsWithData[0]?.id;
  const activeHabit = habits.find(h => h.id === activeHabitId);
  const activeResult = result[activeHabitId] || {};

  const rows = regularSymptoms
    .filter(s => activeResult[s.id] !== undefined)
    .map(s => ({ symptom: s, data: activeResult[s.id] }))
    .sort((a, b) => {
      const da = view === "sameday" ? (a.data.delta ?? 0) : (a.data.nextDelta ?? 0);
      const db = view === "sameday" ? (b.data.delta ?? 0) : (b.data.nextDelta ?? 0);
      return Math.abs(db) - Math.abs(da);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Symptom levels on days a habit was completed vs missed. A negative delta on a negative symptom means
        the symptom was lower when the habit was done — a good sign.
      </p>

      {/* Habit selector */}
      <div className="flex flex-wrap gap-2">
        {habitsWithData.map(h => (
          <button
            key={h.id}
            onClick={() => setSelectedHabitId(h.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              h.id === activeHabitId
                ? "border-transparent text-white"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
            style={h.id === activeHabitId ? { backgroundColor: h.color || "#8b5cf6" } : {}}
          >
            {h.label}
          </button>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        {[{ id: "sameday", label: "Same day" }, { id: "nextday", label: "Next day" }].map(t => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              view === t.id
                ? "bg-primary text-primary-foreground border-transparent"
                : "border-border text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeHabit && rows.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/20">
                <th className="text-left px-3 py-2 font-semibold text-foreground">Symptom</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground">When done</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground">When missed</th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ symptom, data }, idx) => {
                const completedVal = view === "sameday" ? data.completedAvg : data.nextCompletedAvg;
                const missedVal = view === "sameday" ? data.missedAvg : data.nextMissedAvg;
                const delta = view === "sameday" ? data.delta : data.nextDelta;
                return (
                  <tr key={symptom.id} className={idx % 2 === 0 ? "bg-card/50" : "bg-muted/10"}>
                    <td className="px-3 py-2 border-b border-border/30">
                      <div className="flex items-center gap-1.5">
                        {symptom.color && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: symptom.color }} />}
                        <span className="font-medium">{symptom.label}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center border-b border-border/30 font-medium">
                      {completedVal !== null ? completedVal.toFixed(1) : "—"}
                    </td>
                    <td className="px-2 py-2 text-center border-b border-border/30 font-medium">
                      {missedVal !== null ? missedVal.toFixed(1) : "—"}
                    </td>
                    <td className="px-2 py-2 text-center border-b border-border/30">
                      <DeltaChip delta={delta} isPositive={symptom.is_positive} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Based on days where both habit and symptom data were logged.
        Differences under ±0.1 are too small to be meaningful.
      </p>
    </div>
  );
}

import React, { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { SYMPTOMS, HABITS } from "../SymptomsChecklistPanel";

const RATING_SYMPTOMS = SYMPTOMS.filter((s) => s.type === "rating");

// Which outcome metrics to compare against
const OUTCOMES = [
  { id: "overall_mood", label: "Overall Mood" },
  { id: "anxiety", label: "Anxiety" },
  { id: "depression", label: "Depression" },
  { id: "energy_levels", label: "Energy Levels" },
  { id: "emotional_misery", label: "Emotional Misery" },
];

export default function HabitImpactChart({ filteredCards }) {
  const [outcome, setOutcome] = useState("overall_mood");

  // For each habit, compute avg outcome when habit=true vs false
  const habitImpact = HABITS.map((h) => {
    const withHabit = [], withoutHabit = [];
    filteredCards.forEach((c) => {
      const habitVal = c.checklist?.habits?.[h.id];
      let outVal = c.checklist?.symptoms?.[outcome];
      // fallback to body_mind
      if (outVal === undefined && outcome === "emotional_misery") outVal = c.body_mind?.emotional_misery;
      if (outVal === undefined) return;
      if (habitVal === true) withHabit.push(outVal);
      else if (habitVal === false) withoutHabit.push(outVal);
    });
    const avg = (arr) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;
    return {
      label: h.label.replace(/^[^ ]+ /, ""),
      withHabit: avg(withHabit),
      withoutHabit: avg(withoutHabit),
      sampleWith: withHabit.length,
      sampleWithout: withoutHabit.length,
    };
  }).filter((d) => d.withHabit !== null || d.withoutHabit !== null);

  const outcomeLabel = OUTCOMES.find((o) => o.id === outcome)?.label;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground mb-2">Outcome metric:</p>
        <div className="flex flex-wrap gap-1.5">
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              onClick={() => setOutcome(o.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                outcome === o.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {habitImpact.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Not enough data yet — keep logging habits and outcomes.</p>
      ) : (
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <p className="text-sm font-medium mb-1">Avg <span className="text-primary">{outcomeLabel}</span> — with vs. without each habit</p>
          <p className="text-xs text-muted-foreground mb-4">Lower is better for anxiety/misery; higher is better for mood/energy.</p>
          <ResponsiveContainer width="100%" height={Math.max(220, habitImpact.length * 44)}>
            <BarChart data={habitImpact} layout="vertical" margin={{ left: 4, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v, name) => [v !== null ? `${v} / 5` : "N/A", name]}
              />
              <Bar dataKey="withHabit" name="✅ With habit" fill="#10b981" radius={[0, 4, 4, 0]} />
              <Bar dataKey="withoutHabit" name="❌ Without habit" fill="#f87171" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
import React from "react";
import { SYMPTOMS, HABITS } from "../SymptomsChecklistPanel";

const RATING_SYMPTOMS = SYMPTOMS.filter((s) => s.type === "rating");

function StatCard({ label, value, sub, color = "text-primary" }) {
  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function TrendBadge({ val, prev, lowerBetter = false }) {
  if (val === null || prev === null) return null;
  const diff = val - prev;
  const improved = lowerBetter ? diff < 0 : diff > 0;
  if (Math.abs(diff) < 0.1) return <span className="text-xs text-muted-foreground ml-1">→</span>;
  return (
    <span className={`text-xs ml-1 font-medium ${improved ? "text-green-500" : "text-red-400"}`}>
      {diff > 0 ? `▲ ${diff.toFixed(1)}` : `▼ ${Math.abs(diff).toFixed(1)}`}
    </span>
  );
}

function avgOf(cards, getter) {
  const vals = cards.map(getter).filter((v) => v !== undefined && v !== null);
  return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
}

export default function WellnessOverview({ filteredCards, allCards }) {
  // Split into first half vs second half to show trajectory
  const mid = Math.floor(filteredCards.length / 2);
  const firstHalf = filteredCards.slice(0, mid);
  const secondHalf = filteredCards.slice(mid);

  const current = (sym) => avgOf(secondHalf.length ? secondHalf : filteredCards, (c) => c.checklist?.symptoms?.[sym]);
  const previous = (sym) => avgOf(firstHalf, (c) => c.checklist?.symptoms?.[sym]);

  // Habit streaks — how many consecutive recent days the habit was true
  const streaks = HABITS.map((h) => {
    let streak = 0;
    const sorted = [...filteredCards].reverse(); // most recent first
    for (const c of sorted) {
      if (c.checklist?.habits?.[h.id] === true) streak++;
      else break;
    }
    return { label: h.label, streak };
  }).filter((s) => s.streak > 0).sort((a, b) => b.streak - a.streak);

  // Boolean symptom % for recent cards
  const symptomPcts = SYMPTOMS.filter((s) => s.type === "boolean").map((s) => {
    const vals = filteredCards.map((c) => c.checklist?.symptoms?.[s.id]).filter((v) => v !== undefined);
    if (!vals.length) return null;
    const pct = Math.round((vals.filter(Boolean).length / vals.length) * 100);
    return { label: s.label, pct };
  }).filter(Boolean).sort((a, b) => b.pct - a.pct);

  const totalEntries = filteredCards.length;
  const mood = current("overall_mood");
  const anxiety = current("anxiety");
  const moodPrev = previous("overall_mood");
  const anxietyPrev = previous("anxiety");

  return (
    <div className="space-y-5">
      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Entries logged" value={totalEntries} sub="in selected range" />
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Avg mood</p>
          <div className="flex items-baseline gap-1">
            <p className="text-2xl font-bold text-primary">{mood ?? "—"}</p>
            <TrendBadge val={mood} prev={moodPrev} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">out of 5</p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Avg anxiety</p>
          <div className="flex items-baseline gap-1">
            <p className="text-2xl font-bold text-orange-500">{anxiety ?? "—"}</p>
            <TrendBadge val={anxiety} prev={anxietyPrev} lowerBetter />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">out of 5</p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Avg skills practiced</p>
          <p className="text-2xl font-bold text-purple-500">
            {avgOf(filteredCards, (c) => c.skills_practiced) ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">per day</p>
        </div>
      </div>

      {/* All rating averages */}
      <div className="bg-card border border-border/50 rounded-xl p-4">
        <p className="text-sm font-medium mb-3">Average ratings</p>
        <div className="space-y-2">
          {RATING_SYMPTOMS.map((s) => {
            const val = current(s.id);
            const prev = previous(s.id);
            if (val === null) return null;
            const lowerBetter = ["anxiety", "depression", "feeling_overwhelmed", "feeling_irritable", "emotional_numbness", "lack_of_motivation", "trouble_sleeping", "feeling_manic"].includes(s.id);
            const pct = (val / 5) * 100;
            const color = lowerBetter
              ? val >= 3.5 ? "#ef4444" : val >= 2 ? "#f59e0b" : "#10b981"
              : val >= 3.5 ? "#10b981" : val >= 2 ? "#f59e0b" : "#ef4444";
            return (
              <div key={s.id} className="flex items-center gap-3">
                <span className="text-xs w-36 text-muted-foreground truncate">{s.label}</span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="text-xs w-8 text-right font-medium">{val}</span>
                <TrendBadge val={val} prev={prev} lowerBetter={lowerBetter} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Habit streaks */}
      {streaks.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <p className="text-sm font-medium mb-3">🔥 Current habit streaks</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {streaks.map((s) => (
              <div key={s.label} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                <span className="text-lg">{s.label.split(" ")[0]}</span>
                <div>
                  <p className="text-xs font-medium">{s.label.replace(/^[^ ]+ /, "")}</p>
                  <p className="text-xs text-primary font-bold">{s.streak}d streak</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top symptoms this period */}
      {symptomPcts.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <p className="text-sm font-medium mb-3">Symptom presence this period</p>
          <div className="space-y-2">
            {symptomPcts.slice(0, 8).map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="text-xs w-48 text-muted-foreground truncate">{s.label}</span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${s.pct}%`,
                      background: s.pct > 60 ? "#ef4444" : s.pct > 30 ? "#f59e0b" : "#10b981",
                    }}
                  />
                </div>
                <span className="text-xs w-8 text-right font-medium">{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
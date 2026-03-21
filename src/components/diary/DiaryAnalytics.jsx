import React, { useState, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format, parseISO, subDays } from "date-fns";
import { SYMPTOMS, HABITS } from "./SymptomsChecklistPanel";

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "All", days: 365 },
];

const RATING_SYMPTOMS = SYMPTOMS.filter((s) => s.type === "rating");
const BOOLEAN_SYMPTOMS = SYMPTOMS.filter((s) => s.type === "boolean");

export default function DiaryAnalytics({ cards }) {
  const [rangeDays, setRangeDays] = useState(14);
  const [activeTab, setActiveTab] = useState("ratings");

  const cutoff = subDays(new Date(), rangeDays);

  const filteredCards = useMemo(() =>
    cards
      .filter((c) => c.date && parseISO(c.date) >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [cards, rangeDays]
  );

  // Build time-series for rating symptoms
  const ratingData = useMemo(() => {
    return filteredCards.map((c) => {
      const s = c.checklist?.symptoms || {};
      const row = { date: format(parseISO(c.date), "MMM d") };
      RATING_SYMPTOMS.forEach((sym) => {
        if (s[sym.id] !== undefined) row[sym.id] = s[sym.id];
      });
      // also body_mind
      if (c.body_mind?.emotional_misery !== undefined) row.emotional_misery = c.body_mind.emotional_misery;
      if (c.body_mind?.joy !== undefined) row.joy = c.body_mind.joy;
      if (c.urges?.self_harm !== undefined) row.self_harm_urge = c.urges.self_harm;
      return row;
    });
  }, [filteredCards]);

  // Build frequency counts for boolean symptoms
  const booleanData = useMemo(() => {
    const counts = {};
    [...BOOLEAN_SYMPTOMS, ...HABITS].forEach((s) => { counts[s.id] = { yes: 0, no: 0, label: s.label.replace(/^[^ ]+ /, "") }; });
    filteredCards.forEach((c) => {
      const s = c.checklist?.symptoms || {};
      const h = c.checklist?.habits || {};
      BOOLEAN_SYMPTOMS.forEach((sym) => {
        if (s[sym.id] === true) counts[sym.id].yes++;
        else if (s[sym.id] === false) counts[sym.id].no++;
      });
      HABITS.forEach((hab) => {
        if (h[hab.id] === true) counts[hab.id].yes++;
        else if (h[hab.id] === false) counts[hab.id].no++;
      });
    });
    return Object.entries(counts)
      .filter(([, v]) => v.yes + v.no > 0)
      .map(([id, v]) => ({ id, label: v.label, yes: v.yes, no: v.no, total: v.yes + v.no, pct: Math.round((v.yes / (v.yes + v.no)) * 100) }))
      .sort((a, b) => b.pct - a.pct);
  }, [filteredCards]);

  const COLORS = ["#7c3aed", "#db2777", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#6366f1"];

  // Which rating lines to show — pick top ones by data presence
  const activeRatingLines = useMemo(() => {
    const counts = {};
    ratingData.forEach((row) => {
      RATING_SYMPTOMS.forEach((s) => { if (row[s.id] !== undefined) counts[s.id] = (counts[s.id] || 0) + 1; });
    });
    return RATING_SYMPTOMS.filter((s) => counts[s.id] > 0).slice(0, 6);
  }, [ratingData]);

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground text-sm">No diary cards yet — fill out a few daily cards to see analytics here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Range picker */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Range:</span>
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.label}
              onClick={() => setRangeDays(r.days)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                rangeDays === r.days ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filteredCards.length} entries</span>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit">
        {[["ratings", "📈 Ratings over time"], ["boolean", "✅ Symptoms & habits"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "ratings" && (
        <div className="space-y-4">
          {filteredCards.length < 2 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Need at least 2 entries to show trends.</p>
          ) : activeRatingLines.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No rating data logged yet.</p>
          ) : (
            <div className="bg-card border border-border/50 rounded-xl p-4">
              <p className="text-sm font-medium mb-4">Symptom ratings (0–5)</p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={ratingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {activeRatingLines.map((s, i) => (
                    <Line
                      key={s.id}
                      type="monotone"
                      dataKey={s.id}
                      name={s.label}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {activeTab === "boolean" && (
        <div className="space-y-4">
          {booleanData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No symptom/habit data logged yet.</p>
          ) : (
            <div className="bg-card border border-border/50 rounded-xl p-4">
              <p className="text-sm font-medium mb-4">Symptom & habit frequency (% days "Yes")</p>
              <ResponsiveContainer width="100%" height={Math.max(220, booleanData.length * 28)}>
                <BarChart data={booleanData} layout="vertical" margin={{ left: 4, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v, name, props) => [`${v}% (${props.payload.yes}/${props.payload.total} days)`, "Yes"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="pct" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
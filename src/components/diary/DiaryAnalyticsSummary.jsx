import React, { useState, useMemo } from "react";
import { format, parseISO, subDays } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell,
} from "recharts";

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "All", days: 3650 },
];

const EMOTION_COLORS = [
  "#8b5cf6", "#3b82f6", "#14b8a6", "#f59e0b", "#ec4899",
  "#ef4444", "#22c55e", "#f97316", "#6366f1", "#a78bfa",
];

function truncate(str, n = 12) {
  return str && str.length > n ? str.slice(0, n) + "…" : str;
}

export default function DiaryAnalyticsSummary({ cards }) {
  const [rangeDays, setRangeDays] = useState(14);

  const filtered = useMemo(() => {
    const cutoff = subDays(new Date(), rangeDays).getTime();
    return cards
      .filter(c => c.date && new Date(c.date).getTime() >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [cards, rangeDays]);

  // Mood trend: emotional_misery and joy over time
  const moodTrend = useMemo(() => {
    return filtered
      .filter(c => c.body_mind?.emotional_misery !== undefined || c.body_mind?.joy !== undefined)
      .map(c => ({
        date: format(parseISO(c.date), "MMM d"),
        misery: c.body_mind?.emotional_misery,
        joy: c.body_mind?.joy,
      }));
  }, [filtered]);

  // Top emotions frequency
  const topEmotions = useMemo(() => {
    const freq = {};
    filtered.forEach(c => (c.emotions || []).forEach(e => { freq[e] = (freq[e] || 0) + 1; }));
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));
  }, [filtered]);

  // Symptom frequency table
  const symptomFreq = useMemo(() => {
    const freq = {};
    filtered.forEach(c => {
      const syms = { ...(c.checklist?.symptoms || {}), ...(c.checklist?.habits || {}) };
      Object.entries(syms).forEach(([key, val]) => {
        if (val === undefined || val === null || val === false) return;
        if (!freq[key]) freq[key] = { count: 0, total: 0, entries: 0 };
        freq[key].entries++;
        if (typeof val === "number") { freq[key].total += val; freq[key].count++; }
        else if (val === true) freq[key].count++;
      });
    });
    return Object.entries(freq)
      .map(([key, v]) => ({
        label: key.replace(/_/g, " "),
        count: v.count,
        avg: v.entries > 0 ? (v.total / v.entries).toFixed(1) : null,
        pct: Math.round((v.count / (filtered.length || 1)) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [filtered]);

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
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Range:</span>
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl">
          {RANGE_OPTIONS.map(r => (
            <button key={r.label} onClick={() => setRangeDays(r.days)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${rangeDays === r.days ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} entries</span>
      </div>

      {/* Mood Trend Line Chart */}
      <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold">Mood Trend</p>
          <p className="text-xs text-muted-foreground">Emotional misery vs. joy over time</p>
        </div>
        {moodTrend.length < 2 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Need at least 2 rated entries to show trend.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={moodTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => truncate(v, 6)} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} width={24} />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="misery" name="Misery" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="joy" name="Joy" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top Emotions Bar Chart */}
      <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold">Top Emotions</p>
          <p className="text-xs text-muted-foreground">Most frequently logged emotions</p>
        </div>
        {topEmotions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No emotion data in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topEmotions} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={90}
                tickFormatter={v => truncate(v, 12)} />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="count" name="Times logged" radius={[0, 4, 4, 0]}>
                {topEmotions.map((_, i) => (
                  <Cell key={i} fill={EMOTION_COLORS[i % EMOTION_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Symptom Frequency Table */}
      <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold">Symptom & Habit Frequency</p>
          <p className="text-xs text-muted-foreground">How often each symptom or habit was logged</p>
        </div>
        {symptomFreq.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No symptom data in this range.</p>
        ) : (
          <div className="space-y-2">
            {symptomFreq.map(({ label, count, avg, pct }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-foreground capitalize w-32 flex-shrink-0 truncate" title={label}>
                  {truncate(label, 16)}
                </span>
                <div className="flex-1 bg-muted/50 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right flex-shrink-0">
                  {count}x {avg !== null ? `(avg ${avg})` : `(${pct}%)`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}